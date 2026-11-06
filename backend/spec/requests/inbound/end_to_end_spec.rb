require "rails_helper"

# Do webhook do provedor até o dispatcher de fluxos, em cada canal: o caminho inteiro que a
# mensagem recebida percorre. Os detalhes de cada canal ficam em spec/services/inbound/.
RSpec.describe "Webhooks de entrada", type: :request do
  include ActiveJob::TestHelper

  let(:organization) { create(:organization) }

  before { allow(Flows::InboundDispatcher).to receive(:call) }

  def expect_delivered(chat, text:, event: "first_message")
    expect(Flows::InboundDispatcher).to have_received(:call).with(chat: chat, text: text, event: event, message_id: anything)
  end

  describe "WhatsApp Cloud" do
    let(:connector) { create(:connector_whatsapp_cloud, organization: organization) }

    def webhook(message)
      {
        object: "whatsapp_business_account",
        entry: [ {
          id: connector.waba_id.to_s,
          changes: [ {
            value: {
              metadata: { phone_number_id: connector.phone_number_id.to_s },
              contacts: [ { wa_id: "5531971810932", profile: { name: "Maria" } } ],
              messages: [ message ]
            }
          } ]
        } ]
      }
    end

    it "responde 2xx na hora e processa no job" do
      expect {
        post "/inbound/whatsapp-cloud/#{connector.id}", params: webhook(id: "wamid.1", from: "5531971810932", type: "text", text: { body: "Oi" }), as: :json
      }.to have_enqueued_job(Inbound::ProcessWebhookJob)

      expect(response).to have_http_status(:ok)
      expect(Chat.where(connector_id: connector.id).count).to eq(0)
    end

    it "cria a conversa, persiste, atualiza a prévia e chama o dispatcher" do
      perform_enqueued_jobs do
        post "/inbound/whatsapp-cloud/#{connector.id}", params: webhook(id: "wamid.1", from: "5531971810932", type: "text", text: { body: "Oi" }), as: :json
      end

      chat = Chat.where(connector_id: connector.id).take
      expect(chat).to have_attributes(
        organization_id: organization.id,
        external_id: "5531971810932",
        user_name: "Maria",
        last_message_content: "Oi",
        last_message_by: "user",
        unread_messages: 1
      )
      expect(ChatMessage::Text.where(chat_id: chat.id, message_id: "wamid.1").take.content).to eq("Oi")
      expect_delivered(chat, text: "Oi")
    end

    it "acha a conversa pela variante do 9º dígito" do
      existing = create(:chat, connector: connector, external_id: "5531971810932")

      perform_enqueued_jobs do
        post "/inbound/whatsapp-cloud/#{connector.id}", params: webhook(id: "wamid.2", from: "553171810932", type: "text", text: { body: "Sou eu" }), as: :json
      end

      expect(Chat.where(connector_id: connector.id).count).to eq(1)
      expect(ChatMessage::Text.where(chat_id: existing.id, message_id: "wamid.2").exists?).to be(true)
    end

    it "não duplica quando a Meta reentrega" do
      2.times do
        perform_enqueued_jobs do
          post "/inbound/whatsapp-cloud/#{connector.id}", params: webhook(id: "wamid.3", from: "5531971810932", type: "text", text: { body: "Oi" }), as: :json
        end
      end

      expect(ChatMessage::Base.where(message_id: "wamid.3", :chat_id.in => Chat.where(connector_id: connector.id).pluck(:_id)).count).to eq(1)
    end

    it "responde o desafio de verificação com o token certo" do
      get "/inbound/whatsapp-cloud/#{connector.id}", params: { "hub.mode" => "subscribe", "hub.verify_token" => connector.verification_token, "hub.challenge" => "12345" }

      expect(response).to have_http_status(:ok)
      expect(response.body).to eq("12345")
    end

    it "recusa o desafio com token errado" do
      get "/inbound/whatsapp-cloud/#{connector.id}", params: { "hub.mode" => "subscribe", "hub.verify_token" => "errado", "hub.challenge" => "12345" }

      expect(response).to have_http_status(:bad_request)
    end

    it "responde 404 para conector que não existe" do
      post "/inbound/whatsapp-cloud/#{BSON::ObjectId.new}", params: {}, as: :json

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "Evolution" do
    let(:connector) { create(:connector_whatsapp_web, organization: organization) }
    let(:codename) { "IWA-#{connector.id}" }

    def upsert(message:, from_me: false, id: "EVO1", jid: "5531971810932@s.whatsapp.net", **data)
      {
        event: "messages.upsert",
        instance: codename,
        data: { key: { remoteJid: jid, fromMe: from_me, id: id }, pushName: "João", message: message, **data }
      }
    end

    it "persiste a mensagem sem o sufixo do JID e chama o dispatcher" do
      perform_enqueued_jobs do
        post "/inbound/evolution/#{codename}", params: upsert(message: { conversation: "Bom dia" }), as: :json
      end

      chat = Chat.where(connector_id: connector.id).take
      expect(chat).to have_attributes(external_id: "5531971810932", user_name: "João", unread_messages: 1)
      expect_delivered(chat, text: "Bom dia")
    end

    it "pausa a automação quando a mensagem é nossa, de outro aparelho" do
      perform_enqueued_jobs do
        post "/inbound/evolution/#{codename}", params: upsert(message: { conversation: "Já te respondo" }, from_me: true), as: :json
      end

      chat = Chat.where(connector_id: connector.id).take
      expect(chat.automation_enabled).to be(false)
      expect(chat.unread_messages).to eq(0)
      expect(ChatMessage::Text.where(chat_id: chat.id).take).to have_attributes(role: "assistant", message_origin: "user")
      expect(Flows::InboundDispatcher).not_to have_received(:call)
    end

    it "guarda a mídia recebida e entrega a legenda aos fluxos" do
      stub_request(:get, "https://bucket.exemplo.com/foto.jpg").to_return(status: 200, body: "fake-jpeg")

      perform_enqueued_jobs do
        post "/inbound/evolution/#{codename}",
             params: upsert(message: { mediaUrl: "https://bucket.exemplo.com/foto.jpg", imageMessage: { url: "https://cdn/enc", caption: "Olha" } }),
             as: :json
      end

      chat = Chat.where(connector_id: connector.id).take
      message = ChatMessage::Image.where(chat_id: chat.id).take
      expect(message).to have_attributes(role: "user", caption: "Olha", message_id: "EVO1")
      expect(message.image_url).to start_with("/rails/active_storage/blobs/proxy/")
      expect(chat.reload.last_message_type).to eq("image")
      expect_delivered(chat, text: "Olha")
    end

    it "responde 404 para instância que não é nossa" do
      post "/inbound/evolution/OUTRA-123", params: {}, as: :json

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "Z-API" do
    let(:connector) { create(:connector_whatsapp_web, :zapi, organization: organization) }

    it "persiste a mensagem de texto e chama o dispatcher" do
      perform_enqueued_jobs do
        post "/inbound/zapi/#{connector.id}/on-message-received",
             params: { messageId: "Z1", phone: "5531971810932", fromMe: false, senderName: "Ana", text: { message: "Tem horário?" } },
             as: :json
      end

      chat = Chat.where(connector_id: connector.id).take
      expect(chat).to have_attributes(external_id: "5531971810932", user_name: "Ana")
      expect_delivered(chat, text: "Tem horário?")
    end

    it "ignora grupo" do
      perform_enqueued_jobs do
        post "/inbound/zapi/#{connector.id}/on-message-received",
             params: { messageId: "Z2", phone: "5531971810932", isGroup: true, text: { message: "oi" } },
             as: :json
      end

      expect(response).to have_http_status(:ok)
      expect(Chat.where(connector_id: connector.id).count).to eq(0)
    end

    it "fecha o conector e registra o motivo na desconexão" do
      perform_enqueued_jobs do
        post "/inbound/zapi/#{connector.id}/on-whatsapp-disconnected",
             params: { error: "the number was disconnected by a possible whatsapp number blocking" },
             as: :json
      end

      expect(connector.reload).to be_closed
      expect(Connector::DisconnectionLog.where(connector_id: connector.id.to_s).take.translated_reason).to include("bloqueio")
    end
  end

  describe "Messenger e Instagram" do
    let(:connector) { create(:connector_messenger, organization: organization) }

    it "persiste a mensagem pelo id da página" do
      perform_enqueued_jobs do
        post "/inbound/meta-messaging",
             params: { object: "page", entry: [ { id: connector.page_id, messaging: [ { sender: { id: "PSID1" }, message: { mid: "m1", text: "Olá" } } ] } ] },
             as: :json
      end

      chat = Chat.where(connector_id: connector.id, external_id: "PSID1").take
      expect(chat.audience_type).to eq("facebook")
      expect_delivered(chat, text: "Olá")
    end

    it "responde o desafio com o token da plataforma" do
      allow(ENV).to receive(:[]).and_call_original
      allow(ENV).to receive(:[]).with("META_MESSAGING_VERIFY_TOKEN").and_return("segredo")

      get "/inbound/meta-messaging", params: { "hub.mode" => "subscribe", "hub.verify_token" => "segredo", "hub.challenge" => "777" }

      expect(response.body).to eq("777")
    end
  end

  describe "LeadChat" do
    let(:connector) { create(:connector_lead_chat, organization: organization) }

    before do
      stub_request(:get, %r{/chat/v1/session/S1})
        .to_return(status: 200, body: {
          contactDetails: { id: "C1", name: "Pedro", phonenumber: "+5531971810932" },
          channelDetails: { humanId: "(31) 3333-0000", platform: "WHATSAPP" },
          agentDetails: { name: "Bia" }
        }.to_json)
    end

    it "lê a sessão, persiste e chama o dispatcher" do
      perform_enqueued_jobs do
        post "/inbound/lead-chat/#{connector.id}/event",
             params: { eventType: "MESSAGE_RECEIVED", content: { id: "L1", type: "TEXT", text: "Quero um orçamento", sessionId: "S1", origin: "GATEWAY" } },
             as: :json
      end

      chat = Chat.where(connector_id: connector.id).take
      expect(chat).to have_attributes(external_id: "5531971810932", user_name: "Pedro")
      expect(chat.external_fields).to include("session_id" => "S1")
      expect_delivered(chat, text: "Quero um orçamento")
    end
  end
end
