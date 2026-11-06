require "rails_helper"
require "csv"

RSpec.describe CsvExportable do
  include ActiveSupport::Testing::TimeHelpers

  let(:organization) { create(:organization) }

  def export
    CSV.parse(Chat.export_contacts_to_csv(organization.id))
  end

  def create_contact(**attributes)
    create(:chat, organization: organization, **attributes)
  end

  describe ".export_contacts_to_csv" do
    it "sai com o cabeçalho mesmo sem contatos" do
      expect(export).to eq([ [ "Nome", "WhatsApp", "Etiquetas", "Criado em", "Última mensagem" ] ])
    end

    it "traz uma linha por conversa, com as datas formatadas" do
      create_contact(
        user_name: "Maria Souza",
        external_id: "5531971810932",
        created_at: Time.utc(2026, 9, 1, 10, 30),
        last_message_at: Time.utc(2026, 9, 2, 11, 45)
      )

      expect(export.last).to eq([ "Maria Souza", "5531971810932", "", "01/09/2026 10:30", "02/09/2026 11:45" ])
    end

    it "tira o sufixo do JID do número" do
      create_contact(external_id: "5531971810932@s.whatsapp.net")

      expect(export.last[1]).to eq("5531971810932")
    end

    it "junta as etiquetas pelo nome" do
      chat = create_contact
      chat.add_tag!("vip")
      chat.add_tag!("atacado")

      expect(export.last[2]).to eq("vip, atacado")
    end

    it "ignora o id de uma etiqueta que não existe mais" do
      chat = create_contact
      chat.add_to_set(chat_tag_ids: BSON::ObjectId.new)
      chat.add_tag!("vip")

      expect(export.last[2]).to eq("vip")
    end

    it "aguenta documento que nunca teve o campo de etiquetas" do
      chat = create_contact
      Chat.collection.update_one({ _id: chat.id }, { "$unset" => { chat_tag_ids: 1 } })

      expect(export.last[2]).to eq("")
    end

    it "deixa de fora a conversa de teste e as sem número" do
      create_contact(external_id: Chat::TEST_EXTERNAL_ID)
      create_contact(external_id: nil)
      create_contact(external_id: "")
      create_contact(external_id: "5531971810932")

      expect(export.drop(1).map { |row| row[1] }).to eq([ "5531971810932" ])
    end

    it "só traz contatos da organização" do
      create_contact(external_id: "5531971810932")
      create(:chat, organization: create(:organization), external_id: "5531900000000")

      expect(export.drop(1).map { |row| row[1] }).to eq([ "5531971810932" ])
    end

    it "traz os mais antigos primeiro" do
      create_contact(external_id: "5531900000002", created_at: 1.day.ago)
      create_contact(external_id: "5531900000001", created_at: 2.days.ago)

      expect(export.drop(1).map { |row| row[1] }).to eq(%w[5531900000001 5531900000002])
    end

    it "passa de um lote para o outro sem perder ninguém" do
      stub_const("CsvExportable::EXPORT_BATCH_SIZE", 2)
      5.times { |index| create_contact(external_id: "553190000000#{index}", created_at: (10 - index).days.ago) }

      expect(export.drop(1).map { |row| row[1] }).to eq(%w[5531900000000 5531900000001 5531900000002 5531900000003 5531900000004])
    end

    context "com o nome em branco" do
      it "sai vazio no texto gerado" do
        create_contact(user_name: nil, external_id: "5531971810932")

        expect(export.last.first).to be_nil
      end
    end

    context "com os campos personalizados do domínio inbox" do
      before do
        definitions = [
          double(name: "Cidade", key: "cidade"),
          double(name: "Plano", key: "plano")
        ]
        order = double(to_a: definitions)
        stub_const("CustomField", double(where: double(only: double(order_by: order))))
      end

      it "acrescenta uma coluna por campo" do
        expect(export.first).to eq([ "Nome", "WhatsApp", "Etiquetas", "Criado em", "Última mensagem", "Cidade", "Plano" ])
      end

      it "preenche com os valores da conversa e deixa vazio o que falta" do
        create_contact(custom_attributes: { "cidade" => "Belo Horizonte" })

        expect(export.last.last(2)).to eq([ "Belo Horizonte", nil ])
      end
    end
  end

  describe ".export_contacts_to_csv_file" do
    let(:path) { Rails.root.join("tmp", "contatos-#{SecureRandom.hex(4)}.csv").to_s }

    after { FileUtils.rm_f(path) }

    it "grava no arquivo e devolve o caminho" do
      create_contact(user_name: "Maria Souza", external_id: "5531971810932@s.whatsapp.net")

      expect(Chat.export_contacts_to_csv_file(organization.id, path)).to eq(path)

      rows = CSV.read(path)
      expect(rows.first).to eq([ "Nome", "WhatsApp", "Etiquetas", "Criado em", "Última mensagem" ])
      expect(rows.last.first(2)).to eq([ "Maria Souza", "5531971810932" ])
    end

    it "marca com traço o nome em branco" do
      create_contact(user_name: nil, external_id: "5531971810932")

      Chat.export_contacts_to_csv_file(organization.id, path)

      expect(CSV.read(path).last.first).to eq("-")
    end

    it "só traz contatos da organização" do
      create(:chat, organization: create(:organization), external_id: "5531900000000")

      Chat.export_contacts_to_csv_file(organization.id, path)

      expect(CSV.read(path).size).to eq(1)
    end
  end
end
