require "rails_helper"

RSpec.describe Outreach::BatchJob do
  let(:organization) { create(:organization) }
  let(:connector) { create(:connector_whatsapp_web, organization: organization) }
  let(:campaign) { create(:outreach_campaign, :running, organization: organization, connector_ids: [ connector.id.to_s ]) }
  let(:batch) { build_batch(campaign, [ create(:outreach_recipient, campaign: campaign) ], connector: connector) }

  it "fica na fila de campanhas" do
    expect(described_class.new.queue_name).to eq("campaigns")
  end

  it "leva o escopo, o lote e o token, no horário pedido" do
    freeze_time do
      expect { described_class.enqueue_step(campaign, batch, at: 30.seconds.from_now) }
        .to have_enqueued_job(described_class)
        .with(campaign.id.to_s, organization.id, batch.id.to_s, campaign.run_token)
        .at(30.seconds.from_now)
        .on_queue("campaigns")
    end
  end

  it "executa o passo" do
    stub_channel_working(connector)

    described_class.perform_now(campaign.id.to_s, organization.id, batch.id.to_s, campaign.run_token)

    expect(campaign.reload.sent_count).to eq(1)
  end

  # Teto baixo: quem tenta sem parar é a recuperação, de 10 em 10 minutos.
  it "um erro de infraestrutura tenta de novo, com teto" do
    allow(Outreach::BatchExecutionService).to receive(:new).and_raise(Mongo::Error::SocketError, "caiu")

    expect { described_class.perform_now(campaign.id.to_s, organization.id, batch.id.to_s, campaign.run_token) }
      .to have_enqueued_job(described_class)
  end

  it "esgotadas as tentativas, desiste sem subir para o Sidekiq" do
    allow(Outreach::BatchExecutionService).to receive(:new).and_raise(Mongo::Error::SocketError, "caiu")
    job = described_class.new(campaign.id.to_s, organization.id, batch.id.to_s, campaign.run_token)
    job.executions = 2

    expect { job.perform_now }.not_to raise_error
  end
end
