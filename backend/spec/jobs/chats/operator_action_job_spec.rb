require "rails_helper"

RSpec.describe Chats::OperatorActionJob do
  let(:organization) { create(:organization) }
  let(:account) { create(:account, organization: organization, name: "Alice Prado") }
  let(:connector) { create(:connector_whatsapp_web, organization: organization) }
  let(:chat) { create(:chat, connector: connector, external_id: "5511999999999@s.whatsapp.net") }
  let(:send_url) { "http://evolution.test/message/sendText/#{connector.instance_name}" }

  before { allow(Connector::WhatsappWeb::Providers::Base).to receive(:sleep) }

  def run_action(action, target_chat = chat, as: account, **data)
    described_class.perform_now(action, target_chat.id.to_s, target_chat.organization_id, as.id, data.stringify_keys)
  end

  def stored_messages(target = chat)
    ChatMessage::Base.unscoped.where(chat_id: target.id, :role.ne => "base").to_a
  end

  it "não tenta de novo: o envio pode já ter saído" do
    expect(described_class.sidekiq_options_hash["retry"]).to be(false)
  end

  describe "send_message" do
    it "envia o texto como foi escrito, pausa a automação e assina como a pessoa" do
      stub_request(:post, send_url).to_return(status: 201, body: { key: { id: "EXT-1" } }.to_json, headers: { "Content-Type" => "application/json" })

      run_action("send_message", text: %(Copo d'água, "gelado"))

      expect(a_request(:post, send_url).with { |request| JSON.parse(request.body)["text"] == %(Copo d'água, "gelado") }).to have_been_made.once
      expect(stored_messages.first).to have_attributes(message_id: "EXT-1", status: "delivery_ack", account_id: account.id)
      expect(chat.reload.automation_enabled).to be(false)
    end

    it "com a rede fora do ar, a mensagem fica como falha, com a frase" do
      stub_request(:post, send_url).to_raise(Errno::ECONNREFUSED)

      run_action("send_message", text: "Oi")

      expect(stored_messages.first).to have_attributes(status: "failed", status_message: I18n.t("connectors.messages.channel_unreachable"))
    end

    it "não envia por quem perdeu o acesso entre enfileirar e rodar" do
      account.revoke!

      run_action("send_message", text: "Oi")

      expect(a_request(:post, send_url)).not_to have_been_made
      expect(stored_messages).to be_empty
    end

    it "não envia para a conversa que a pessoa deixou de enxergar" do
      role = create(:access_role, organization: organization, permissions: AccessRole::MEMBER_PERMISSIONS.merge("chat" => "all", "chat_list_to" => "assigned"))
      member = create(:account, organization: organization, role: "member", access_role: role)
      chat.update!(assigned_account_id: account.id)

      run_action("send_message", text: "Oi", as: member)

      expect(a_request(:post, send_url)).not_to have_been_made
      expect(stored_messages).to be_empty
    end

    it "não alcança conversa de outra organização, mesmo com o id certo" do
      foreign = create(:chat, connector: create(:connector_whatsapp_web))

      described_class.perform_now("send_message", foreign.id.to_s, organization.id, account.id, { "text" => "Oi" })

      expect(stored_messages(foreign)).to be_empty
    end

    it "conta de outra organização não age nesta" do
      stranger = create(:account, organization: create(:organization))

      described_class.perform_now("send_message", chat.id.to_s, organization.id, stranger.id, { "text" => "Oi" })

      expect(stored_messages).to be_empty
    end
  end

  describe "send_reaction" do
    let(:target) { create(:chat_text_message, chat: chat, message_id: "EXT-1") }

    it "recusada, transmite a falha para a tela reverter" do
      expect { run_action("send_reaction", message_id: target.id.to_s, emoji: "não é emoji") }
        .to have_broadcasted_to(ChatMessage::Base.stream_for(chat)).with(a_hash_including("event" => "message_reaction_failed", "id" => target.id.to_s))
    end

    it "de mensagem que não existe não faz nada" do
      expect { run_action("send_reaction", message_id: BSON::ObjectId.new.to_s, emoji: "👍") }
        .not_to have_broadcasted_to(ChatMessage::Base.stream_for(chat))
    end
  end

  describe "send_template_message" do
    it "com modelo que não existe, só pausa a automação, como antes" do
      run_action("send_template_message", template_id: "tpl-inexistente", components: [])

      expect(stored_messages).to be_empty
      expect(chat.reload.automation_enabled).to be(false)
    end
  end
end
