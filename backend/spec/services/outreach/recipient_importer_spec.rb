require "rails_helper"

RSpec.describe Outreach::RecipientImporter do
  let(:campaign) { create(:outreach_campaign) }

  def import(rows)
    described_class.new(campaign).import(rows)
  end

  def row(phone, name = "Ana", **extra)
    { phone: phone, name: name, **extra }
  end

  it "grava só os dígitos, pendentes" do
    result = import([ row("+55 (31) 97181-0932") ])

    expect(result).to have_attributes(imported: 1, skipped: 0, invalid: 0)
    expect(campaign.recipients.first).to have_attributes(phone: "5531971810932", name: "Ana", status_cd: "pending")
  end

  it "sem nome, usa o telefone" do
    import([ row("5531971810932", "  ") ])

    expect(campaign.recipients.first.name).to eq("5531971810932")
  end

  it "guarda de onde veio e as variáveis" do
    import([ row("5531971810932", contact_id: "abc", custom_variables: { "cupom" => "NATAL10" }) ])

    expect(campaign.recipients.first).to have_attributes(contact_id: "abc", custom_variables: { "cupom" => "NATAL10" })
  end

  it "soma o total na campanha" do
    import([ row("5531971810932"), row("5531971810933") ])

    expect(campaign.reload.total_recipients).to eq(2)
  end

  it "conta quem veio sem telefone" do
    expect(import([ row(""), row(nil) ])).to have_attributes(imported: 0, invalid: 2)
  end

  describe "repetidos" do
    it "dentro da mesma importação" do
      result = import([ row("5531971810932"), row("+55 (31) 97181-0932") ])

      expect(result).to have_attributes(imported: 1, skipped: 1)
    end

    it "com quem já está na campanha" do
      create(:outreach_recipient, campaign: campaign, phone: "5531971810932")

      expect(import([ row("5531971810932") ])).to have_attributes(imported: 0, skipped: 1)
    end

    # A mesma conta de WhatsApp receberia duas vezes.
    it "a outra forma do 9º dígito é a mesma pessoa" do
      result = import([ row("5531971810932"), row("553171810932") ])

      expect(result).to have_attributes(imported: 1, skipped: 1)
    end

    it "a outra forma do 9º dígito também conta para quem já está na campanha" do
      create(:outreach_recipient, campaign: campaign, phone: "553171810932")

      expect(import([ row("5531971810932") ])).to have_attributes(imported: 0, skipped: 1)
    end

    it "em outra campanha não conta" do
      create(:outreach_recipient, campaign: create(:outreach_campaign), phone: "5531971810932")

      expect(import([ row("5531971810932") ]).imported).to eq(1)
    end

    # Duas importações ao mesmo tempo: o índice único é quem segura, e o resto das linhas entra.
    it "se o índice recusar uma linha, as outras entram e o total fica certo" do
      Outreach::Recipient.create_indexes
      importer = described_class.new(campaign)
      create(:outreach_recipient, campaign: campaign, phone: "5531971810932")

      result = importer.import([ row("5531971810932"), row("5531971810933") ])

      expect(result).to have_attributes(imported: 1, skipped: 1)
      expect(campaign.recipients.pluck(:phone)).to contain_exactly("5531971810932", "5531971810933")
    end
  end

  it "grava em blocos" do
    stub_const("#{described_class}::BULK_SIZE", 2)

    expect(import(Array.new(5) { |index| row("553197181090#{index}") }).imported).to eq(5)
    expect(campaign.recipients.count).to eq(5)
  end

  it "mantém a ordem de entrada" do
    phones = Array.new(4) { |index| "553197181090#{index}" }

    import(phones.map { |phone| row(phone) })

    expect(campaign.recipients.order_by(_id: 1).pluck(:phone)).to eq(phones)
  end
end
