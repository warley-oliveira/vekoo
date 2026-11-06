require "rails_helper"

# "Recuperação não pode mandar duas vezes para o mesmo destinatário." A origem devolvia todo mundo
# para `pending` depois de 15 minutos, e quem tinha recebido recebia de novo.
RSpec.describe Outreach::StuckRecipients do
  let(:organization) { create(:organization) }
  let(:connector) { create(:connector_whatsapp_web, organization: organization) }
  let(:campaign) { create(:outreach_campaign, :running, organization: organization, connector_ids: [ connector.id.to_s ]) }
  let(:chat) { create(:chat, connector: connector, organization_id: organization.id) }

  def stuck(claimed_at: 20.minutes.ago, **attributes)
    create(
      :outreach_recipient,
      campaign: campaign,
      status_cd: "sending",
      claim_token: "token-da-tomada",
      claimed_at: claimed_at,
      **attributes
    )
  end

  def recover
    described_class.new.call
  end

  describe "sem marca de despacho: comprovadamente não saiu" do
    it "volta para a fila" do
      recipient = stuck

      recover

      expect(recipient.reload).to have_attributes(status_cd: "pending", claim_token: nil, claimed_at: nil)
    end

    it "não conta nada" do
      stuck

      recover

      expect(campaign.reload).to have_attributes(sent_count: 0, failed_count: 0)
    end

    it "em campanha cancelada, vira ignorado em vez de voltar para a fila" do
      recipient = stuck
      campaign.set(status_cd: "cancelled")

      recover

      expect(recipient.reload.status_cd).to eq("skipped")
    end
  end

  describe "com a marca de despacho: pode ter saído" do
    it "com o id do provedor no histórico, saiu: conta como enviado" do
      recipient = stuck(dispatched_at: 20.minutes.ago, chat_id: chat.id.to_s)
      create(:chat_text_message, chat: chat, role: "assistant", message_id: "EVO-1", campaign_id: campaign.id.to_s, status: "pending")

      recover

      expect(recipient.reload).to have_attributes(status_cd: "sent", whatsapp_message_id: "EVO-1")
      expect(campaign.reload.sent_count).to eq(1)
    end

    it "com a mensagem falha no histórico, fica falho com o motivo" do
      recipient = stuck(dispatched_at: 20.minutes.ago, chat_id: chat.id.to_s)
      create(:chat_text_message, chat: chat, role: "assistant", message_id: nil, campaign_id: campaign.id.to_s, status: "failed", status_message: "Número bloqueado")

      recover

      expect(recipient.reload).to have_attributes(status_cd: "failed", error_code: "whatsappError", error_message: "Número bloqueado")
    end

    it "com a mensagem sem id, na dúvida não reenvia" do
      recipient = stuck(dispatched_at: 20.minutes.ago, chat_id: chat.id.to_s)
      create(:chat_text_message, chat: chat, role: "assistant", message_id: nil, campaign_id: campaign.id.to_s, status: "pending")

      recover

      expect(recipient.reload).to have_attributes(status_cd: "failed", error_code: "interrupted")
      expect(campaign.reload.failed_count).to eq(1)
    end

    it "sem histórico nenhum, na dúvida não reenvia" do
      recipient = stuck(dispatched_at: 20.minutes.ago, chat_id: chat.id.to_s)

      recover

      expect(recipient.reload).to have_attributes(status_cd: "failed", error_code: "interrupted")
    end

    it "só olha as mensagens da conversa e da campanha" do
      recipient = stuck(dispatched_at: 20.minutes.ago, chat_id: chat.id.to_s)
      create(:chat_text_message, chat: chat, role: "assistant", message_id: "OUTRA", campaign_id: BSON::ObjectId.new.to_s)

      recover

      expect(recipient.reload.status_cd).to eq("failed")
    end

    it "avisa o monitor" do
      recipient = stuck(dispatched_at: 20.minutes.ago, chat_id: chat.id.to_s)
      stream = CampaignChannel.organization_stream(organization.id, CampaignChannel.stream_for_campaign(campaign.id))

      expect { recover }.to have_broadcasted_to(stream).at_least(:twice)
      expect(recipient.reload.status_cd).to eq("failed")
    end
  end

  describe "quem não está travado" do
    it "não mexe em quem começou há pouco" do
      recipient = stuck(claimed_at: 5.minutes.ago)

      recover

      expect(recipient.reload.status_cd).to eq("sending")
    end

    it "não mexe em quem já terminou" do
      recipient = create(:outreach_recipient, campaign: campaign, status_cd: "sent", claimed_at: 1.hour.ago)

      recover

      expect(recipient.reload.status_cd).to eq("sent")
    end
  end

  # A corrida: o envio estava só lento, e o despacho acontece depois de a recuperação ler.
  it "não devolve à fila quem despachou no último instante" do
    recipient = stuck
    service = described_class.new

    allow(service).to receive(:release).and_wrap_original do |original, target|
      Outreach::Recipient.collection.update_one({ _id: recipient.id }, { "$set" => { dispatched_at: Time.current } })
      original.call(target)
    end

    service.call

    expect(recipient.reload.status_cd).to eq("sending")
  end

  # E o outro lado: a recuperação devolveu, e o envio lento tenta seguir.
  it "o envio lento não sai depois de a recuperação devolver o destinatário" do
    recipient = stuck
    slow = Outreach::Recipient.find(recipient.id)

    recover

    expect(slow.mark_dispatched!(chat.id)).to be(false)
  end

  it "um destinatário com problema não impede os outros" do
    broken = stuck(dispatched_at: 20.minutes.ago, chat_id: chat.id.to_s)
    fine = stuck
    allow(ChatMessage::Base).to receive(:unscoped).and_raise(Mongo::Error::SocketError, "caiu")

    expect { recover }.not_to raise_error

    expect(broken.reload.status_cd).to eq("sending")
    expect(fine.reload.status_cd).to eq("pending")
  end
end
