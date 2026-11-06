require "rails_helper"

RSpec.describe Outreach::Recipient, type: :model do
  let(:campaign) { create(:outreach_campaign, :running) }
  let(:recipient) { create(:outreach_recipient, campaign: campaign) }

  it "não aceita o mesmo telefone duas vezes na campanha" do
    create(:outreach_recipient, campaign: campaign, phone: "5531971810932")

    expect(build(:outreach_recipient, campaign: campaign, phone: "5531971810932")).not_to be_valid
  end

  it "aceita o mesmo telefone em outra campanha" do
    create(:outreach_recipient, campaign: campaign, phone: "5531971810932")

    expect(build(:outreach_recipient, campaign: create(:outreach_campaign), phone: "5531971810932")).to be_valid
  end

  # A mesma conta de WhatsApp receberia duas vezes.
  it "não aceita a outra forma do 9º dígito na campanha" do
    create(:outreach_recipient, campaign: campaign, phone: "5531971810932")

    expect(build(:outreach_recipient, campaign: campaign, phone: "553171810932")).not_to be_valid
  end

  describe ".key_for" do
    it "é a mesma para as duas formas do número" do
      expect(described_class.key_for("5531971810932")).to eq(described_class.key_for("553171810932"))
    end

    it "é a mesma com máscara e com sufixo" do
      expect(described_class.key_for("+55 (31) 97181-0932")).to eq(described_class.key_for("553171810932@s.whatsapp.net"))
    end

    it "fixo não tem variante" do
      expect(described_class.key_for("553133330000")).to eq("553133330000")
    end

    it "é diferente para números diferentes" do
      expect(described_class.key_for("5531971810932")).not_to eq(described_class.key_for("5531971810933"))
    end
  end

  it "nasce pendente" do
    expect(recipient.status_pending?).to be(true)
  end

  describe "#terminal?" do
    it "é verdadeiro só para quem já terminou" do
      terminal = %w[sent delivered read failed skipped]

      described_class.statuses.each do |status|
        expect(described_class.new(status_cd: status).terminal?).to be(terminal.include?(status))
      end
    end
  end

  describe "escopos" do
    before do
      described_class.statuses.each do |status|
        create(:outreach_recipient, campaign: campaign, status_cd: status)
      end
    end

    it "`unsent` traz quem ainda pode sair" do
      expect(campaign.recipients.unsent.pluck(:status_cd)).to contain_exactly("pending", "sending")
    end

    it "`terminal` traz quem já terminou" do
      expect(campaign.recipients.terminal.count).to eq(5)
    end

    it "`status_read` traz os lidos, em vez de cair em `Criteria#read`" do
      expect(campaign.recipients.status_read.pluck(:status_cd)).to eq([ "read" ])
    end
  end

  describe "`matching`" do
    it "acha por nome ou telefone, tratando o texto como texto" do
      ana = create(:outreach_recipient, campaign: campaign, name: "Ana (loja)", phone: "5531900000001")
      create(:outreach_recipient, campaign: campaign, name: "Bia", phone: "5531900000002")

      expect(campaign.recipients.matching("ana (").to_a).to eq([ ana ])
      expect(campaign.recipients.matching("000001").to_a).to eq([ ana ])
    end
  end

  describe "a saída de um envio" do
    let(:taken) { claimed(recipient) }

    it "marcar como despachado grava a conversa e o horário" do
      chat_id = BSON::ObjectId.new

      expect(taken.mark_dispatched!(chat_id)).to be(true)
      expect(taken).to have_attributes(chat_id: chat_id.to_s, dispatched_at: be_present)
    end

    it "não despacha se a recuperação já devolveu o destinatário" do
      copy = claimed(recipient)
      described_class.where(_id: recipient.id).find_one_and_update("$set" => { status_cd: "pending" }, "$unset" => { claim_token: true })

      expect(copy.mark_dispatched!(BSON::ObjectId.new)).to be(false)
    end

    it "não despacha com o token de outra tomada" do
      old = claimed(recipient)
      claimed(recipient)

      expect(old.mark_dispatched!(BSON::ObjectId.new)).to be(false)
    end

    it "enviado conta uma vez só" do
      expect(taken.finish_sent!("EVO-1")).to be(true)
      expect(taken.finish_sent!("EVO-1")).to be(false)

      expect(taken.reload).to have_attributes(status_cd: "sent", whatsapp_message_id: "EVO-1", sent_at: be_present)
      expect(campaign.reload.sent_count).to eq(1)
    end

    it "falho conta uma vez só e guarda o motivo" do
      expect(taken.finish_failed!("numberNotFound", detail: "x" * 300)).to be(true)
      expect(taken.finish_failed!("numberNotFound")).to be(false)

      expect(taken.reload).to have_attributes(status_cd: "failed", error_code: "numberNotFound")
      expect(taken.error_message.length).to eq(described_class::ERROR_MESSAGE_LIMIT)
      expect(campaign.reload.failed_count).to eq(1)
    end

    it "devolver à fila limpa a tomada, sem contar nada" do
      expect(taken.release_claim!).to be(true)

      expect(taken.reload).to have_attributes(status_cd: "pending", claim_token: nil, claimed_at: nil)
      expect(campaign.reload).to have_attributes(sent_count: 0, failed_count: 0)
    end

    it "quem já terminou não muda de saída" do
      copy = described_class.find(taken.id)
      taken.finish_sent!("EVO-1")

      expect(copy.finish_failed!("whatsappError")).to be(false)
      expect(campaign.reload).to have_attributes(sent_count: 1, failed_count: 0)
    end
  end
end
