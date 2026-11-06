require "rails_helper"

RSpec.describe Outreach::RecipientStatus do
  let(:campaign) { create(:outreach_campaign, :running, sent_count: 1) }
  let(:external_id) { "wamid.1" }
  let(:recipient_status) { "sent" }
  let!(:recipient) { create(:outreach_recipient, campaign: campaign, status_cd: recipient_status, whatsapp_message_id: external_id) }

  def apply(status, **options)
    described_class.apply(external_id, status, organization_id: campaign.organization_id, **options)
    recipient.reload
  end

  it "busca pelo id do provedor" do
    create(:outreach_recipient, campaign: campaign, status_cd: "sent", whatsapp_message_id: "outro")

    expect(apply("delivery_ack").status_cd).to eq("delivered")
    expect(Outreach::Recipient.where(whatsapp_message_id: "outro").take.status_cd).to eq("sent")
  end

  # O id do provedor vem de fora: o webhook de um conector não alcança campanha de outra organização.
  it "não mexe no destinatário de outra organização" do
    described_class.apply(external_id, "read", organization_id: create(:organization).id)

    expect(recipient.reload.status_cd).to eq("sent")
    expect(campaign.reload.read_count).to eq(0)
  end

  it "sem id ou sem destinatário, não faz nada" do
    expect { described_class.apply(nil, "read", organization_id: campaign.organization_id) }.not_to raise_error
    expect { described_class.apply("nao-existe", "read", organization_id: campaign.organization_id) }.not_to raise_error
  end

  describe "entregue" do
    it "avança e conta" do
      expect(apply("delivery_ack")).to have_attributes(status_cd: "delivered", delivered_at: be_present)
      expect(campaign.reload.delivered_count).to eq(1)
    end

    it "aceita o nome usado pelo destinatário" do
      expect(apply("delivered").status_cd).to eq("delivered")
    end

    it "repetido, conta uma vez" do
      2.times { apply("delivery_ack") }

      expect(campaign.reload.delivered_count).to eq(1)
    end
  end

  describe "lido" do
    it "pulando direto de enviado, conta a entrega também" do
      expect(apply("read")).to have_attributes(status_cd: "read", delivered_at: be_present, read_at: be_present)
      expect(campaign.reload).to have_attributes(delivered_count: 1, read_count: 1)
    end

    context "já entregue" do
      let(:recipient_status) { "delivered" }

      it "conta só a leitura" do
        expect(apply("read")).to have_attributes(status_cd: "read", read_at: be_present)
        expect(campaign.reload).to have_attributes(delivered_count: 0, read_count: 1)
      end
    end
  end

  describe "fora de ordem" do
    context "já lido" do
      let(:recipient_status) { "read" }

      it "entregue não regride" do
        expect(apply("delivery_ack").status_cd).to eq("read")
        expect(campaign.reload.delivered_count).to eq(0)
      end
    end

    it "server_ack depois de enviado não muda nada" do
      expect(apply("server_ack").status_cd).to eq("sent")
    end

    it "status desconhecido não muda nada" do
      expect(apply("played").status_cd).to eq("sent")
    end
  end

  describe "falha" do
    it "marca, guarda o motivo e conta" do
      expect(apply("failed", error_message: "Mensagem não entregue")).to have_attributes(status_cd: "failed", error_code: "whatsappError", error_message: "Mensagem não entregue")
      expect(campaign.reload.failed_count).to eq(1)
    end

    # `sent_count` conta o que o provedor aceitou.
    it "não desfaz o enviado" do
      apply("failed")

      expect(campaign.reload.sent_count).to eq(1)
    end

    context "já falho" do
      let(:recipient_status) { "failed" }

      it "não conta duas vezes" do
        apply("failed")

        expect(campaign.reload.failed_count).to eq(0)
      end

      it "`failed` é terminal: entregue depois não reverte" do
        expect(apply("delivery_ack").status_cd).to eq("failed")
      end
    end

    it "corta um motivo longo" do
      expect(apply("failed", error_message: "x" * 400).error_message.length).to eq(Outreach::Recipient::ERROR_MESSAGE_LIMIT)
    end
  end

  # Dois eventos do mesmo destinatário chegando em dois jobs ao mesmo tempo.
  describe "concorrência" do
    it "de dois `delivered` iguais em paralelo, conta um" do
      Array.new(4) { Thread.new { described_class.apply(external_id, "delivery_ack", organization_id: campaign.organization_id) } }.each(&:join)

      expect(campaign.reload.delivered_count).to eq(1)
    end

    it "`read` não se perde quando `delivered` troca o estado no mesmo instante" do
      service = described_class.new(external_id, "read", campaign.organization_id, nil)
      other_job_ran = false

      # A leitura enxergou `sent`, mas outro job grava `delivered` antes da troca.
      allow(service).to receive(:swap).and_wrap_original do |original, target, **change|
        unless other_job_ran
          other_job_ran = true
          Outreach::Recipient.collection.update_one({ _id: recipient.id }, { "$set" => { status_cd: "delivered" } })
          Outreach::Campaign.where(_id: campaign.id).inc(delivered_count: 1)
        end

        original.call(target, **change)
      end

      service.call

      expect(recipient.reload.status_cd).to eq("read")
      expect(campaign.reload).to have_attributes(delivered_count: 1, read_count: 1)
    end
  end

  it "transmite o destinatário e o progresso para o monitor" do
    stream = CampaignChannel.organization_stream(campaign.organization_id, CampaignChannel.stream_for_campaign(campaign.id))

    expect { apply("read") }.to have_broadcasted_to(stream).twice
  end
end
