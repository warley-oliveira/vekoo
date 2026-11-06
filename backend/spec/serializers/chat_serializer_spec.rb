require "rails_helper"

RSpec.describe ChatSerializer do
  include ActiveSupport::Testing::TimeHelpers

  let(:organization) { create(:organization) }
  let(:connector) { create(:connector_whatsapp_cloud, organization: organization) }
  let(:moment) { Time.utc(2026, 11, 6, 12, 0, 0) }
  let(:moment_ms) { moment.to_i * 1000 }

  def serialize(**attributes)
    described_class.one(create(:chat, connector: connector, **attributes))
  end

  around { |example| travel_to(moment) { example.run } }

  it "traz cada campo em camelCase" do
    tag = create(:chat_tag, organization_id: organization.id)
    chat = create(
      :chat,
      connector: connector,
      external_id: "5531971810932@s.whatsapp.net",
      user_name: "Maria Souza",
      display_name: "Maria da Padaria",
      audience_type: "whatsapp_api",
      audience_user_name: "@maria",
      profile_picture_url: "https://cdn.exemplo.com/maria.jpg",
      status: "closed",
      automation_enabled: false,
      assigned_account_id: "conta-1",
      team_id: "time-1",
      unread_messages: 3,
      sender_phone_number_id: 2000,
      last_message_type: "text",
      last_message_by: "user",
      last_message_content: "Oi",
      notes: "cliente VIP",
      custom_attributes: { "cidade" => "BH" },
      funnel_stages: { "funil-1" => "etapa-2" },
      chat_tag_ids: [ tag.id ]
    )

    expect(described_class.one(chat)).to include(
      id: chat.id.to_s,
      connectorId: connector.id.to_s,
      audienceId: chat.audience_id.to_s,
      externalId: "5531971810932@s.whatsapp.net",
      phoneNumber: "5531971810932",
      userName: "Maria Souza",
      displayName: "Maria da Padaria",
      abbreviatedName: "MS",
      audienceType: "whatsapp_api",
      audienceUserName: "@maria",
      profilePictureUrl: "https://cdn.exemplo.com/maria.jpg",
      status: "closed",
      automationEnabled: false,
      assignedAccountId: "conta-1",
      teamId: "time-1",
      unreadMessages: 3,
      senderPhoneNumberId: "2000",
      lastMessageType: "text",
      lastMessageBy: "user",
      lastMessageContent: "Oi",
      notes: "cliente VIP",
      tagIds: [ tag.id.to_s ],
      customAttributes: { "cidade" => "BH" },
      funnelStages: { "funil-1" => "etapa-2" }
    )
  end

  it "só tem chaves em camelCase" do
    expect(serialize.keys.map(&:to_s)).to all(match(/\A[a-z][a-zA-Z]*\z/))
  end

  describe "datas em milissegundos" do
    it "traz última mensagem, criação e atualização" do
      expect(serialize(last_message_at: moment)).to include(lastMessageAt: moment_ms, createdAt: moment_ms, updatedAt: moment_ms)
    end

    it "traz a volta da automação" do
      expect(serialize(automation_resume_at: moment + 1.hour)).to include(automationResumeAt: moment_ms + 3_600_000)
    end

    it "traz o início da sessão" do
      expect(serialize(session_start_at: moment - 1.hour)).to include(sessionStartAt: moment_ms - 3_600_000)
    end

    it "deixa nil o que não tem data" do
      expect(serialize).to include(automationResumeAt: nil, sessionStartAt: nil)
    end
  end

  describe "campos derivados" do
    it "traz o tempo da última mensagem" do
      expect(serialize(last_message_at: moment - 5.minutes)).to include(lastMessageFrom: "5min")
    end

    it "sem última mensagem, fica sem tempo" do
      chat = create(:chat, connector: connector)
      chat.set(last_message_at: nil)

      expect(described_class.one(chat)).to include(lastMessageAt: nil, lastMessageFrom: nil)
    end

    it "traz a sessão ativa" do
      expect(serialize(session_start_at: moment - 1.hour)).to include(activeSession: true)
      expect(serialize(session_start_at: moment - 25.hours)).to include(activeSession: false)
    end

    it "ids de conversa sem conector ficam nil" do
      chat = create(:chat, organization: organization)

      expect(described_class.one(chat)).to include(connectorId: nil, senderPhoneNumberId: nil, tagIds: [])
    end
  end

  it "não vaza o que é interno" do
    expect(serialize(flow_data: { "fluxo" => "x" }, contact_storage: { "x" => 1 }, widget_context: { "page" => {} })).not_to include(:flowData, :contactStorage, :widgetContext, :activeJobId)
  end

  it ".many serializa a lista" do
    chats = [ create(:chat, connector: connector), create(:chat, connector: connector) ]

    expect(described_class.many(chats).map { |item| item[:id] }).to eq(chats.map { |chat| chat.id.to_s })
  end
end
