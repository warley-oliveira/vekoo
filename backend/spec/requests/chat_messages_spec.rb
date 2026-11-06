require "rails_helper"

RSpec.describe "Chat: mensagens", type: :request do
  include ConnectorHelpers

  let(:organization) { create(:organization) }
  let(:owner) { create(:account, organization: organization, name: "Marina Duarte") }
  let(:headers) { auth_headers(owner) }
  let(:connector) { create(:connector_web_widget, organization: organization) }
  let(:chat) { create(:chat, organization: organization, connector: connector) }

  def text(chat_ = chat, **attributes)
    create(:chat_text_message, chat: chat_, **attributes)
  end

  def message_ids
    json["messages"].map { |message| message["id"] }
  end

  describe "sessão e permissão" do
    it "exige sessão" do
      get "/chats/#{chat.id}/messages"

      expect(response).to have_http_status(:unauthorized)
    end

    it "exige a permissão de chat" do
      get "/chats/#{chat.id}/messages", headers: auth_headers(member_with(contacts: "all"))

      expect(response).to have_http_status(:forbidden)
    end

    it "responde 404 para a conversa de outra organização" do
      foreign = create(:chat, organization: create(:organization))
      text(foreign)

      get "/chats/#{foreign.id}/messages", headers: headers

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "GET /chats/:chat_id/messages" do
    it "traz em ordem cronológica, serializadas para a tela" do
      older = text(created_at: 2.minutes.ago, content: "primeira")
      newer = text(created_at: 1.minute.ago, content: "segunda")

      get "/chats/#{chat.id}/messages", headers: headers

      expect(response).to have_http_status(:ok)
      expect(message_ids).to eq([ older.id.to_s, newer.id.to_s ])
      expect(json["messages"].first).to include("chatId" => chat.id.to_s, "role" => "user", "typeElement" => "text", "content" => "primeira")
      expect(json["messages"].first["createdAt"]).to be_a(Integer)
      expect(json).to include("hasMore" => false, "oldestId" => older.id.to_s)
    end

    it "mostra as notas do histórico e esconde as chamadas de ferramenta" do
      note = ChatMessage::Text.create!(chat: chat, role: "base", role_base_type: "automation-toggle-notation", content: "nota")
      ChatMessage::Text.create!(chat: chat, role: "tool", content: "resultado", tool_call_id: "x")
      ChatMessage::Text.create!(chat: chat, role: "assistant", content: "", tool_calls: [ { "id" => "x" } ])

      get "/chats/#{chat.id}/messages", headers: headers

      expect(message_ids).to eq([ note.id.to_s ])
    end

    it "mostra as partes de uma mensagem dividida, e não a original" do
      ChatMessage::Text.create!(chat: chat, role: "assistant", content: "inteira", has_span: true)
      part = ChatMessage::Text.create!(chat: chat, role: "assistant", content: "parte", is_span: true)

      get "/chats/#{chat.id}/messages", headers: headers

      expect(message_ids).to eq([ part.id.to_s ])
    end

    it "mostra as apagadas, com a data, para a tela pôr o aviso no lugar" do
      deleted = text(deleted_at: Time.current, deleted_scope: "everyone")

      get "/chats/#{chat.id}/messages", headers: headers

      expect(json["messages"].first).to include("id" => deleted.id.to_s, "deletedScope" => "everyone")
      expect(json["messages"].first["deletedAt"]).to be_a(Integer)
    end

    describe "paginação" do
      let!(:messages) { Array.new(5) { |n| text(created_at: (5 - n).minutes.ago, content: "m#{n}") } }

      it "traz as mais recentes primeiro e diz se há mais" do
        get "/chats/#{chat.id}/messages", params: { limit: 2 }, headers: headers

        expect(json["messages"].map { |m| m["content"] }).to eq(%w[m3 m4])
        expect(json).to include("hasMore" => true, "oldestId" => messages[3].id.to_s)
      end

      it "o cursor traz as anteriores, sem repetir" do
        get "/chats/#{chat.id}/messages", params: { limit: 2, beforeId: messages[3].id.to_s }, headers: headers
        expect(json["messages"].map { |m| m["content"] }).to eq(%w[m1 m2])
        expect(json["hasMore"]).to be(true)

        get "/chats/#{chat.id}/messages", params: { limit: 2, beforeId: messages[1].id.to_s }, headers: headers
        expect(json["messages"].map { |m| m["content"] }).to eq(%w[m0])
        expect(json["hasMore"]).to be(false)
      end

      it "limita o tamanho da página" do
        get "/chats/#{chat.id}/messages", params: { limit: 100_000 }, headers: headers

        expect(response).to have_http_status(:ok)
        expect(json["messages"].size).to eq(5)
      end

      it "responde 422 com cursor que não é desta conversa" do
        other = text(create(:chat, organization: organization))

        get "/chats/#{chat.id}/messages", params: { beforeId: other.id.to_s }, headers: headers

        expect(response).to have_http_status(:unprocessable_content)
        expect(json["error"]).to include("code" => "invalidCursor", "field" => "beforeId")
      end

      it "responde 422 com cursor que não é id" do
        get "/chats/#{chat.id}/messages", params: { beforeId: "lixo" }, headers: headers

        expect(response).to have_http_status(:unprocessable_content)
      end
    end

    # Mensagem do provedor chega com a data dele: a ordem de `_id` não é a de `created_at`.
    it "não pula mensagem quando a ordem de criação não é a da data" do
      newest_first = text(created_at: 1.minute.ago, content: "nova")
      arrived_late = text(created_at: 10.minutes.ago, content: "velha, gravada depois")
      middle = text(created_at: 5.minutes.ago, content: "meio")

      get "/chats/#{chat.id}/messages", params: { limit: 1 }, headers: headers
      expect(message_ids).to eq([ newest_first.id.to_s ])

      get "/chats/#{chat.id}/messages", params: { limit: 1, beforeId: newest_first.id.to_s }, headers: headers
      expect(message_ids).to eq([ middle.id.to_s ])

      get "/chats/#{chat.id}/messages", params: { limit: 1, beforeId: middle.id.to_s }, headers: headers
      expect(message_ids).to eq([ arrived_late.id.to_s ])
    end

    it "desempata pelo id quando duas mensagens têm a mesma data" do
      at = 1.minute.ago
      first = text(created_at: at, content: "a")
      second = text(created_at: at, content: "b")

      get "/chats/#{chat.id}/messages", params: { limit: 1 }, headers: headers
      expect(message_ids).to eq([ second.id.to_s ])

      get "/chats/#{chat.id}/messages", params: { limit: 1, beforeId: second.id.to_s }, headers: headers
      expect(message_ids).to eq([ first.id.to_s ])
    end

    describe "metadados da primeira página" do
      let(:tag) { create(:chat_tag, organization_id: organization.id) }

      before { chat.update(chat_tag_ids: [ tag.id ], custom_attributes: { "cidade" => "Curitiba" }, unread_messages: 3) }

      it "vêm na primeira carga" do
        create(:custom_field, organization_id: organization.id, name: "Cidade")

        get "/chats/#{chat.id}/messages", headers: headers

        expect(json).to include(
          "assignedAccountId" => nil, "automationEnabled" => true, "tagIds" => [ tag.id.to_s ],
          "customAttributes" => { "cidade" => "Curitiba" }, "unreadMessages" => 0, "connectorProvider" => "web_widget"
        )
        expect(json["attributeList"].first).to include("key" => "cidade", "valueType" => "text")
      end

      it "não vêm com cursor" do
        message = text

        get "/chats/#{chat.id}/messages", params: { beforeId: message.id.to_s }, headers: headers

        expect(json).not_to have_key("tagIds")
      end

      it "não vêm com initial=false, e não marca como lida" do
        get "/chats/#{chat.id}/messages", params: { initial: "false" }, headers: headers

        expect(json).not_to have_key("tagIds")
        expect(chat.reload.unread_messages).to eq(3)
      end

      it "zera as não lidas de conversa sem dono" do
        get "/chats/#{chat.id}/messages", headers: headers

        expect(chat.reload.unread_messages).to eq(0)
      end

      it "zera as não lidas de quem é dono" do
        chat.update(assigned_account_id: owner.id)

        get "/chats/#{chat.id}/messages", headers: headers

        expect(chat.reload.unread_messages).to eq(0)
      end

      it "abrir a conversa de outra pessoa não apaga o aviso dela" do
        colleague = create(:account, organization: organization, role: "member")
        chat.update(assigned_account_id: colleague.id)

        get "/chats/#{chat.id}/messages", headers: headers

        expect(chat.reload.unread_messages).to eq(3)
      end
    end
  end

  describe "DELETE /chats/:chat_id/messages/:id" do
    let(:zapi) { create(:connector_whatsapp_web, :zapi, organization: organization) }
    let(:zapi_chat) { create(:chat, organization: organization, connector: zapi, external_id: "5531971810932") }
    let(:message) { create(:chat_text_message, chat: zapi_chat, role: "assistant", message_id: "ZAP-1") }
    let(:delete_url) { /api\.z-api\.io.*messages/ }

    it "apaga para todos no canal que deixa" do
      stub_request(:delete, delete_url).to_return(json_reply({ status: "ok" }))

      delete "/chats/#{zapi_chat.id}/messages/#{message.id}", headers: headers

      expect(response).to have_http_status(:ok)
      expect(json["id"]).to eq(message.id.to_s)
      expect(json["deletedAt"]).to be_a(Integer)
      expect(message.reload.deleted_scope).to eq("everyone")
    end

    it "responde 422 com o motivo no canal que não deixa" do
      message = text

      delete "/chats/#{chat.id}/messages/#{message.id}", headers: headers

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]["message"]).to eq(I18n.t("connectors.messages.delete_unsupported", locale: "pt-BR"))
      expect(message.reload.deleted_at).to be_nil
    end

    it "responde 404 para mensagem de outra conversa" do
      other = text(create(:chat, organization: organization))

      delete "/chats/#{chat.id}/messages/#{other.id}", headers: headers

      expect(response).to have_http_status(:not_found)
    end

    it "apaga também nota do histórico, que o escopo padrão esconde" do
      stub_request(:delete, delete_url).to_return(json_reply({ status: "ok" }))
      note = ChatMessage::Text.create!(chat: zapi_chat, role: "base", content: "nota")

      delete "/chats/#{zapi_chat.id}/messages/#{note.id}", headers: headers

      expect(response).to have_http_status(:ok)
    end
  end

  describe "POST /chats/:chat_id/messages/bulk-delete" do
    let!(:first) { text }
    let!(:second) { text }

    it "sem provedor que revogue, apaga só daqui e diz isso" do
      post "/chats/#{chat.id}/messages/bulk-delete", params: { messageIds: [ first.id.to_s, second.id.to_s ], scope: "everyone" }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json).to include("scopeApplied" => "me", "revokedIds" => [])
      expect(json["deletedIds"]).to contain_exactly(first.id.to_s, second.id.to_s)
      expect(ChatMessage::Base.unscoped.where(chat_id: chat.id).count).to eq(0)
    end

    it "escopo desconhecido vale como `me`, o que não fala com o provedor" do
      post "/chats/#{chat.id}/messages/bulk-delete", params: { messageIds: [ first.id.to_s ], scope: "todos" }, headers: headers, as: :json

      expect(json["scopeApplied"]).to eq("me")
    end

    it "não apaga mensagem de outra conversa" do
      foreign = text(create(:chat, organization: organization))

      post "/chats/#{chat.id}/messages/bulk-delete", params: { messageIds: [ foreign.id.to_s ] }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(ChatMessage::Base.unscoped.where(id: foreign.id).exists?).to be(true)
    end

    it "responde 422 sem mensagens" do
      post "/chats/#{chat.id}/messages/bulk-delete", params: { messageIds: [] }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]["field"]).to eq("messageIds")
    end

    it "responde 422 acima de 100" do
      post "/chats/#{chat.id}/messages/bulk-delete", params: { messageIds: Array.new(101) { BSON::ObjectId.new.to_s } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]["code"]).to eq("tooManyMessages")
    end
  end

  describe "POST /chats/:chat_id/messages/:id/reaction" do
    let(:evolution) { create(:connector_whatsapp_web, organization: organization) }
    let(:evolution_chat) { create(:chat, organization: organization, connector: evolution, external_id: "5531971810932@s.whatsapp.net") }
    let(:message) { create(:chat_text_message, chat: evolution_chat, role: "user", message_id: "EVO-1") }

    before { allow(Connector::WhatsappWeb::Providers::Base).to receive(:sleep) }

    it "reage e devolve a mensagem com a reação de quem pediu" do
      stub_request(:post, "http://evolution.test/message/sendReaction/#{evolution.instance_name}").to_return(json_reply({ key: { id: "R-1" } }, status: 201))

      post "/chats/#{evolution_chat.id}/messages/#{message.id}/reaction", params: { emoji: "👍" }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json["message"]["reactions"].first).to include("emoji" => "👍", "from" => "assistant", "senderName" => "Marina Duarte", "accountId" => owner.id)
    end

    it "responde 422 com o motivo quando o canal não reage" do
      message = text

      post "/chats/#{chat.id}/messages/#{message.id}/reaction", params: { emoji: "👍" }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]["message"]).to eq(I18n.t("connectors.messages.reaction_unsupported", locale: "pt-BR"))
    end

    it "responde 422 com o que não é emoji" do
      post "/chats/#{evolution_chat.id}/messages/#{message.id}/reaction", params: { emoji: "abc" }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
    end

    it "responde 404 para mensagem de outra conversa" do
      other = text

      post "/chats/#{evolution_chat.id}/messages/#{other.id}/reaction", params: { emoji: "👍" }, headers: headers, as: :json

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "POST /chats/:chat_id/messages/audio" do
    let(:evolution) { create(:connector_whatsapp_web, organization: organization) }
    let(:evolution_chat) { create(:chat, organization: organization, connector: evolution, external_id: "5531971810932") }
    let(:audio_url) { "http://evolution.test/message/sendWhatsAppAudio/#{evolution.instance_name}" }

    def recording
      fixture_file_upload("audio.wav", "audio/wav")
    end

    before { allow(Connector::WhatsappWeb::Providers::Base).to receive(:sleep) }

    it "converte, guarda, pausa a automação e envia" do
      stub_request(:post, audio_url).to_return(json_reply({ key: { id: "EVO-AUD" } }, status: 201))

      post "/chats/#{evolution_chat.id}/messages/audio", params: { audio: recording }, headers: headers

      expect(response).to have_http_status(:created)
      expect(json["message"]).to include(
        "typeElement" => "audio", "role" => "assistant", "senderName" => "Marina Duarte", "accountId" => owner.id,
        "messageOrigin" => "frontend", "status" => "delivery_ack", "messageId" => "EVO-AUD"
      )
      expect(json["message"]["audioUrl"]).to start_with("/rails/active_storage/")

      message = ChatMessage::Audio.unscoped.where(chat_id: evolution_chat.id).take
      blob = ActiveStorage::Blob.find(message.media_blob_id)
      expect(blob.content_type).to eq("audio/ogg")
      expect(blob.filename.to_s).to eq("audio.ogg")
      expect(evolution_chat.reload.automation_enabled).to be(false)
      expect(a_request(:post, audio_url)).to have_been_made.once
    end

    it "fica failed, com o motivo, quando o canal recusa" do
      stub_request(:post, audio_url).to_return(status: 500, body: "caiu")

      post "/chats/#{evolution_chat.id}/messages/audio", params: { audio: recording }, headers: headers

      expect(response).to have_http_status(:created)
      expect(json["message"]["status"]).to eq("failed")
      expect(json["message"]["statusMessage"]).to be_present
    end

    it "na WABA converte para mp3" do
      cloud = create(:connector_whatsapp_cloud, organization: organization)
      cloud_chat = create(:chat, organization: organization, connector: cloud, external_id: "5531971810932")
      allow_any_instance_of(Connector::WhatsappCloud).to receive(:send_audio_message_by_url).and_return("WAMID-1")

      post "/chats/#{cloud_chat.id}/messages/audio", params: { audio: recording }, headers: headers

      blob = ActiveStorage::Blob.find(ChatMessage::Audio.unscoped.where(chat_id: cloud_chat.id).take.media_blob_id)
      expect(blob.content_type).to eq("audio/mpeg")
      expect(blob.filename.to_s).to eq("audio.mp3")
    end

    it "responde 422 sem arquivo" do
      post "/chats/#{evolution_chat.id}/messages/audio", headers: headers

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]).to include("code" => "fileRequired", "field" => "audio")
    end

    it "responde 422 com arquivo que não é áudio, sem deixar mensagem nem pausar" do
      post "/chats/#{evolution_chat.id}/messages/audio", params: { audio: fixture_file_upload("documento.txt", "text/plain") }, headers: headers

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]["code"]).to eq("audioConversionFailed")
      expect(ChatMessage::Audio.unscoped.where(chat_id: evolution_chat.id).count).to eq(0)
      expect(evolution_chat.reload.automation_enabled).to be(true)
    end

    it "responde 422 acima do limite" do
      stub_const("Chats::SendAudio::MAX_BYTES", 3)

      post "/chats/#{evolution_chat.id}/messages/audio", params: { audio: recording }, headers: headers

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]["code"]).to eq("fileTooLarge")
    end

    it "sem ffmpeg na máquina, vai o arquivo original" do
      stub_request(:post, audio_url).to_return(json_reply({ key: { id: "EVO-AUD" } }, status: 201))
      allow(Open3).to receive(:capture2e).and_raise(Errno::ENOENT)

      post "/chats/#{evolution_chat.id}/messages/audio", params: { audio: recording }, headers: headers

      expect(response).to have_http_status(:created)
      blob = ActiveStorage::Blob.find(ChatMessage::Audio.unscoped.where(chat_id: evolution_chat.id).take.media_blob_id)
      expect(blob.filename.to_s).to eq("audio.wav")
    end

    it "responde 404 para a conversa de outra organização" do
      foreign = create(:chat, organization: create(:organization))

      post "/chats/#{foreign.id}/messages/audio", params: { audio: recording }, headers: headers

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "POST /chats/:chat_id/messages/attachments" do
    let(:evolution) { create(:connector_whatsapp_web, organization: organization) }
    let(:evolution_chat) { create(:chat, organization: organization, connector: evolution, external_id: "5531971810932") }
    let(:media_url) { "http://evolution.test/message/sendMedia/#{evolution.instance_name}" }

    def pdf(name = "tabela.pdf")
      Rack::Test::UploadedFile.new(StringIO.new("%PDF-1.4"), "application/pdf", original_filename: name)
    end

    before do
      allow(Connector::WhatsappWeb::Providers::Base).to receive(:sleep)
      stub_request(:post, media_url).to_return(json_reply({ key: { id: "EVO-MED" } }, status: 201))
    end

    it "guarda cada arquivo como anexo privado e envia" do
      post "/chats/#{evolution_chat.id}/messages/attachments", params: { files: [ pdf("a.pdf"), pdf("b.pdf") ] }, headers: headers

      expect(response).to have_http_status(:created)
      expect(json["messages"].size).to eq(2)
      expect(json["messages"].first).to include(
        "typeElement" => "media", "mediaType" => "document", "role" => "assistant", "accountId" => owner.id,
        "senderName" => "Marina Duarte", "status" => "delivery_ack"
      )
      expect(json["messages"].first["mediaProperties"]).to include("fileName" => "a.pdf")
      expect(json["messages"].first["mediaUrl"]).to start_with("/rails/active_storage/")

      attachments = organization.attachments
      expect(attachments.count).to eq(2)
      expect(attachments.pluck(:private)).to all(be(true))
    end

    it "aceita um arquivo só, em `file`" do
      post "/chats/#{evolution_chat.id}/messages/attachments", params: { file: pdf }, headers: headers

      expect(response).to have_http_status(:created)
      expect(json["messages"].size).to eq(1)
    end

    it "decide o tipo pelo nome do arquivo" do
      post "/chats/#{evolution_chat.id}/messages/attachments",
           params: { file: Rack::Test::UploadedFile.new(StringIO.new("x"), "image/png", original_filename: "foto.png") },
           headers: headers

      expect(json["messages"].first["mediaType"]).to eq("image")
    end

    it "pausa a automação: é uma pessoa intervindo" do
      post "/chats/#{evolution_chat.id}/messages/attachments", params: { file: pdf }, headers: headers

      expect(evolution_chat.reload.automation_enabled).to be(false)
    end

    it "fica failed quando o canal recusa, sem estourar" do
      stub_request(:post, media_url).to_return(status: 500, body: "caiu")

      post "/chats/#{evolution_chat.id}/messages/attachments", params: { file: pdf }, headers: headers

      expect(response).to have_http_status(:created)
      expect(json["messages"].first["status"]).to eq("failed")
    end

    it "responde 422 sem arquivo" do
      post "/chats/#{evolution_chat.id}/messages/attachments", headers: headers

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]).to include("code" => "fileRequired", "field" => "files")
    end

    it "diz quais falharam e quais foram, quando um não presta" do
      stub_const("Attachment::MAX_BYTES", 100)
      big = Rack::Test::UploadedFile.new(StringIO.new("x" * 200), "application/pdf", original_filename: "grande.pdf")

      post "/chats/#{evolution_chat.id}/messages/attachments", params: { files: [ pdf("ok.pdf"), big ] }, headers: headers

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]["code"]).to eq("attachmentSendFailed")
      expect(json["error"]["details"]["files"].first["file"]).to eq("grande.pdf")
      expect(json["error"]["details"]["sentMessageIds"].size).to eq(1)
    end

    it "responde 404 para a conversa de outra organização" do
      foreign = create(:chat, organization: create(:organization))

      post "/chats/#{foreign.id}/messages/attachments", params: { file: pdf }, headers: headers

      expect(response).to have_http_status(:not_found)
    end
  end
end
