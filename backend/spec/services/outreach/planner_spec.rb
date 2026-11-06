require "rails_helper"

RSpec.describe Outreach::Planner do
  let(:organization) { create(:organization) }
  let(:connector) { create(:connector_whatsapp_web, organization: organization) }
  let(:other_connector) { create(:connector_whatsapp_web, organization: organization) }
  let(:connectors) { [ connector ] }
  let(:campaign) do
    create(:outreach_campaign, :running, organization: organization, connector_ids: connectors.map { |item| item.id.to_s }, batch_size: 2)
  end

  def plan
    described_class.new(campaign, Outreach::Channels.for(campaign).active).call
  end

  it "divide em lotes do tamanho pedido, na ordem de entrada" do
    recipients = create_list(:outreach_recipient, 5, campaign: campaign)

    expect(plan).to eq(5)

    batches = campaign.batches.order_by(sequence: 1).to_a
    expect(batches.map(&:recipient_ids)).to eq(recipients.map(&:id).each_slice(2).to_a)
    expect(batches.map(&:sequence)).to eq([ 0, 1, 2 ])
    expect(batches.map(&:position_offset)).to eq([ 0, 2, 4 ])
  end

  it "guarda o canal em cada lote" do
    create(:outreach_recipient, campaign: campaign)

    plan

    expect(campaign.batches.first).to have_attributes(connector_id: connector.id.to_s, channel_key: "#{connector.id}:", status_cd: "scheduled")
  end

  # O que o `CLAUDE.md` da origem proíbe: um `perform_at` por destinatário.
  it "agenda um único job, por maior que seja a lista" do
    create_list(:outreach_recipient, 7, campaign: campaign)

    plan

    expect(enqueued_steps.size).to eq(1)
  end

  it "só o primeiro lote de cada canal tem horário" do
    create_list(:outreach_recipient, 5, campaign: campaign)

    plan

    batches = campaign.batches.order_by(sequence: 1).to_a
    expect(batches.first.scheduled_at).to be_present
    expect(batches.drop(1).map(&:scheduled_at)).to all(be_nil)
  end

  it "não escreve nos destinatários" do
    recipient = create(:outreach_recipient, campaign: campaign)
    updated_at = recipient.reload.updated_at

    travel(1.minute) { plan }

    expect(recipient.reload.updated_at).to eq(updated_at)
  end

  context "com dois canais" do
    let(:connectors) { [ connector, other_connector ] }

    it "reparte alternando, um job por canal" do
      recipients = create_list(:outreach_recipient, 4, campaign: campaign)

      plan

      expect(enqueued_steps.size).to eq(2)
      expect(campaign.batches.where(connector_id: connector.id.to_s).first.recipient_ids).to eq([ recipients[0].id, recipients[2].id ])
      expect(campaign.batches.where(connector_id: other_connector.id.to_s).first.recipient_ids).to eq([ recipients[1].id, recipients[3].id ])
    end

    it "cada canal tem a própria sequência" do
      create_list(:outreach_recipient, 6, campaign: campaign)

      plan

      [ connector, other_connector ].each do |item|
        expect(campaign.batches.where(connector_id: item.id.to_s).pluck(:sequence)).to contain_exactly(0, 1)
      end
    end
  end

  context "com vários números da WABA" do
    let(:waba) { create(:connector_whatsapp_cloud, organization: organization) }
    let(:template) { create(:whatsapp_template, connector: waba) }
    let(:campaign) do
      create(
        :outreach_campaign, :running,
        organization: organization, campaign_mode_cd: "template", messages: [], batch_size: 2,
        waba_connector_id: waba.id.to_s, phone_number_ids: %w[111 222], template_ids: [ template.id.to_s ]
      )
    end

    it "cada número é um canal" do
      create_list(:outreach_recipient, 4, campaign: campaign)

      plan

      expect(campaign.batches.pluck(:phone_number_id)).to contain_exactly("111", "222")
      expect(campaign.batches.pluck(:channel_key)).to contain_exactly("#{waba.id}:111", "#{waba.id}:222")
      expect(enqueued_steps.size).to eq(2)
    end
  end

  describe "horário" do
    it "começa agora, com a janela aberta" do
      create(:outreach_recipient, campaign: campaign)

      freeze_time do
        plan

        expect(Time.iso8601(enqueued_steps.first["scheduled_at"])).to eq(Time.current)
      end
    end

    it "com a janela fechada, começa quando ela abre" do
      campaign.set(send_start_hour: 9, send_end_hour: 18, send_days: [ 1, 2, 3, 4, 5 ])
      create(:outreach_recipient, campaign: campaign)
      night = ActiveSupport::TimeZone["America/Sao_Paulo"].local(2026, 11, 9, 22)

      travel_to(night) do
        plan

        expect(Time.iso8601(enqueued_steps.first["scheduled_at"])).to eq(night.change(hour: 9) + 1.day)
      end
    end

    it "grava a previsão de término" do
      create_list(:outreach_recipient, 3, campaign: campaign)

      freeze_time do
        plan

        expect(campaign.reload.estimated_completion_at).to eq(2.seconds.from_now)
      end
    end

    it "a previsão conta o que o canal já enviou hoje" do
      campaign.set(daily_limit_per_connector: 10, send_start_hour: 9, send_end_hour: 18)
      create(:outreach_recipient, campaign: campaign)
      morning = ActiveSupport::TimeZone["America/Sao_Paulo"].local(2026, 11, 9, 10)

      travel_to(morning) do
        10.times { Outreach::ChannelUsage.reserve("#{connector.id}:", "2026-11-09", 10) }

        plan

        expect(campaign.reload.estimated_completion_at).to eq(morning.change(hour: 9) + 1.day)
      end
    end
  end

  describe "ao montar de novo" do
    it "só entra quem ainda está pendente" do
      recipients = create_list(:outreach_recipient, 3, campaign: campaign)
      recipients.first.set(status_cd: "sent")
      recipients.second.set(status_cd: "sending")

      plan

      expect(campaign.batches.first.recipient_ids).to eq([ recipients.third.id ])
    end

    it "descarta o plano anterior, mas não o histórico do que terminou" do
      create(:outreach_batch, campaign: campaign, status_cd: "completed")
      unfinished = create(:outreach_batch, campaign: campaign, status_cd: "scheduled")
      failed = create(:outreach_batch, campaign: campaign, status_cd: "failed")
      create(:outreach_recipient, campaign: campaign)

      plan

      expect(Outreach::Batch.where(:_id.in => [ unfinished.id, failed.id ]).count).to eq(0)
      expect(campaign.batches.completed.count).to eq(1)
    end

    it "sem ninguém pendente, não monta nada" do
      create(:outreach_recipient, campaign: campaign, status_cd: "sent")

      expect(plan).to eq(0)
      expect(campaign.batches.count).to eq(0)
      expect(enqueued_steps).to be_empty
    end
  end
end
