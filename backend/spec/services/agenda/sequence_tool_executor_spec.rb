require "rails_helper"

RSpec.describe Agenda::SequenceToolExecutor do
  include ActiveSupport::Testing::TimeHelpers

  let(:organization) { create(:organization) }
  let(:calendar) { create(:agenda_calendar, organization: organization) }
  let(:professional) { create(:agenda_professional, :with_rule, calendar: calendar, name: "Ana") }
  let(:service) { create(:agenda_offering, calendar: calendar, name: "Limpeza", professionals: [ professional ]) }
  let(:chat) { create(:chat, organization_id: organization.id, custom_attributes: { "cidade" => "Belo Horizonte" }) }
  let(:booking) { create(:agenda_booking, calendar: calendar, chat: chat, professional: professional, service: service, skip_professional_notifications: true) }

  subject(:executor) { described_class.new(chat, booking) }

  it "descreve as ferramentas no formato da API" do
    expect(executor.definitions.map { |tool| tool[:name] }).to eq(%w[
      check_availability list_contact_fields set_contact_field remove_contact_field list_tags add_tag remove_tag
    ])
    expect(executor.definitions.first[:input_schema]).to include(type: "object")
  end

  it "ferramenta desconhecida vira erro para o modelo, sem levantar" do
    expect(executor.execute("apagar_tudo")).to eq(error: "Ferramenta desconhecida: apagar_tudo")
  end

  it "falha interna vira erro para o modelo, sem levantar" do
    allow(chat).to receive(:add_tag!).and_raise("boom")

    expect(executor.execute("add_tag", "name" => "x")).to eq(error: "Falha ao executar a ferramenta.")
  end

  describe "check_availability" do
    it "lista os horários livres do mesmo serviço e profissional" do
      travel_to(calendar.zone.local(2030, 1, 14, 8, 0)) do
        result = executor.execute("check_availability", "days_ahead" => 1)

        expect(result[:has_slots]).to be(true)
        expect(result[:slots].keys.first).to eq("segunda-feira, 2030-01-14")
      end
    end

    it "sem serviço, não há o que verificar" do
      booking.update!(service_id: nil)

      expect(executor.execute("check_availability")[:error]).to be_present
    end
  end

  describe "campos do contato" do
    it "lista" do
      expect(executor.execute("list_contact_fields")).to eq(fields: [ { name: "cidade", key: "cidade", value: "Belo Horizonte" } ])
    end

    it "grava com a chave normalizada" do
      expect(executor.execute("set_contact_field", "field" => "Plano Dental", "value" => "Gold")).to eq(success: true, key: "plano_dental", value: "Gold")
      expect(chat.reload.custom_attributes).to include("plano_dental" => "Gold")
    end

    it "remove" do
      expect(executor.execute("remove_contact_field", "field" => "cidade")).to eq(success: true, key: "cidade")
      expect(chat.reload.custom_attributes).not_to have_key("cidade")
    end

    it "recusa campo sem nome" do
      expect(executor.execute("set_contact_field", "field" => " ", "value" => "x")).to eq(error: "Campo inválido.")
    end
  end

  describe "etiquetas" do
    it "adiciona, lista e remove" do
      expect(executor.execute("add_tag", "name" => "Muito Quente")).to eq(success: true, name: "muito-quente")
      expect(executor.execute("list_tags")[:tags].map { |tag| tag[:name] }).to eq([ "muito-quente" ])
      expect(executor.execute("remove_tag", "name" => "muito-quente")).to eq(success: true, name: "muito-quente")
      expect(chat.reload.chat_tag_ids).to be_empty
    end

    it "remover etiqueta que não existe avisa" do
      expect(executor.execute("remove_tag", "name" => "nada")).to eq(success: false, name: "nada")
    end
  end

  describe "simulação" do
    subject(:executor) { described_class.new(chat, booking, preview: true) }

    it "responde como se tivesse gravado, sem gravar" do
      expect(executor.execute("set_contact_field", "field" => "x", "value" => "y")).to include(preview: true)
      expect(executor.execute("remove_contact_field", "field" => "cidade")).to include(preview: true)
      expect(executor.execute("add_tag", "name" => "z")).to include(preview: true)
      expect(executor.execute("remove_tag", "name" => "z")).to include(preview: true)

      expect(chat.reload.custom_attributes).to eq("cidade" => "Belo Horizonte")
      expect(chat.chat_tag_ids).to be_empty
    end
  end
end
