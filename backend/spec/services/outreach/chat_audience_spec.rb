require "rails_helper"

RSpec.describe Outreach::ChatAudience do
  let(:organization) { create(:organization) }
  let(:connector) { create(:connector_whatsapp_web, organization: organization) }

  def chat(**attributes)
    create(:chat, connector: connector, organization_id: organization.id, **attributes)
  end

  def phones(audience)
    audience.rows.map { |row| row[:phone] }
  end

  describe ".by_ids" do
    it "traz as conversas escolhidas" do
      first = chat(external_id: "5531900000001", user_name: "Ana")
      chat(external_id: "5531900000002")

      expect(described_class.by_ids(organization, [ first.id.to_s ]).rows).to eq([ { phone: "5531900000001", name: "Ana", contact_id: first.id.to_s } ])
    end

    it "não alcança a conversa de outra organização" do
      foreign = create(:chat, :with_connector, organization: create(:organization))

      expect(described_class.by_ids(organization, [ foreign.id.to_s ]).rows).to eq([])
    end

    it "ignora um id que não existe" do
      expect(described_class.by_ids(organization, [ "6925f3024c8311e4cee8369b", "lixo" ]).rows).to eq([])
    end
  end

  describe "quem não tem telefone" do
    it "fica de fora quem é do Instagram, do Messenger ou do site" do
      chat(external_id: "178414", audience_type: "instagram")
      chat(external_id: "9900", audience_type: "facebook")
      chat(external_id: "visitante", audience_type: "web")
      chat(external_id: "5531900000001", audience_type: "import_feature")

      expect(phones(described_class.by_filters(organization, {}))).to eq([ "5531900000001" ])
    end

    it "fica de fora grupo e identificador oculto" do
      chat(external_id: "120363@g.us")
      chat(external_id: "778899@lid")
      chat(external_id: "5531900000001@s.whatsapp.net")

      expect(phones(described_class.by_filters(organization, {}))).to eq([ "5531900000001@s.whatsapp.net" ])
    end
  end

  describe ".by_filters" do
    it "sem filtro, traz a organização toda, e só ela" do
      chat(external_id: "5531900000001")
      create(:chat, :with_connector, organization: create(:organization), external_id: "5531900000002")

      expect(phones(described_class.by_filters(organization, {}))).to eq([ "5531900000001" ])
    end

    it "filtra pelo texto, em nome ou telefone, tratando o texto como texto" do
      chat(external_id: "5531900000001", user_name: "Ana (loja)")
      chat(external_id: "5531900000002", user_name: "Bia")

      expect(phones(described_class.by_filters(organization, { q: "ana (" }))).to eq([ "5531900000001" ])
      expect(phones(described_class.by_filters(organization, { q: "0002" }))).to eq([ "5531900000002" ])
    end

    # A mesma busca da lista de contatos, para "todos os que aparecem aqui" trazer o que aparece.
    it "busca como a lista de contatos: nome de exibição e telefone com máscara" do
      chat(external_id: "5531900000001", user_name: "Ana", display_name: "Ana da Doma")
      chat(external_id: "5531900000002", user_name: "Bia")

      expect(phones(described_class.by_filters(organization, { q: "doma" }))).to eq([ "5531900000001" ])
      expect(phones(described_class.by_filters(organization, { q: "(31) 90000-0002" }))).to eq([ "5531900000002" ])
    end

    it "filtra por etiqueta" do
      tag = create(:chat_tag, organization_id: organization.id)
      chat(external_id: "5531900000001", chat_tag_ids: [ tag.id ])
      chat(external_id: "5531900000002")

      expect(phones(described_class.by_filters(organization, { tag_ids: [ tag.id.to_s ] }))).to eq([ "5531900000001" ])
    end

    it "filtra por canal" do
      other = create(:connector_whatsapp_web, organization: organization)
      chat(external_id: "5531900000001")
      create(:chat, connector: other, organization_id: organization.id, external_id: "5531900000002")

      expect(phones(described_class.by_filters(organization, { connector_ids: [ other.id.to_s ] }))).to eq([ "5531900000002" ])
    end

    it "filtra por situação" do
      chat(external_id: "5531900000001", status: "closed")
      chat(external_id: "5531900000002", status: "open")

      expect(phones(described_class.by_filters(organization, { status: "closed" }))).to eq([ "5531900000001" ])
    end

    it "filtra por automação, inclusive desligada" do
      chat(external_id: "5531900000001", automation_enabled: false)
      chat(external_id: "5531900000002", automation_enabled: true)

      expect(phones(described_class.by_filters(organization, { automation_enabled: false }))).to eq([ "5531900000001" ])
      expect(phones(described_class.by_filters(organization, { automation_enabled: "true" }))).to eq([ "5531900000002" ])
    end

    it "um filtro de etiqueta inválido é ignorado, sem levantar" do
      chat(external_id: "5531900000001")

      expect(phones(described_class.by_filters(organization, { tag_ids: [ "lixo" ] }))).to eq([ "5531900000001" ])
    end

    it "acima do limite, levanta em vez de carregar tudo" do
      stub_const("#{described_class}::MAX_CONTACTS", 1)
      2.times { |index| chat(external_id: "553190000000#{index}") }

      expect { described_class.by_filters(organization, {}).rows }.to raise_error(described_class::TooMany)
    end
  end

  it "só traz os campos que usa: uma conversa pode ser grande" do
    chat(external_id: "5531900000001", contact_storage: { "enorme" => "x" * 1000 })
    commands = []
    subscriber = Class.new do
      define_method(:started) { |event| commands << event.command if event.command_name == "find" }
      def succeeded(_event); end
      def failed(_event); end
    end.new
    Mongoid.default_client.subscribe(Mongo::Monitoring::COMMAND, subscriber)

    described_class.by_filters(organization, {}).rows

    expect(commands.last["projection"].keys).to include("external_id", "user_name")
    expect(commands.last["projection"].keys).not_to include("contact_storage")
  ensure
    Mongoid.default_client.unsubscribe(Mongo::Monitoring::COMMAND, subscriber)
  end
end
