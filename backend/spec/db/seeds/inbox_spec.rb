require "rails_helper"

# Roda a semente de ponta a ponta, em cima das conversas que db/seeds/connectors.rb deixa.
RSpec.describe "db/seeds/inbox.rb" do
  include ActiveJob::TestHelper

  let(:owner) { create(:account, email: "marina.duarte@exemplo.com.br", role: "owner", name: "Marina Duarte") }
  let(:organization) { owner.organization }

  def load_quietly(path)
    original = $stdout
    $stdout = StringIO.new
    load Rails.root.join(path)
  ensure
    $stdout = original
  end

  def seed
    load_quietly("db/seeds/inbox.rb")
  end

  before do
    owner
    load_quietly("db/seeds/connectors.rb")
    seed
  end

  it "traz campos de todos os tipos, com a chave derivada do nome" do
    fields = organization.custom_fields.to_a

    expect(fields.map(&:value_type)).to include("text", "number", "list", "checkbox", "date")
    expect(fields.map(&:key)).to include("cidade", "ticket_medio", "tamanho_preferido")
  end

  it "preenche os campos das conversas que já existem, sempre como texto" do
    fernanda = organization.chats.where(user_name: "Fernanda Lima").take

    expect(fernanda.custom_attributes).to include("cidade" => "Belo Horizonte", "ticket_medio" => "500")
    expect(fernanda.custom_attributes.values).to all(be_a(String))
  end

  it "aplica etiquetas às conversas que já existem" do
    roberto = organization.chats.where(user_name: "Roberto Nascimento").take
    atacado = organization.chat_tags.where(name: "atacado").take

    expect(roberto.chat_tag_ids).to include(atacado.id)
  end

  it "traz mensagens rápidas, algumas citando anexo de verdade" do
    tabela = organization.quick_replies.find_by(trigger: "tabela")
    attachment_id = tabela.content[/attachment_id_([\w-]+)/, 1]

    expect(organization.quick_replies.count).to be >= 6
    expect(Media::AttachmentLookup.find(attachment_id, organization_id: organization.id).name).to eq("Tabela de preços de atacado")
  end

  it "traz anexos sem depender de rede, com arquivo de verdade" do
    attachments = organization.attachments.to_a

    expect(attachments.size).to be >= 3
    expect(attachments.map(&:private)).to all(be(false))
    expect(attachments.map { |attachment| attachment.file.blob.byte_size }).to all(be_positive)
    expect(attachments.map { |attachment| attachment.file.blob.content_type }).to include("application/pdf", "image/png")
  end

  it "traz visões pessoais e compartilhadas, e todas funcionam como filtro" do
    views = organization.chat_views.to_a

    expect(views.map(&:personal)).to include(true, false)
    expect(views.map(&:account)).to all(eq(owner))

    views.each do |view|
      conditions = Chats::Filters.conditions(view.payload.map { |entry| entry.deep_transform_keys(&:underscore) })
      expect(conditions).not_to be_empty, "a visão #{view.name} não virou filtro"
    end
  end

  it "importa contatos pelo caminho de verdade, com a atribuição pelo nome" do
    camila = create(:account, organization: organization, role: "member", name: "Camila Rocha")
    organization.contact_imports.destroy_all
    Chat.where(organization_id: organization.id, audience_type: "import_feature").delete_all

    seed

    contact_import = ContactImport.find_by(organization_id: organization.id)
    expect(contact_import).to have_attributes(status: "completed", imported_contacts_count: 5, file_name: "clientes-loja-fisica.csv")
    helena = organization.chats.where(user_name: "Helena Martins").take
    expect(helena).to have_attributes(audience_type: "import_feature", automation_enabled: false, assigned_account_id: camila.id)
  end

  it "deixa uma conversa com o copiloto" do
    thread = CopilotThread.where(account_id: owner.id).take

    expect(thread.ordered_messages.map(&:role)).to eq(%w[user assistant])
  end

  it "é idempotente" do
    counts = lambda {
      [
        organization.custom_fields.count, organization.quick_replies.count, organization.attachments.count,
        organization.chat_views.count, organization.contact_imports.count, organization.chats.count, organization.chat_tags.count,
        CopilotThread.where(account_id: owner.id).take.messages.count, ActiveStorage::Blob.count
      ]
    }

    expect { seed }.not_to(change(&counts))
  end

  it "não desfaz o que a pessoa mudou" do
    fernanda = organization.chats.where(user_name: "Fernanda Lima").take
    Chat.where(_id: fernanda.id).update_all("$set" => { "custom_attributes.cidade" => "Contagem" })

    seed

    expect(fernanda.reload.custom_attributes["cidade"]).to eq("Contagem")
  end

  it "só mexe na organização da conta de demonstração" do
    other = create(:organization)

    seed

    expect(other.custom_fields.count).to eq(0)
    expect(other.quick_replies.count).to eq(0)
  end
end
