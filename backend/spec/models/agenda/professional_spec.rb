require "rails_helper"

RSpec.describe Agenda::Professional do
  let(:organization) { create(:organization) }
  let(:calendar) { create(:agenda_calendar, organization: organization) }

  describe ".normalize_phone" do
    {
      "(31) 98379-4137" => "5531983794137",
      "(31) 3333-4444" => "553133334444",
      "5531983794137" => "5531983794137",
      "+55 31 98379-4137" => "5531983794137",
      "14155550100" => "14155550100",
      "01987654321" => "01987654321",
      "5531983794137@s.whatsapp.net" => "5531983794137",
      "3198379" => "3198379"
    }.each do |input, expected|
      it "#{input} vira #{expected}" do
        expect(described_class.normalize_phone(input)).to eq(expected)
      end
    end

    it "vazio e nil viram nil" do
      expect(described_class.normalize_phone("")).to be_nil
      expect(described_class.normalize_phone(nil)).to be_nil
    end
  end

  describe "#sendable_phone?" do
    it "aceita número completo" do
      expect(build(:agenda_professional, phone: "5531983794137")).to be_sendable_phone
    end

    it "recusa vazio e número sem DDI" do
      expect(build(:agenda_professional, phone: nil)).not_to be_sendable_phone
      expect(build(:agenda_professional, phone: "31983794")).not_to be_sendable_phone
    end
  end

  it "grava o telefone na forma canônica" do
    expect(create(:agenda_professional, calendar: calendar, phone: "(31) 98379-4137").phone).to eq("5531983794137")
  end

  it "não mexe no telefone que não mudou" do
    professional = create(:agenda_professional, calendar: calendar, phone: "5531983794137")
    professional.set(phone: "31983794137")

    professional.update!(name: "Outro")

    expect(professional.reload.phone).to eq("31983794137")
  end

  describe "conta ligada" do
    let(:account) { create(:account, organization: organization, name: "Dra. Ana", email: "ana@exemplo.com.br") }

    it "copia nome e e-mail da conta ao salvar" do
      professional = create(:agenda_professional, calendar: calendar, name: "Outro nome", account_id: account.id)

      expect(professional).to have_attributes(name: "Dra. Ana", email: "ana@exemplo.com.br")
    end

    it "recusa conta de outra organização" do
      other = create(:account)
      professional = build(:agenda_professional, calendar: calendar, account_id: other.id)

      expect(professional).not_to be_valid
      expect(professional.errors[:account_id]).to be_present
    end

    it "continua salvável depois que a conta é apagada" do
      professional = create(:agenda_professional, calendar: calendar, account_id: account.id)
      account.destroy!

      expect { professional.reload.update!(phone: "5531983794137") }.not_to raise_error
      expect(professional.name).to eq("Dra. Ana")
    end

    it "acha a conta do aviso pelo e-mail, dentro da organização" do
      professional = create(:agenda_professional, calendar: calendar, email: account.email.upcase)

      expect(professional.notice_account).to eq(account)
    end

    it "não acha conta de outra organização com o mesmo e-mail" do
      other = create(:account)
      professional = create(:agenda_professional, calendar: calendar, email: other.email)

      expect(professional.notice_account).to be_nil
    end
  end

  describe "foto" do
    it "vem da conta na hora de ler, sem cópia, e uma listagem inteira custa uma consulta só" do
      accounts = create_list(:account, 2, organization: organization)
      professionals = accounts.map { |account| create(:agenda_professional, calendar: calendar, account_id: account.id) }

      queries = []
      subscriber = ActiveSupport::Notifications.subscribe("sql.active_record") do |*, payload|
        queries << payload[:sql] if payload[:sql].match?(/FROM "accounts"/) && payload[:name] != "SCHEMA"
      end
      avatars = Agenda::ProfessionalDirectory.avatars(professionals)
      ActiveSupport::Notifications.unsubscribe(subscriber)

      expect(queries.size).to eq(1)
      expect(avatars.keys).to match_array(accounts.map(&:id))
    end

    it "aparece no serializer quando a conta tem foto" do
      account = create(:account, organization: organization)
      account.avatar.attach(io: File.open(Rails.root.join("spec/fixtures/files/foto.png")), filename: "foto.png", content_type: "image/png")
      professional = create(:agenda_professional, calendar: calendar, account_id: account.id)

      expect(Agenda::ProfessionalSerializer.one(professional)[:avatarUrl]).to include("foto")
    end
  end

  describe "ao sair" do
    it "leva a regra, sai da distribuição e não leva os agendamentos" do
      professional = create(:agenda_professional, :with_rule, calendar: calendar)
      service = create(:agenda_offering, calendar: calendar, professionals: [ professional ])
      booking = create(:agenda_booking, calendar: calendar, professional: professional)

      professional.destroy!

      expect(Agenda::Rule.where(professional_id: professional.id)).to be_empty
      expect(service.reload.distribution).to be_empty
      expect(booking.reload.professional_id).to be_nil
    end
  end
end
