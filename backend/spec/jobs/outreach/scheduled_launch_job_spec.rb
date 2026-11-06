require "rails_helper"

RSpec.describe Outreach::ScheduledLaunchJob do
  let(:organization) { create(:organization) }
  let(:creator) { create(:account, organization: organization) }
  let(:connector) { create(:connector_whatsapp_web, organization: organization) }
  let(:campaign) do
    create(:outreach_campaign, :scheduled, organization: organization, connector_ids: [ connector.id.to_s ], created_by_account_id: creator.id)
  end

  def perform(token: campaign.run_token)
    described_class.perform_now(campaign.id.to_s, organization.id, token)
  end

  it "fica na fila de campanhas" do
    expect(described_class.new.queue_name).to eq("campaigns")
  end

  context "com destinatários" do
    before { create(:outreach_recipient, campaign: campaign) }

    it "lança a campanha agendada" do
      perform

      expect(campaign.reload).to have_attributes(status_cd: "running", started_at: be_present)
      expect(enqueued_steps.size).to eq(1)
    end

    it "registra em nome de quem criou" do
      perform

      expect(campaign.activity_logs.where(action: "launched").take.account_id).to eq(creator.id)
    end

    it "campanha que não está mais agendada não é lançada" do
      campaign.set(status_cd: "cancelled")

      perform

      expect(campaign.reload.status_cd).to eq("cancelled")
      expect(enqueued_steps).to be_empty
    end

    # Cancelamento por token, sem desagendar nada no Redis.
    it "o token antigo não lança" do
      perform(token: "token-velho")

      expect(campaign.reload.status_cd).to eq("scheduled")
    end

    it "campanha de outra organização não é alcançada" do
      described_class.perform_now(campaign.id.to_s, create(:organization).id, campaign.run_token)

      expect(campaign.reload.status_cd).to eq("scheduled")
    end

    # Origem: 'Horário do primeiro CampaignSendJob'.
    it "o primeiro envio sai por volta do horário agendado" do
      scheduled_time = 1.hour.from_now.change(usec: 0)
      campaign.set(scheduled_at: scheduled_time)

      travel_to(scheduled_time) do
        perform

        expect(Time.iso8601(enqueued_steps.first["scheduled_at"])).to eq(scheduled_time)
      end
    end

    # O envio pode ser em horário fora da janela: o agendamento não fura a janela.
    it "agendada para fora da janela, espera ela abrir" do
      campaign.set(send_start_hour: 9, send_end_hour: 18, send_days: [ 1, 2, 3, 4, 5 ])
      night = ActiveSupport::TimeZone["America/Sao_Paulo"].local(2026, 11, 9, 22)

      travel_to(night) do
        perform

        expect(Time.iso8601(enqueued_steps.first["scheduled_at"])).to eq(night.change(hour: 9) + 1.day)
      end
    end

    # Origem: 'mantém o primeiro disparo no horário agendado e respeita o buffer'.
    it "os envios seguintes respeitam o intervalo" do
      campaign.set(buffer_min_seconds: 30, buffer_max_seconds: 30)
      create_list(:outreach_recipient, 2, campaign: campaign)
      stub_channel_working(connector)
      start = Time.current.change(usec: 0)

      travel_to(start)
      perform
      times = []

      3.times do
        job = enqueued_steps.first
        enqueued_jobs.delete(job)
        at = Time.iso8601(job["scheduled_at"])
        times << at
        travel_to(at)
        Outreach::BatchJob.new(*job["arguments"]).perform_now
      end

      expect(times.map(&:to_i)).to eq([ start.to_i, start.to_i + 30, start.to_i + 60 ])
    end
  end

  # Origem: 'Revert to draft so user can fix and relaunch'.
  context "quando não dá para lançar" do
    it "sem destinatários, volta para rascunho e diz o motivo" do
      perform

      expect(campaign.reload.status_cd).to eq("draft")
      expect(campaign.activity_logs.where(action: "launch_failed").take.metadata).to eq("code" => "noRecipients")
    end

    it "com o canal desconectado, volta para rascunho" do
      create(:outreach_recipient, campaign: campaign)
      connector.set(status_cd: "closed")

      perform

      expect(campaign.reload.status_cd).to eq("draft")
      expect(campaign.activity_logs.where(action: "launch_failed").take.metadata).to eq("code" => "connectorsDisconnected")
    end

    it "avisa quem criou: ninguém está olhando a essa hora" do
      perform

      notice = AccountNotice.where(account_id: creator.id).take
      expect(notice.title).to include(campaign.name)
      expect(notice.url).to eq("/campaigns/#{campaign.id}")
    end

    it "troca o token: um segundo agendamento não lança a campanha em edição" do
      old_token = campaign.run_token

      perform

      expect(campaign.reload.run_token).not_to eq(old_token)
    end

    # A corrida com a recuperação: quem perdeu não pode desfazer o lançamento de quem ganhou.
    it "quem perdeu para outro lançamento não volta a campanha para rascunho" do
      create(:outreach_recipient, campaign: campaign)
      allow(Outreach::LaunchService).to receive(:new).and_wrap_original do |original, *args, **options|
        winner = Outreach::Campaign.find(campaign.id)
        winner.transition!(from: :scheduled, to: :running)
        original.call(*args, **options)
      end

      perform

      expect(campaign.reload.status_cd).to eq("running")
      expect(campaign.activity_logs.where(action: "launch_failed").count).to eq(0)
    end
  end
end
