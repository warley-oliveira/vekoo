require "rails_helper"

RSpec.describe Outreach::RecipientReply do
  let(:organization) { create(:organization) }
  let(:connector) { create(:connector_whatsapp_web, organization: organization) }
  let(:campaign) { create(:outreach_campaign, :running, organization: organization) }
  let(:recipient) { create(:outreach_recipient, campaign: campaign, status_cd: "delivered") }
  let(:chat) do
    create(:chat, connector: connector, organization_id: organization.id, outreach_recipient_id: recipient.id.to_s)
  end

  it "marca quem respondeu e conta na campanha" do
    freeze_time do
      described_class.record(chat)

      expect(recipient.reload.replied_at).to eq(Time.current)
      expect(campaign.reload.replied_count).to eq(1)
    end
  end

  it "não muda o status: quem respondeu continua sendo quem recebeu" do
    described_class.record(chat)

    expect(recipient.reload.status_cd).to eq("delivered")
  end

  it "só a primeira resposta conta, e as seguintes não consultam nada" do
    described_class.record(chat)
    expect(chat.reload.outreach_recipient_id).to be_nil
    allow(Outreach::Recipient).to receive(:where).and_call_original

    described_class.record(chat)

    expect(Outreach::Recipient).not_to have_received(:where)
    expect(campaign.reload.replied_count).to eq(1)
  end

  it "conversa sem campanha não consulta nada" do
    plain = create(:chat, connector: connector, organization_id: organization.id)
    allow(Outreach::Recipient).to receive(:where).and_call_original

    described_class.record(plain)

    expect(Outreach::Recipient).not_to have_received(:where)
  end

  it "quem falhou não conta como resposta, e a conversa deixa de apontar para ele" do
    recipient.set(status_cd: "failed", error_code: "whatsappError")

    described_class.record(chat)

    expect(recipient.reload.replied_at).to be_nil
    expect(campaign.reload.replied_count).to eq(0)
    expect(chat.reload.outreach_recipient_id).to be_nil
  end

  it "responder antes de o envio terminar de gravar também conta" do
    recipient.set(status_cd: "sending")

    described_class.record(chat)

    expect(recipient.reload.replied_at).to be_present
    expect(campaign.reload.replied_count).to eq(1)
  end

  # O ponteiro é nosso, mas a conversa de uma organização nunca mexe na campanha de outra.
  it "não conta na campanha de outra organização" do
    other = create(:outreach_campaign, :running, organization: create(:organization))
    foreign = create(:outreach_recipient, campaign: other, status_cd: "read")
    chat.set(outreach_recipient_id: foreign.id.to_s)

    described_class.record(chat)

    expect(foreign.reload.replied_at).to be_nil
    expect(other.reload.replied_count).to eq(0)
  end

  it "avisa o monitor, com o destinatário e os números novos" do
    published = []
    allow(CampaignChannel).to receive(:broadcast_event) { |_org, _id, payload, **| published << payload }

    described_class.record(chat)

    expect(published.map { |payload| payload[:event] }).to eq(%w[recipient progress])
    expect(published.first[:recipient]).to include(id: recipient.id.to_s, repliedAt: be_present)
    expect(published.last[:stats]).to include(replied: 1)
  end

  it "um erro aqui não impede a mensagem de chegar" do
    allow(Outreach::Recipient).to receive(:where).and_raise(Mongo::Error::SocketError)

    expect { described_class.record(chat) }.not_to raise_error
  end
end
