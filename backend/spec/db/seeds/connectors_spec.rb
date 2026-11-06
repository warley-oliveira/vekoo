require "rails_helper"

# Roda a semente de ponta a ponta, em cima da conta de demonstração que `db/seeds.rb` cria.
RSpec.describe "db/seeds/connectors.rb" do
  let(:owner) { create(:account, email: "marina.duarte@exemplo.com.br", role: "owner", name: "Marina Duarte") }
  let(:organization) { owner.organization }

  def seed
    original = $stdout
    $stdout = StringIO.new
    load Rails.root.join("db/seeds/connectors.rb")
  ensure
    $stdout = original
  end

  def messages_of(chats)
    ChatMessage::Base.unscoped.where(:chat_id.in => chats.pluck(:_id))
  end

  before do
    owner
    seed
  end

  it "traz um canal de cada tipo principal, e só o widget ativo" do
    connectors = organization.connectors.to_a

    expect(connectors.map(&:connector_type)).to contain_exactly("web_widget", "whatsapp_web", "whatsapp_cloud", "instagram_direct")
    expect(connectors.select(&:active?).map(&:connector_type)).to eq([ "web_widget" ])
  end

  it "não traz credencial nenhuma" do
    cloud = Connector::WhatsappCloud.where(organization_id: organization.id).take
    web = Connector::WhatsappWeb.where(organization_id: organization.id).take
    instagram = Connector::InstagramDirect.where(organization_id: organization.id).take

    expect(cloud.access_token).to be_nil
    expect(web.api_key).to be_nil
    expect(web.base_url).to end_with(".invalid")
    expect(instagram.instagram_user_access_token).to be_nil
  end

  it "traz conversas e mensagens de texto, imagem, áudio e mídia, com arquivo de verdade" do
    chats = organization.chats
    expect(chats.count).to be >= 30

    types = messages_of(chats).pluck(:_type).uniq
    expect(types).to include("ChatMessage::Text", "ChatMessage::Image", "ChatMessage::Audio", "ChatMessage::Media")

    image = messages_of(chats).where(_type: "ChatMessage::Image").first
    expect(ActiveStorage::Blob.find_signed(image.image_url[%r{/proxy/([^/]+)/}, 1])).to be_present
  end

  it "deixa a prévia da lista em cada conversa" do
    organization.chats.each do |chat|
      expect(chat.last_message_content).not_to be_nil
      expect(chat.last_message_by).to be_in(%w[user assistant])
    end
  end

  it "usa várias etiquetas, inclusive as de sistema" do
    used = organization.chats.flat_map(&:chat_tag_ids).uniq
    names = ChatTag.where(:id.in => used).pluck(:name)

    expect(names).to include("cliente-novo", "orcamento", "vip", "ganho", "perdido")
  end

  it "traz os casos que o chat precisa exibir" do
    messages = messages_of(organization.chats)

    expect(messages.where(role_base_type: "instagram-ad-greeting").first.external_ad_reply).to include("title")
    expect(messages.where(:deleted_at.ne => nil)).to exist
    expect(messages.where(:reply_to_message_id.ne => nil)).to exist
    expect(messages.where(:reactions.ne => [])).to exist
    expect(messages.where(status: "failed")).to exist
    expect(organization.chats.where(status: "closed")).to exist
    expect(organization.chats.where(:unread_messages.gt => 0)).to exist
  end

  it "espalha as conversas por dias diferentes, para os painéis" do
    days = organization.chats.map { |chat| chat.created_at.to_date }.uniq

    expect(days.size).to be >= 15
  end

  it "traz modelos da WABA em vários estados, sem chamar a Meta" do
    cloud = Connector::WhatsappCloud.where(organization_id: organization.id).take

    expect(cloud.whatsapp_templates.map(&:status)).to include(:approved, :pending, :removed)
    expect(cloud.whatsapp_templates.available.map(&:name)).not_to include("campanha_antiga")
  end

  it "é idempotente" do
    counts = -> { [ organization.connectors.count, organization.chats.count, messages_of(organization.chats).count, organization.chat_tags.count, WhatsappTemplate.count, ActiveStorage::Blob.count ] }

    expect { seed }.not_to(change { counts.call })
  end

  it "não desfaz o que a pessoa mudou na conversa" do
    chat = organization.chats.where(status: "open").first
    chat.set(notes: "anotação da pessoa")

    seed

    expect(chat.reload.notes).to eq("anotação da pessoa")
  end

  it "não faz nada sem a conta de demonstração" do
    owner.update!(email: "outra@exemplo.com.br")

    expect { seed }.not_to(change { Chat.count })
  end
end
