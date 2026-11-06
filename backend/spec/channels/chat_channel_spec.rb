require "rails_helper"

# A conversa em tempo real, de ponta a ponta: conta de verdade, banco de verdade e os
# provedores por WebMock. Nada aqui passa por dublê de conector.
RSpec.describe ChatChannel, type: :channel do
  include AttachmentHelpers

  let(:organization) { create(:organization) }
  let(:account) { create(:account, organization: organization, name: "Alice Prado") }
  let(:connector) { create(:connector_whatsapp_web, organization: organization) }
  let(:chat) { create(:chat, connector: connector, external_id: "5511999999999@s.whatsapp.net") }
  let(:stream) { ChatMessage::Base.stream_for(chat) }
  let(:send_url) { "http://evolution.test/message/sendText/#{connector.instance_name}" }
  let(:split_text) { "Olá#{"\n" * 10}Tudo bem?" }

  before do
    allow(Connector::WhatsappWeb::Providers::Base).to receive(:sleep)
    stub_connection current_account: account
  end

  def subscribe_to_chat
    subscribe(chatId: chat.id.to_s)
  end

  def perform_send(text, **extra)
    perform :send_message, { "chatId" => chat.id.to_s, "message" => text }.merge(extra.stringify_keys)
  end

  def json_reply(payload, status: 201)
    { status: status, body: payload.to_json, headers: { "Content-Type" => "application/json" } }
  end

  # Responde com os ids na ordem e guarda o corpo de cada envio.
  def stub_provider(*ids)
    @sent = []
    stub_request(:post, send_url).to_return do |request|
      @sent << JSON.parse(request.body)
      json_reply({ key: { id: ids.shift } })
    end
  end

  def messages
    ChatMessage::Base.unscoped.where(chat_id: chat.id, :role.ne => "base").order_by(created_at: :asc, _id: :asc).to_a
  end

  def parent_message
    messages.find { |message| !message.is_span }
  end

  def spans
    messages.select(&:is_span)
  end

  # Com grupo de permissões próprio, para tirar a permissão depois de assinar.
  def member_with(permissions)
    role = create(:access_role, organization: organization, permissions: AccessRole::MEMBER_PERMISSIONS.merge(permissions))
    create(:account, organization: organization, role: "member", access_role: role)
  end

  # O mesmo critério da API REST: quem não enxerga a conversa pela lista também não a
  # alcança pelo WebSocket, nem para ler, nem para enviar.
  describe "visibilidade por chat_list_to" do
    let(:other_person) { create(:account, organization: organization) }
    let(:restricted) { member_with("chat" => "all", "chat_list_to" => "assigned") }
    let(:foreign_chat) do
      create(:chat, connector: connector, external_id: "5511888888888@s.whatsapp.net", assigned_account_id: other_person.id.to_s)
    end

    before { stub_connection current_account: restricted }

    it "recusa assinar a conversa atribuída a outra pessoa" do
      subscribe(chatId: foreign_chat.id.to_s)

      expect(subscription).to be_rejected
    end

    it "aceita assinar a conversa da própria pessoa" do
      mine = create(:chat, connector: connector, external_id: "5511777777777@s.whatsapp.net", assigned_account_id: restricted.id.to_s)

      subscribe(chatId: mine.id.to_s)

      expect(subscription).to be_confirmed
    end

    it "não envia para a conversa atribuída a outra pessoa, mesmo com a assinatura aberta noutra" do
      mine = create(:chat, connector: connector, external_id: "5511777777777@s.whatsapp.net", assigned_account_id: restricted.id.to_s)
      subscribe(chatId: mine.id.to_s)

      expect(Chats::SendOperatorMessage).not_to receive(:call)

      perform :send_message, { "chatId" => foreign_chat.id.to_s, "message" => "oi" }
    end
  end

  describe "#subscribed" do
    it "escuta a stream da conversa, escopada pela organização" do
      subscribe_to_chat

      expect(subscription).to be_confirmed
      expect(subscription).to have_stream_from("org:#{organization.id}:chat:#{chat.id}")
    end

    it "aceita o parâmetro em snake_case também" do
      subscribe(chat_id: chat.id.to_s)

      expect(subscription).to be_confirmed
    end

    it "recusa sem conversa" do
      subscribe

      expect(subscription).to be_rejected
    end

    it "recusa conversa que não existe" do
      subscribe(chatId: BSON::ObjectId.new.to_s)

      expect(subscription).to be_rejected
    end

    it "recusa id malformado" do
      subscribe(chatId: "nao-e-um-id")

      expect(subscription).to be_rejected
    end

    it "recusa conversa de outra organização" do
      foreign = create(:chat, organization: create(:organization))

      subscribe(chatId: foreign.id.to_s)

      expect(subscription).to be_rejected
    end

    it "recusa quem não tem a permissão de chat" do
      stub_connection current_account: member_with("chat" => "none")

      subscribe_to_chat

      expect(subscription).to be_rejected
    end

    it "aceita membro com a permissão de chat" do
      stub_connection current_account: member_with("chat" => "all")

      subscribe_to_chat

      expect(subscription).to be_confirmed
    end

    it "recebe o que a mensagem transmite" do
      subscribe_to_chat

      expect { create(:chat_text_message, chat: chat, content: "Oi") }.to have_broadcasted_to(stream).with(a_hash_including("content" => "Oi"))
    end
  end

  describe "#unsubscribed e #unsubscribe" do
    it "para de escutar ao sair" do
      subscribe_to_chat

      subscription.unsubscribe_from_channel

      expect(subscription).not_to have_stream_from(stream)
    end

    it "a tela pode pedir para parar" do
      subscribe_to_chat

      perform :unsubscribe

      expect(subscription).not_to have_stream_from(stream)
    end
  end

  describe "#send_message" do
    before { subscribe_to_chat }

    describe "texto simples, sem citação nem divisão" do
      before { stub_provider("OUT-1") }

      it "manda uma vez, sem citação" do
        perform_send("Hello")

        expect(@sent).to contain_exactly(hash_including("number" => "5511999999999@s.whatsapp.net", "text" => "Hello"))
        expect(@sent.first).not_to have_key("quoted")
      end

      it "grava a mensagem do operador" do
        perform_send("Hello")

        expect(parent_message).to be_a(ChatMessage::Text)
        expect(parent_message).to have_attributes(
          role: "assistant",
          content: "Hello",
          sender_name: "Alice Prado",
          account_id: account.id,
          message_origin: "frontend",
          has_span: false,
          reply_to_message_id: nil,
          message_id: "OUT-1",
          status: "delivery_ack"
        )
      end

      it "aceita o chat_id em snake_case" do
        perform :send_message, "chat_id" => chat.id.to_s, "message" => "Hello"

        expect(@sent.size).to eq(1)
      end

      it "transmite a mensagem para quem está na conversa" do
        expect { perform_send("Hello") }.to have_broadcasted_to(stream).with(
          a_hash_including("content" => "Hello", "senderName" => "Alice Prado", "status" => "delivery_ack", "messageId" => "OUT-1")
        )
      end
    end

    describe "com a citação" do
      let(:replied) { create(:chat_text_message, chat: chat, content: "Pergunta", message_id: "WAID-PARENT") }

      before { stub_provider("OUT-1") }

      it "resolve o id externo e manda ao provedor" do
        perform_send("Respondendo!", replyToMessageId: replied.id.to_s)

        expect(@sent.first["quoted"]["key"]).to include("id" => "WAID-PARENT", "remoteJid" => "5511999999999@s.whatsapp.net")
      end

      it "aceita o parâmetro em snake_case" do
        perform_send("Respondendo!", reply_to_message_id: replied.id.to_s)

        expect(@sent.first["quoted"]["key"]["id"]).to eq("WAID-PARENT")
      end

      it "guarda o id local na mensagem" do
        perform_send("Respondendo!", replyToMessageId: replied.id.to_s)

        expect(messages.last.reply_to_message_id).to eq(replied.id.to_s)
      end
    end

    describe "com citação de uma mensagem que não existe" do
      it "manda sem citação e sem quebrar" do
        stub_provider("OUT-1")

        expect { perform_send("Hello", replyToMessageId: BSON::ObjectId.new.to_s) }.not_to raise_error

        expect(@sent.first).not_to have_key("quoted")
      end

      it "com o id malformado também" do
        stub_provider("OUT-1")

        perform_send("Hello", replyToMessageId: "ghost-id")

        expect(@sent.first).not_to have_key("quoted")
      end
    end

    describe "dividindo em partes" do
      let(:replied) { create(:chat_text_message, chat: chat, content: "Pergunta", message_id: "WAID-X") }

      before { stub_provider("OUT-1", "OUT-2") }

      it "manda cada parte em ordem" do
        perform_send(split_text)

        expect(@sent.map { |body| body["text"] }).to eq([ "Olá", "Tudo bem?" ])
      end

      it "cita só na primeira parte" do
        perform_send(split_text, replyToMessageId: replied.id.to_s)

        expect(@sent.first["quoted"]["key"]["id"]).to eq("WAID-X")
        expect(@sent.last).not_to have_key("quoted")
      end

      it "o id local fica em toda parte, para a tela mostrar o bloco de citação" do
        perform_send(split_text, replyToMessageId: replied.id.to_s)

        expect(spans.map(&:reply_to_message_id)).to all(eq(replied.id.to_s))
      end

      it "marca a original e grava cada parte com o próprio id" do
        perform_send(split_text)

        expect(parent_message).to have_attributes(content: split_text, has_span: true, message_id: nil)
        expect(spans.map { |span| [ span.content, span.message_id, span.status ] }).to eq(
          [ [ "Olá", "OUT-1", "delivery_ack" ], [ "Tudo bem?", "OUT-2", "delivery_ack" ] ]
        )
      end

      it "só as partes aparecem na lista" do
        perform_send(split_text)

        listed = ChatMessage::Base.unscoped.list_for_chat.where(chat_id: chat.id, :role.ne => "base").pluck(:content)

        expect(listed).to contain_exactly("Olá", "Tudo bem?")
      end
    end

    describe "com o nome do colaborador" do
      before { connector.set(send_collaborator_name: true) }

      it "prefixa só a primeira parte" do
        stub_provider("OUT-1", "OUT-2")

        perform_send(split_text)

        expect(@sent.map { |body| body["text"] }).to eq([ "*Alice Prado*\nOlá", "Tudo bem?" ])
      end

      it "prefixa o texto simples" do
        stub_provider("OUT-1")

        perform_send("Olá")

        expect(@sent.first["text"]).to eq("*Alice Prado*\nOlá")
      end

      it "não grava o prefixo no conteúdo" do
        stub_provider("OUT-1")

        perform_send("Olá")

        expect(parent_message.content).to eq("Olá")
      end
    end

    describe "o id que a WABA devolve" do
      let(:connector) { create(:connector_whatsapp_cloud, organization: organization) }
      let(:chat) { create(:chat, connector: connector, external_id: "5531971810932") }

      it "grava o wamid" do
        stub_request(:post, "https://graph.facebook.com/v19.0/#{connector.phone_number_id}/messages")
          .to_return(status: 200, body: { messages: [ { id: "wamid.XYZ" } ] }.to_json)

        perform_send("Hello")

        expect(parent_message).to have_attributes(message_id: "wamid.XYZ", status: "delivery_ack")
      end
    end

    describe "citando um anexo que não existe" do
      it "manda o resto do texto, sem o código" do
        stub_provider("OUT-1")

        perform_send("Hello attachment_id_999")

        expect(@sent.map { |body| body["text"] }).to eq([ "Hello" ])
      end
    end

    describe "com o provedor falhando" do
      before { stub_request(:post, send_url).to_return(status: 500, body: "fora do ar") }

      it "registra o erro, sem derrubar o canal" do
        allow(Rails.logger).to receive(:error)

        expect { perform_send("Hello") }.not_to raise_error

        expect(Rails.logger).to have_received(:error).with(/text dispatch failed/).at_least(:once)
      end

      it "a mensagem fica failed com a causa" do
        perform_send("Hello")

        expect(parent_message).to have_attributes(status: "failed", message_id: nil, status_message: a_string_including("fora do ar"))
      end

      it "a tela recebe o failed com a causa" do
        expect { perform_send("Hello") }.to have_broadcasted_to(stream).with(
          a_hash_including("content" => "Hello", "status" => "failed", "statusMessage" => a_string_including("fora do ar"))
        )
      end

      it "em texto dividido, cada parte fica failed com a causa" do
        perform_send(split_text)

        expect(spans).to all(have_attributes(status: "failed", status_message: a_string_including("fora do ar")))
      end
    end

    describe "com a rede fora" do
      it "fica failed com a causa" do
        stub_request(:post, send_url).to_timeout

        perform_send("Hello")

        expect(parent_message).to have_attributes(status: "failed", status_message: "execution expired")
      end
    end

    describe "com anexos no texto" do
      let(:media_url) { "http://evolution.test/message/sendMedia/#{connector.instance_name}" }
      let(:audio_url) { "http://evolution.test/message/sendWhatsAppAudio/#{connector.instance_name}" }
      let!(:attachment) { stub_attachment(filename: "foto.jpg", url: "https://cdn.exemplo.com/foto.jpg") }
      let!(:voice) { stub_attachment(filename: "recado.ogg", url: "https://cdn.exemplo.com/recado.ogg") }

      it "manda mídia pelo envio de mídia, e não de texto" do
        send_media = stub_request(:post, media_url)
                     .with(body: hash_including("mediatype" => "image", "media" => "https://cdn.exemplo.com/foto.jpg"))
                     .to_return(json_reply({ key: { id: "M1" } }))

        perform_send("attachment_id_#{attachment.id}")

        expect(send_media).to have_been_requested
        expect(a_request(:post, send_url)).not_to have_been_made
      end

      it "manda áudio pelo envio de áudio" do
        send_audio = stub_request(:post, audio_url)
                     .with(body: hash_including("audio" => "https://cdn.exemplo.com/recado.ogg"))
                     .to_return(json_reply({ key: { id: "A1" } }))

        perform_send("attachment_id_#{voice.id}")

        expect(send_audio).to have_been_requested
        expect(a_request(:post, media_url)).not_to have_been_made
      end

      it "grava a parte de mídia com quem enviou" do
        stub_request(:post, audio_url).to_return(json_reply({ key: { id: "A1" } }))

        perform_send("attachment_id_#{voice.id}")

        expect(spans.first).to be_a(ChatMessage::Media)
        expect(spans.first).to have_attributes(is_span: true, media_type: "audio", sender_name: "Alice Prado", account_id: account.id, message_id: "A1", status: "delivery_ack")
      end

      it "a mídia que o provedor recusa fica failed com a causa" do
        stub_request(:post, media_url).to_return(status: 500, body: "fora do ar")

        perform_send("attachment_id_#{attachment.id}")

        expect(spans.first).to have_attributes(status: "failed", status_message: a_string_including("fora do ar"))
      end
    end

    describe "num canal que ignora a citação (widget do site)" do
      let(:connector) { create(:connector_web_widget, organization: organization) }
      let(:chat) { create(:chat, connector: connector, external_id: "visitante-1") }

      it "aceita a chamada sem erro" do
        replied = create(:chat_text_message, chat: chat, message_id: "WB-0")

        expect { perform_send("Hello", replyToMessageId: replied.id.to_s) }
          .to have_broadcasted_to(connector.chat_stream(chat)).with(a_hash_including("content" => "Hello"))

        expect(messages.last.status).to eq("delivery_ack")
      end
    end

    describe "rastreabilidade" do
      before { stub_provider("OUT-1", "OUT-2") }

      it "a mensagem guarda o nome e a conta da conexão" do
        perform_send("Hello")

        expect(parent_message).to have_attributes(sender_name: "Alice Prado", account_id: account.id)
      end

      it "as partes de texto guardam a conta" do
        perform_send(split_text)

        expect(spans).to all(have_attributes(sender_name: "Alice Prado", account_id: account.id))
      end

      it "vale quem está na conexão, e não o que vem na mensagem" do
        other = create(:account, organization: organization, name: "Bruno Reis")

        perform_send("Hello", accountId: other.id, senderName: "Bruno Reis")

        expect(parent_message).to have_attributes(sender_name: "Alice Prado", account_id: account.id)
      end

      it "com outra conexão, outra autoria" do
        bob = create(:account, organization: organization, name: "Bruno Reis")
        stub_connection current_account: bob
        subscribe_to_chat

        perform_send("Hello")

        expect(parent_message).to have_attributes(sender_name: "Bruno Reis", account_id: bob.id)
      end
    end

    describe "intervenção humana" do
      before { stub_provider("OUT-1") }

      it "pausa a automação" do
        perform_send("Hello")

        expect(chat.reload.automation_enabled).to be(false)
      end

      it "a nota da pausa diz quem foi" do
        perform_send("Hello")

        expect(ChatMessage::Base.unscoped.where(chat_id: chat.id, role_base_type: "automation-toggle-notation").map(&:content))
          .to eq([ "Alice Prado pausou a automação." ])
      end

      it "agenda a volta pelo período da organização" do
        organization.update!(settings: { "automation_pause_period" => "minutes", "automation_pause_time_to" => 30 })

        expect { perform_send("Hello") }.to have_enqueued_job(EnableContactJob).with(chat.id.to_s, organization.id, kind_of(String))
      end

      it "sem período na organização, não agenda" do
        expect { perform_send("Hello") }.not_to have_enqueued_job(EnableContactJob)
      end
    end
  end

  describe "sem a permissão de chat, depois de assinar" do
    let(:member) { member_with("chat" => "all") }

    before do
      stub_connection current_account: member
      subscribe_to_chat
      member.access_role.update!(permissions: AccessRole::MEMBER_PERMISSIONS.merge("chat" => "none"))
    end

    it "#send_message não envia nem grava" do
      perform_send("Hello")

      expect(a_request(:post, send_url)).not_to have_been_made
      expect(messages).to be_empty
    end

    it "#send_reaction não reage" do
      target = create(:chat_text_message, chat: chat, message_id: "EVO-1")

      perform :send_reaction, "chatId" => chat.id.to_s, "messageId" => target.id.to_s, "emoji" => "👍"

      expect(a_request(:post, /sendReaction/)).not_to have_been_made
      expect(target.reload.reactions).to eq([])
    end

    it "#send_template_message não envia" do
      perform :send_template_message, "chatId" => chat.id.to_s, "templateId" => "tpl-1", "components" => []

      expect(messages).to be_empty
      expect(chat.reload.automation_enabled).to be(true)
    end
  end

  describe "isolamento entre organizações" do
    let(:other_organization) { create(:organization) }
    let(:foreign_connector) { create(:connector_whatsapp_web, organization: other_organization) }
    let(:foreign_chat) { create(:chat, connector: foreign_connector, external_id: "5531900000000") }
    let(:foreign_send_url) { "http://evolution.test/message/sendText/#{foreign_connector.instance_name}" }

    before { subscribe_to_chat }

    it "#send_message não alcança conversa de outra organização" do
      perform :send_message, "chatId" => foreign_chat.id.to_s, "message" => "Hello"

      expect(a_request(:post, foreign_send_url)).not_to have_been_made
      expect(ChatMessage::Base.unscoped.where(chat_id: foreign_chat.id).count).to eq(0)
      expect(foreign_chat.reload.automation_enabled).to be(true)
    end

    it "#send_message com conversa que não existe é um no-op" do
      expect { perform :send_message, "chatId" => BSON::ObjectId.new.to_s, "message" => "Hello" }.not_to raise_error

      expect(a_request(:post, send_url)).not_to have_been_made
    end

    it "#send_message não cita mensagem de outra organização" do
      foreign_message = create(:chat_text_message, chat: foreign_chat, message_id: "WAID-FORA")
      stub_provider("OUT-1")

      perform_send("Hello", replyToMessageId: foreign_message.id.to_s)

      expect(@sent.first).not_to have_key("quoted")
    end

    it "#send_reaction não alcança conversa de outra organização" do
      foreign_message = create(:chat_text_message, chat: foreign_chat, message_id: "EVO-FORA")

      perform :send_reaction, "chatId" => foreign_chat.id.to_s, "messageId" => foreign_message.id.to_s, "emoji" => "👍"

      expect(a_request(:post, /sendReaction/)).not_to have_been_made
      expect(foreign_message.reload.reactions).to eq([])
    end

    it "#send_reaction não alcança mensagem de outra conversa pela própria conversa" do
      foreign_message = create(:chat_text_message, chat: foreign_chat, message_id: "EVO-FORA")

      perform :send_reaction, "chatId" => chat.id.to_s, "messageId" => foreign_message.id.to_s, "emoji" => "👍"

      expect(a_request(:post, /sendReaction/)).not_to have_been_made
      expect(foreign_message.reload.reactions).to eq([])
    end

    it "#send_template_message não alcança conversa de outra organização" do
      foreign_template = create(:whatsapp_template, connector: create(:connector_whatsapp_cloud, organization: other_organization))
      foreign_chat.set(connector_id: foreign_template.connector_id)

      perform :send_template_message, "chatId" => foreign_chat.id.to_s, "templateId" => foreign_template.template_id, "components" => []

      expect(ChatMessage::Base.unscoped.where(chat_id: foreign_chat.id).count).to eq(0)
      expect(foreign_chat.reload.automation_enabled).to be(true)
    end
  end

  describe "#send_reaction" do
    let(:reaction_url) { "http://evolution.test/message/sendReaction/#{connector.instance_name}" }
    let(:target) { create(:chat_text_message, chat: chat, role: "assistant", message_id: "EVO-1") }

    def react(emoji = "👍", id = target.id.to_s)
      perform :send_reaction, "chatId" => chat.id.to_s, "messageId" => id, "emoji" => emoji
    end

    before { subscribe_to_chat }

    context "com o provedor aceitando" do
      before { stub_request(:post, reaction_url).to_return(json_reply({ key: { id: "R-1" } })) }

      it "envia e grava a reação em nome da conta da conexão" do
        react

        expect(a_request(:post, reaction_url).with(
          body: { key: { remoteJid: "5511999999999@s.whatsapp.net", fromMe: true, id: "EVO-1" }, reaction: "👍" }.to_json
        )).to have_been_made.once
        expect(target.reload.reactions.first).to include("emoji" => "👍", "from" => "assistant", "sender_name" => "Alice Prado", "account_id" => account.id)
      end

      it "aceita o message_id em snake_case" do
        perform :send_reaction, "chat_id" => chat.id.to_s, "message_id" => target.id.to_s, "emoji" => "👍"

        expect(target.reload.reactions.size).to eq(1)
      end

      it "alcança uma parte, porque a figurinha também recebe reação" do
        target.set(is_span: true)

        react

        expect(target.reload.reactions.size).to eq(1)
      end

      # A própria mensagem transmite quando `reactions` muda; não há evento além desse.
      it "em caso de sucesso, só a mensagem é transmitida" do
        target

        expect { react }.to have_broadcasted_to(stream).exactly(:once).with(
          a_hash_including("id" => target.id.to_s, "reactions" => [ a_hash_including("emoji" => "👍") ])
        )
      end

      it "trocar de emoji substitui, e vazio remove" do
        react("👍")
        react("🎉")
        expect(target.reload.reactions.map { |reaction| reaction["emoji"] }).to eq([ "🎉" ])

        react("")
        expect(target.reload.reactions).to eq([])
      end
    end

    context "com o serviço recusando" do
      let(:connector) { create(:connector_whatsapp_web, :zapi, organization: organization) }

      it "transmite a falha com as reações atuais, para a tela reverter" do
        target.set(reactions: [ { "emoji" => "❤️", "from" => "user" } ])

        expect { react }.to have_broadcasted_to(stream).with(
          "event" => "message_reaction_failed",
          "id" => target.id.to_s,
          "reactions" => [ { "emoji" => "❤️", "from" => "user" } ],
          "errors" => [ I18n.t("connectors.messages.reaction_unsupported") ]
        )
      end
    end

    context "com o provedor falhando" do
      it "transmite a falha sem gravar a reação" do
        stub_request(:post, reaction_url).to_return(status: 500, body: "erro")
        target

        expect { react }.to have_broadcasted_to(stream).with(
          a_hash_including("event" => "message_reaction_failed", "errors" => [ I18n.t("connectors.messages.reaction_failed") ])
        )
        expect(target.reload.reactions).to eq([])
      end
    end

    context "com a mensagem fora da conversa" do
      it "é um no-op" do
        expect { react("👍", BSON::ObjectId.new.to_s) }.not_to have_broadcasted_to(stream)

        expect(a_request(:post, reaction_url)).not_to have_been_made
      end
    end

    context "quando algo inesperado quebra" do
      it "registra sem derrubar o canal" do
        target
        connector.set(provider_api: "zapi")
        allow(Rails.logger).to receive(:error)
        allow(ChatMessageSerializer).to receive(:reactions).and_raise("boom")

        expect { react }.not_to raise_error

        expect(Rails.logger).to have_received(:error).with(/send_reaction/)
      end
    end
  end

  describe "#send_template_message" do
    let(:connector) { create(:connector_whatsapp_cloud, organization: organization) }
    let(:chat) { create(:chat, connector: connector, external_id: "5531971810932") }
    let(:graph_url) { "https://graph.facebook.com/v19.0/#{connector.phone_number_id}/messages" }
    let(:template) do
      create(:whatsapp_template, connector: connector, name: "lembrete", components: [ { "type" => "BODY", "text" => "Oi {{1}}" } ])
    end
    let(:components) { [ { "type" => "body", "parameters" => [ { "type" => "text", "text" => "Maria" } ] } ] }

    def perform_template(id: template.template_id, comps: components)
      perform :send_template_message, "chatId" => chat.id.to_s, "templateId" => id, "components" => comps
    end

    before { subscribe_to_chat }

    context "com a Meta aceitando" do
      before { stub_request(:post, graph_url).to_return(status: 200, body: { messages: [ { id: "wamid.TPL" } ] }.to_json) }

      it "cria a mensagem com a autoria da conexão" do
        perform_template

        expect(messages.last).to have_attributes(
          role: "assistant", sender_name: "Alice Prado", account_id: account.id, message_origin: "frontend", content: "Oi Maria"
        )
      end

      it "grava o id devolvido pela API" do
        perform_template

        expect(messages.last).to have_attributes(message_id: "wamid.TPL", status: "delivery_ack")
      end

      it "aceita o template_id em snake_case" do
        perform :send_template_message, "chat_id" => chat.id.to_s, "template_id" => template.template_id, "components" => components

        expect(messages.last.message_id).to eq("wamid.TPL")
      end

      it "pausa a automação, porque é uma pessoa intervindo, e a nota diz quem foi" do
        perform_template

        expect(chat.reload.automation_enabled).to be(false)
        expect(ChatMessage::Base.unscoped.where(chat_id: chat.id, role_base_type: "automation-toggle-notation").map(&:content))
          .to eq([ "Alice Prado pausou a automação." ])
      end

      it "transmite a mensagem para a conversa" do
        template

        expect { perform_template }.to have_broadcasted_to(stream).with(a_hash_including("content" => "Oi Maria", "status" => "delivery_ack"))
      end
    end

    context "com cabeçalho de mídia" do
      let(:image_url) { "https://cdn.exemplo.com/banner.jpg" }
      let(:template) do
        create(
          :whatsapp_template,
          connector: connector,
          name: "promocao",
          components: [
            { "type" => "HEADER", "format" => "IMAGE", "example" => { "header_url" => [ image_url ] } },
            { "type" => "BODY", "text" => "Oi {{1}}" }
          ]
        )
      end

      before { stub_request(:post, graph_url).to_return(status: 200, body: { messages: [ { id: "wamid.TPL" } ] }.to_json) }

      it "cria uma mensagem de imagem com a legenda renderizada" do
        perform_template

        expect(messages.last).to be_a(ChatMessage::Image)
        expect(messages.last).to have_attributes(image_url: image_url, caption: "Oi Maria", media_type: "image", message_id: "wamid.TPL")
      end

      it "manda o cabeçalho com o link para a Meta" do
        perform_template

        expect(a_request(:post, graph_url).with { |request|
          JSON.parse(request.body)["template"]["components"].first == {
            "type" => "header", "parameters" => [ { "type" => "image", "image" => { "link" => image_url } } ]
          }
        }).to have_been_made
      end

      it "cabeçalho de vídeo vira mensagem de mídia" do
        video = create(
          :whatsapp_template,
          connector: connector,
          name: "video_promocao",
          components: [
            { "type" => "HEADER", "format" => "VIDEO", "example" => { "header_url" => [ "https://cdn.exemplo.com/v.mp4" ] } },
            { "type" => "BODY", "text" => "Oi {{1}}" }
          ]
        )

        perform_template(id: video.template_id)

        expect(messages.last).to be_a(ChatMessage::Media)
        expect(messages.last).to have_attributes(media_url: "https://cdn.exemplo.com/v.mp4", media_type: "video", caption: "Oi Maria")
      end
    end

    context "com a Meta recusando" do
      it "a mensagem fica failed com a causa" do
        stub_request(:post, graph_url).to_return(status: 400, body: { error: { code: 132_000, message: "O modelo não existe" } }.to_json)

        perform_template

        expect(messages.last).to have_attributes(status: "failed", status_message: "O modelo não existe")
      end
    end

    context "com a rede fora" do
      it "a mensagem fica failed sem derrubar o canal" do
        stub_request(:post, graph_url).to_timeout

        expect { perform_template }.not_to raise_error

        expect(messages.last.status).to eq("failed")
      end
    end

    context "com um modelo que não existe" do
      it "registra e não envia" do
        allow(Rails.logger).to receive(:error)

        perform_template(id: "nao-existe")

        expect(Rails.logger).to have_received(:error).with(/Modelo não encontrado/)
        expect(messages).to be_empty
        expect(a_request(:post, graph_url)).not_to have_been_made
      end
    end

    context "com o modelo de outro conector" do
      it "não acha o modelo" do
        other = create(:whatsapp_template, connector: create(:connector_whatsapp_cloud, organization: organization))

        perform_template(id: other.template_id)

        expect(messages).to be_empty
      end
    end

    context "num conector sem modelos" do
      let(:connector) { create(:connector_whatsapp_web, organization: organization) }
      let(:chat) { create(:chat, connector: connector, external_id: "5531971810932") }
      let(:template) { nil }

      it "registra sem derrubar o canal" do
        allow(Rails.logger).to receive(:error)

        expect { perform_template(id: "tpl-1") }.not_to raise_error

        expect(Rails.logger).to have_received(:error).with(/send_template_message/)
      end
    end
  end
end
