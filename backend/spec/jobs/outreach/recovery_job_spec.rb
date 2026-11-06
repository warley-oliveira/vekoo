require "rails_helper"

RSpec.describe Outreach::RecoveryJob do
  let(:organization) { create(:organization) }
  let(:connector) { create(:connector_whatsapp_web, organization: organization) }
  let(:campaign) { create(:outreach_campaign, :running, organization: organization, connector_ids: [ connector.id.to_s ]) }

  def recover
    described_class.perform_now
  end

  it "está no agendamento recorrente" do
    schedule = YAML.load_file(Rails.root.join("config/schedule/outreach.yml"))

    expect(schedule.dig("outreach_recovery", "class")).to eq("Outreach::RecoveryJob")
    expect(schedule.dig("outreach_recovery", "enabled")).to be(true)
  end

  it "fica na fila de campanhas" do
    expect(described_class.new.queue_name).to eq("campaigns")
  end

  # O cenário inteiro: o worker morreu com um destinatário no meio e o encadeamento parado.
  describe "queda de worker no meio do envio" do
    let(:recipients) { create_list(:outreach_recipient, 3, campaign: campaign) }
    let(:chat) { create(:chat, connector: connector, organization_id: organization.id, external_id: recipients.first.phone) }
    let!(:batch) { build_batch(campaign, recipients, connector: connector, status_cd: "processing", next_send_at: 20.minutes.ago) }

    before { stub_channel_working(connector) }

    context "depois de o canal aceitar a mensagem" do
      before do
        recipients.first.set(status_cd: "sending", claim_token: "t", claimed_at: 20.minutes.ago, dispatched_at: 20.minutes.ago, chat_id: chat.id.to_s)
        create(:chat_text_message, chat: chat, role: "assistant", message_id: "EVO-JA-SAIU", campaign_id: campaign.id.to_s)
      end

      it "não manda de novo: o destinatário fica enviado, e a campanha segue" do
        recover

        expect(recipients.first.reload).to have_attributes(status_cd: "sent", whatsapp_message_id: "EVO-JA-SAIU")
        expect(enqueued_steps.size).to eq(1)

        run_step(batch.reload)

        expect(recipients.second.reload.status_cd).to eq("sent")
        expect(a_request(:post, evolution_text_url(connector)).with { |request| JSON.parse(request.body)["number"].start_with?(recipients.first.phone) }).not_to have_been_made
      end
    end

    context "antes de falar com o canal" do
      before { recipients.first.set(status_cd: "sending", claim_token: "t", claimed_at: 20.minutes.ago) }

      it "tenta de novo e envia uma vez" do
        recover
        run_step(batch.reload)

        expect(recipients.first.reload.status_cd).to eq("sent")
        expect(a_request(:post, evolution_text_url(connector))).to have_been_made.once
      end
    end

    context "no meio da conversa com o canal" do
      before do
        recipients.first.set(status_cd: "sending", claim_token: "t", claimed_at: 20.minutes.ago, dispatched_at: 20.minutes.ago, chat_id: chat.id.to_s)
      end

      it "na dúvida, marca como interrompido e não reenvia" do
        recover

        expect(recipients.first.reload).to have_attributes(status_cd: "failed", error_code: "interrupted")
        expect(a_request(:post, evolution_text_url(connector))).not_to have_been_made
      end
    end

    it "rodar a recuperação de novo não muda nada" do
      recipients.first.set(status_cd: "sending", claim_token: "t", claimed_at: 20.minutes.ago)

      2.times { recover }
      clear_enqueued_jobs
      recover

      expect(enqueued_steps).to be_empty
    end
  end

  describe "campanha agendada que ficou para trás" do
    let!(:missed) { create(:outreach_campaign, :scheduled, organization: organization, scheduled_at: 1.hour.ago) }

    it "enfileira o lançamento, com o token" do
      expect { recover }.to have_enqueued_job(Outreach::ScheduledLaunchJob).with(missed.id.to_s, organization.id, missed.run_token)
    end

    it "a que ainda não chegou a hora fica como está" do
      future = create(:outreach_campaign, :scheduled, organization: organization, scheduled_at: 1.hour.from_now)

      expect { recover }.not_to have_enqueued_job(Outreach::ScheduledLaunchJob).with(future.id.to_s, anything, anything)
    end
  end

  describe "extração parada" do
    it "falha a que parou há tempo demais, para a tela não esperar para sempre" do
      extraction = create(:outreach_place_extraction, organization: organization, status: "running")
      extraction.set(updated_at: 1.hour.ago)

      recover

      expect(extraction.reload).to have_attributes(status: "failed", error_code: "interrupted")
    end

    it "avisa pelo canal" do
      extraction = create(:outreach_place_extraction, organization: organization, status: "running")
      extraction.set(updated_at: 1.hour.ago)
      stream = PlaceExtractionChannel.organization_stream(organization.id, PlaceExtractionChannel::STREAM)

      expect { recover }.to have_broadcasted_to(stream).with(hash_including(action: "status_update"))
    end

    it "a recente fica como está" do
      extraction = create(:outreach_place_extraction, organization: organization, status: "running")

      recover

      expect(extraction.reload.status).to eq("running")
    end

    it "a concluída fica como está" do
      extraction = create(:outreach_place_extraction, :completed, organization: organization)
      extraction.set(updated_at: 1.hour.ago)

      recover

      expect(extraction.reload.status).to eq("completed")
    end
  end

  it "uma campanha com problema não impede as outras" do
    broken = create(:outreach_campaign, :running, organization: organization)
    create(:outreach_recipient, campaign: broken)
    healthy = create(:outreach_campaign, :running, organization: organization, connector_ids: [ connector.id.to_s ])
    create(:outreach_recipient, campaign: healthy)

    allow(Outreach::Reconciler).to receive(:new).and_wrap_original do |original, campaign|
      raise Mongo::Error::SocketError, "caiu" if campaign.id == broken.id

      original.call(campaign)
    end

    expect { recover }.not_to raise_error
    expect(healthy.batches.count).to eq(1)
  end
end
