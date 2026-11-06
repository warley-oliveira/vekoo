require "rails_helper"

# Webhooks da Z-API. A spec de origem (zapi_controller_spec) só testava a resolução da conversa
# e o cartão de anúncio, chamando método privado do controlador; aqui o evento inteiro passa
# pelo banco de verdade, e cobre o que lá só existia no código.
RSpec.describe Inbound::ZapiEvents do
  include ActiveJob::TestHelper
  include ActiveSupport::Testing::TimeHelpers
  include InboundHelpers

  let(:organization) { create(:organization) }
  let(:connector) { create(:connector_whatsapp_web, :zapi, organization: organization) }
  let(:phone) { "5531971810932" }
  let(:message_id) { "3EB0B1C5F4D2A" }
  let(:zapi_url) { "https://api.z-api.io/instances/INST123/token/TOKABC" }

  before do
    allow(Flows::InboundDispatcher).to receive(:call)
    stub_env("OPENAI_ACCESS_TOKEN" => nil)
  end

  def events(payload, on: connector)
    described_class.new(webhook_payload(payload), connector: on)
  end

  def receive_message(on: connector, **payload)
    events({ phone: phone, messageId: message_id, fromMe: false, senderName: "Ana Lima", text: { message: "Tem horário?" } }.merge(payload).compact, on: on).on_message_received
  end

  def chat_of(number = phone)
    Chat.where(connector_id: connector.id, external_id: number).take
  end

  def stub_send_text(url = zapi_url)
    stub_request(:post, "#{url}/send-text").to_return(status: 200, headers: InboundHelpers::JSON_HEADERS, body: { messageId: "RESPOSTA" }.to_json)
  end

  def alert_service
    instance_double("OrganizationAlertServiceDouble").tap do |service|
      allow(service).to receive(:connector_disconnected)
      allow(service).to receive(:connector_reconnected)
      stub_const("OrganizationAlertService", service)
    end
  end

  describe "#on_message_received" do
    describe "o que é ignorado" do
      after do
        expect(Chat.where(connector_id: connector.id).count).to eq(0)
        expect(Flows::InboundDispatcher).not_to have_received(:call)
      end

      it("grupo") { receive_message(isGroup: true) }
      it("canal") { receive_message(isNewsletter: true) }
      it("notificação") { receive_message(notification: "MEMBERSHIP_APPROVAL_REQUEST") }
    end

    # Regressão da origem: um default_scope com `.or` fazia `.first` devolver uma conversa
    # arbitrária. A isca nasce antes do alvo: busca ampla demais cairia nela.
    describe "resolução da conversa" do
      context "com uma isca anterior no mesmo conector" do
        let!(:decoy) { create(:chat, connector: connector, external_id: "5531900000000") }
        let!(:target) { create(:chat, connector: connector, external_id: phone) }

        it "resolve a conversa do remetente, nunca a isca" do
          receive_message

          expect(messages_of(target).count).to eq(1)
          expect(messages_of(decoy).count).to eq(0)
        end

        it "acha pela variante sem o 9º dígito" do
          receive_message(phone: "553171810932")

          expect(messages_of(target).count).to eq(1)
          expect(Chat.where(connector_id: connector.id).count).to eq(2)
        end
      end

      it "isola por conector" do
        other = create(:chat, connector: create(:connector_whatsapp_web, :zapi, organization: organization), external_id: phone)
        target = create(:chat, connector: connector, external_id: phone)

        receive_message

        expect(messages_of(target).count).to eq(1)
        expect(messages_of(other).count).to eq(0)
      end

      it "acha a conversa gravada com o sufixo do JID" do
        with_suffix = create(:chat, connector: connector, external_id: "#{phone}@s.whatsapp.net")

        receive_message

        expect(messages_of(with_suffix).count).to eq(1)
      end

      it "sem conversa, cria uma nova sem reaproveitar a isca" do
        decoy = create(:chat, connector: connector, external_id: "5531900000000")

        receive_message

        expect(chat_of.id).not_to eq(decoy.id)
        expect(chat_of).to have_attributes(organization_id: organization.id, status: "open", user_name: "Ana Lima", automation_enabled: true)
      end

      it "conversa nova nasce com a foto e a automação padrão da organização" do
        organization.update!(settings: { "default_automation_enabled" => false })

        receive_message(senderPhoto: "https://img/ana.png")

        expect(chat_of).to have_attributes(profile_picture_url: "https://img/ana.png", automation_enabled: false)
      end
    end

    describe "@lid" do
      let(:lid) { "206317981536394@lid" }

      it "phone com @lid acha a conversa pelo external_lid, sem cair na isca" do
        create(:chat, connector: connector, external_id: "5531900000000")
        target = create(:chat, connector: connector, external_id: "5531888888888", external_lid: lid)

        receive_message(phone: lid)

        expect(messages_of(target).count).to eq(1)
        expect(target.reload.external_id).to eq("5531888888888")
      end

      it "chatLid acha a conversa quando o telefone não acha nada" do
        target = create(:chat, connector: connector, external_id: "5531888888888", external_lid: lid)

        receive_message(chatLid: lid)

        expect(messages_of(target).count).to eq(1)
      end

      it "telefone vale antes do chatLid, e a conversa aprende o @lid" do
        target = create(:chat, connector: connector, external_id: phone)

        receive_message(chatLid: lid)

        expect(messages_of(target).count).to eq(1)
        expect(target.reload.external_lid).to eq(lid)
      end

      it "só com @lid, cria a conversa com ele nos dois campos" do
        receive_message(phone: lid)

        chat = Chat.where(connector_id: connector.id).take
        expect(chat).to have_attributes(external_id: lid, external_lid: lid, organization_id: organization.id, user_name: "Ana Lima")
      end

      it "não repete o @lid que já está gravado" do
        chat = create(:chat, connector: connector, external_id: "5531888888888", external_lid: "outro@lid")

        receive_message(phone: "5531888888888", chatLid: lid)

        expect(chat.reload.external_lid).to eq("outro@lid")
      end

      it "registro antigo com @lid em external_id leva o valor para external_lid" do
        legacy = create(:chat, connector: connector, external_id: lid, external_lid: nil)

        receive_message(phone: lid)

        expect(legacy.reload).to have_attributes(external_id: lid, external_lid: lid)
        expect(messages_of(legacy).count).to eq(1)
      end

      it "registro antigo com @lid@s.whatsapp.net perde o sufixo" do
        legacy = create(:chat, connector: connector, external_id: "#{lid}@s.whatsapp.net", external_lid: nil)

        receive_message(phone: lid)

        expect(legacy.reload).to have_attributes(external_id: lid, external_lid: lid)
      end

      it "quando chega o telefone de verdade, ele entra no lugar do @lid" do
        legacy = create(:chat, connector: connector, external_id: lid, external_lid: lid)

        receive_message(phone: phone, chatLid: lid)

        expect(legacy.reload).to have_attributes(external_id: phone, external_lid: lid)
      end
    end

    describe "contexto da conversa" do
      let!(:chat) { create(:chat, connector: connector, external_id: phone, user_name: "Antigo", profile_picture_url: "https://img/antiga.png", last_message_at: 1.day.ago) }

      it "limpa a presença, atualiza nome e foto e sobe a conversa" do
        Rails.cache.write("presence.#{chat.id}", "composing")

        receive_message(senderName: "Ana Maria", senderPhoto: "https://img/nova.png")

        expect(Rails.cache.read("presence.#{chat.id}")).to be_nil
        expect(chat.reload).to have_attributes(user_name: "Ana Maria", profile_picture_url: "https://img/nova.png")
        expect(chat.last_message_at.to_time).to be_within(5.seconds).of(Time.current)
      end

      it "usa photo quando não vem senderPhoto" do
        receive_message(photo: "https://img/chat.png")

        expect(chat.reload.profile_picture_url).to eq("https://img/chat.png")
      end

      it "não apaga nome e foto quando o webhook não traz" do
        receive_message(senderName: nil)

        expect(chat.reload).to have_attributes(user_name: "Antigo", profile_picture_url: "https://img/antiga.png")
      end

      it "normaliza o nome, tirando caractere de controle" do
        receive_message(senderName: "Ana\u0000 Lima​")

        expect(chat.reload.user_name).to start_with("Ana Lima")
      end

      it "limpa o contexto por inatividade, com a opção ligada" do
        organization.update!(settings: { "auto_clear_context_enabled" => true, "auto_clear_context_interval" => 1 })
        old = create(:chat_text_message, chat: chat, content: "antiga")
        chat.set(last_message_at: 2.hours.ago)

        receive_message

        expect(old.reload.active).to be(false)
        expect(notes_of(chat, "context-clear").take.content).to eq("Limpeza de contexto por inatividade")
        expect(Flows::InboundDispatcher).to have_received(:call).with(hash_including(event: "first_message"))
      end
    end

    describe "reentrega" do
      it "a trava de 15 segundos segura a mesma mensagem" do
        2.times { receive_message }

        expect(messages_of(chat_of).count).to eq(1)
        expect(Flows::InboundDispatcher).to have_received(:call).once
      end

      it "depois da trava, a marca de 5 minutos segura" do
        receive_message
        travel(1.minute) { receive_message }

        expect(messages_of(chat_of).count).to eq(1)
      end

      it "depois de tudo expirar, a mensagem gravada ainda segura" do
        receive_message
        travel(6.minutes) { receive_message }

        expect(messages_of(chat_of).count).to eq(1)
        expect(Flows::InboundDispatcher).to have_received(:call).once
      end

      it "o eco do que nós mesmos enviamos pela API não vira mensagem" do
        receive_message(fromApi: true, fromMe: true)

        expect(messages_of(chat_of).count).to eq(0)
      end

      it "não enfileira a mesma mídia duas vezes" do
        image = { image: { imageUrl: "https://z/foto.jpg" }, text: nil }

        expect { 2.times { receive_message(**image) } }.to have_enqueued_job(ImageMessageJob).once
      end
    end

    # O job refaz tudo depois de um erro: as travas não podem barrar a própria retentativa.
    describe "nova tentativa depois de um erro" do
      it "levanta para o job e consegue gravar na segunda" do
        allow(ChatMessage::Text).to receive(:create!).and_raise(StandardError, "mongo fora")

        expect { receive_message }.to raise_error(StandardError, "mongo fora")

        allow(ChatMessage::Text).to receive(:create!).and_call_original
        receive_message

        expect(messages_of(chat_of).pluck(:message_id)).to eq([ message_id ])
        expect(Flows::InboundDispatcher).to have_received(:call).once
      end
    end

    describe "texto" do
      it "grava a mensagem do contato" do
        receive_message

        expect(ChatMessage::Text.where(chat_id: chat_of.id, message_id: message_id).take).to have_attributes(
          role: "user", content: "Tem horário?", message_origin: "platform"
        )
      end

      it "usa o momento do provedor, que vem em milissegundos" do
        receive_message(momment: 1_786_732_755_123)

        expect(ChatMessage::Text.where(chat_id: chat_of.id).take.created_at.to_i).to eq(1_786_732_755)
      end

      it "entrega aos fluxos como primeira mensagem" do
        receive_message

        expect(Flows::InboundDispatcher).to have_received(:call).with(chat: chat_of, text: "Tem horário?", event: "first_message", message_id: message_id)
      end

      it "as seguintes são message_received" do
        receive_message(messageId: "Z1")
        receive_message(messageId: "Z2", text: { message: "Oi?" })

        expect(Flows::InboundDispatcher).to have_received(:call).with(chat: chat_of, text: "Oi?", event: "message_received", message_id: "Z2")
      end

      it "conta como não lida" do
        receive_message

        expect(chat_of).to have_attributes(unread_messages: 1, last_message_content: "Tem horário?", last_message_by: "user", last_message_type: "text")
      end

      it "texto vazio não é mensagem" do
        receive_message(text: { message: "" })

        expect(messages_of(chat_of).count).to eq(0)
      end
    end

    describe "resposta citada (referenceMessageId)" do
      let!(:chat) { create(:chat, connector: connector, external_id: phone) }

      it "aponta para a mensagem citada" do
        quoted = create(:chat_text_message, chat: chat, role: "assistant", message_id: "CITADA")

        receive_message(referenceMessageId: "CITADA")

        expect(ChatMessage::Text.where(chat_id: chat.id, message_id: message_id).take.reply_to_message_id).to eq(quoted.id.to_s)
      end

      it "fica sem citação quando a mensagem não está no histórico" do
        receive_message(referenceMessageId: "NAO_EXISTE")

        expect(ChatMessage::Text.where(chat_id: chat.id, message_id: message_id).take.reply_to_message_id).to be_nil
      end
    end

    describe "mensagem nossa, de outro aparelho" do
      let!(:chat) { create(:chat, connector: connector, external_id: phone, user_name: "Ana Lima", unread_messages: 2) }

      before { organization.update!(settings: { "automation_pause_period" => "minutes", "automation_pause_time_to" => 30 }) }

      it "texto entra como nosso, pausa a automação e agenda a volta" do
        expect {
          receive_message(fromMe: true, senderName: "Loja", chatName: "Ana Lima", text: { message: "Já te atendo" })
        }.to have_enqueued_job(EnableContactJob)

        expect(ChatMessage::Text.where(chat_id: chat.id).take).to have_attributes(role: "assistant", message_origin: "user", content: "Já te atendo")
        expect(chat.reload).to have_attributes(automation_enabled: false, unread_messages: 0, last_message_by: "assistant")
        expect(chat.automation_resume_at).to be_within(5.seconds).of(30.minutes.from_now)
        expect(Flows::InboundDispatcher).not_to have_received(:call)
      end

      it "o nome da conversa vem de chatName, não de quem enviou" do
        receive_message(fromMe: true, senderName: "Loja", chatName: "Ana Maria")

        expect(chat.reload.user_name).to eq("Ana Maria")
      end

      it "imagem pausa depois de baixada" do
        stub_request(:get, "https://z/foto.jpg").to_return(status: 200, body: "jpeg")

        perform_enqueued_jobs(only: ImageMessageJob) do
          receive_message(fromMe: true, chatName: "Ana Lima", text: nil, image: { imageUrl: "https://z/foto.jpg", caption: "Segue", mimeType: "image/jpeg" })
        end

        expect(ChatMessage::Image.where(chat_id: chat.id).take).to have_attributes(role: "assistant", caption: "Segue", message_origin: "user")
        expect(chat.reload).to have_attributes(automation_enabled: false, unread_messages: 0)
      end

      it "áudio pausa depois de baixado" do
        stub_request(:get, "https://z/audio.ogg").to_return(status: 200, body: "ogg")

        perform_enqueued_jobs(only: AudioMessageJob) do
          receive_message(fromMe: true, chatName: "Ana Lima", text: nil, audio: { audioUrl: "https://z/audio.ogg" })
        end

        expect(ChatMessage::Audio.where(chat_id: chat.id).take).to have_attributes(role: "assistant", content: "")
        expect(chat.reload.automation_enabled).to be(false)
      end

      it "documento pausa depois de baixado" do
        stub_request(:get, "https://z/doc.pdf").to_return(status: 200, body: "%PDF")

        perform_enqueued_jobs(only: ImageMessageJob) do
          receive_message(fromMe: true, chatName: "Ana Lima", text: nil, document: { documentUrl: "https://z/doc.pdf", mimeType: "application/pdf", fileName: "a.pdf" })
        end

        expect(chat.reload.automation_enabled).to be(false)
      end
    end

    describe "comandos" do
      let!(:chat) { create(:chat, connector: connector, external_id: phone, automation_enabled: false) }
      let!(:send_text) { stub_send_text }

      [ "--CLEAR-CONTEXT--", "CCTX", "cctx" ].each do |command|
        it "#{command} limpa o contexto, responde e não vira mensagem" do
          previous = create(:chat_text_message, chat: chat, content: "antes")

          receive_message(text: { message: command })

          expect(previous.reload.active).to be(false)
          expect(chat.reload.automation_enabled).to be(true)
          expect(notes_of(chat, "context-clear").take.content).to eq("Contexto limpo")
          expect(ChatMessage::Text.where(chat_id: chat.id, message_id: message_id).exists?).to be(false)
          expect(send_text.with(body: hash_including("phone" => phone, "message" => "Contexto limpo"))).to have_been_requested
          expect(Flows::InboundDispatcher).not_to have_received(:call)
        end
      end

      it "CCTX zera o freio de contato" do
        Rails.cache.write(Chats::InboundThrottle.counter_key(chat), 20)

        receive_message(text: { message: "CCTX" })

        expect(Rails.cache.read(Chats::InboundThrottle.counter_key(chat))).to be_nil
      end

      # Na Z-API da origem o comando não diferencia maiúsculas.
      [ "--RE-ACTIVE-ME--", "--re-active-me--" ].each do |command|
        it "#{command} religa a automação e confirma" do
          receive_message(text: { message: command })

          expect(chat.reload.automation_enabled).to be(true)
          expect(send_text.with(body: hash_including("message" => "Certo, sua conversa está ativa de novo."))).to have_been_requested
          expect(messages_of(chat).count).to eq(0)
        end
      end

      # Como na origem, o comando vale também digitado no nosso aparelho: é assim que a
      # pessoa devolve a conversa para a automação depois de assumir.
      it "--RE-ACTIVE-ME-- digitado do nosso lado também religa, em vez de pausar" do
        receive_message(fromMe: true, chatName: "Ana", text: { message: "--RE-ACTIVE-ME--" })

        expect(chat.reload.automation_enabled).to be(true)
        expect(messages_of(chat).count).to eq(0)
      end

      it "contato só com @lid recebe a resposta no próprio @lid" do
        lid = "206317981536394@lid"
        create(:chat, connector: connector, external_id: lid, external_lid: lid)

        receive_message(phone: lid, text: { message: "CCTX" })

        expect(send_text.with(body: hash_including("phone" => lid))).to have_been_requested
      end

      it "PFUP, que era do assistente, é mensagem comum" do
        receive_message(text: { message: "PFUP" })

        expect(messages_of(chat).pluck(:content)).to eq([ "PFUP" ])
      end
    end

    describe "áudio" do
      let(:audio) { { audio: { audioUrl: "https://z/audio.ogg", mimeType: "audio/ogg" }, text: nil } }

      it "enfileira o job com o que ele precisa para baixar" do
        chat = create(:chat, connector: connector, external_id: phone)

        expect { receive_message(**audio) }.to have_enqueued_job(AudioMessageJob).with(
          chat.id.to_s, organization.id, "https://z/audio.ogg", message_id, false, "Ana Lima",
          { phone: phone, messageId: message_id, fromMe: false, senderName: "Ana Lima", momment: nil, type: "audio", audio: audio[:audio] }.to_json
        )
      end

      it "do webhook até o áudio na conversa" do
        stub_request(:get, "https://z/audio.ogg").to_return(status: 200, body: "bytes-ogg")

        perform_enqueued_jobs { receive_message(**audio) }

        message = ChatMessage::Audio.where(chat_id: chat_of.id, message_id: message_id).take
        expect(blob_of(message).download).to eq("bytes-ogg")
        expect(Flows::InboundDispatcher).to have_received(:call).with(hash_including(chat: chat_of, event: "first_message"))
      end

      it "sem URL não enfileira" do
        expect { receive_message(audio: { mimeType: "audio/ogg" }, text: nil) }.not_to have_enqueued_job(AudioMessageJob)
      end
    end

    describe "imagem" do
      def image(**extra)
        { image: { imageUrl: "https://z/foto.jpg", caption: "Olha", mimeType: "image/jpeg" }.merge(extra), text: nil }
      end

      it "enfileira com o tipo e a legenda" do
        expect { receive_message(**image) }.to have_enqueued_job(ImageMessageJob).with(
          anything, organization.id, "https://z/foto.jpg", message_id, false,
          { mimetype: "image/jpeg", caption: "Olha" }.to_json, kind_of(String)
        )
      end

      it "sem tipo, assume image" do
        expect { receive_message(**image(mimeType: nil)) }.to have_enqueued_job(ImageMessageJob).with(
          anything, organization.id, "https://z/foto.jpg", message_id, false,
          { mimetype: "image", caption: "Olha" }.to_json, kind_of(String)
        )
      end

      it "do webhook até a imagem na conversa" do
        stub_request(:get, "https://z/foto.jpg").to_return(status: 200, body: "bytes-jpeg")

        perform_enqueued_jobs { receive_message(**image) }

        message = ChatMessage::Image.where(chat_id: chat_of.id, message_id: message_id).take
        expect(message).to have_attributes(role: "user", caption: "Olha")
        expect(blob_of(message).download).to eq("bytes-jpeg")
        expect(Flows::InboundDispatcher).to have_received(:call).with(hash_including(text: "Olha"))
      end

      it "sem URL não enfileira" do
        expect { receive_message(image: { caption: "Olha" }, text: nil) }.not_to have_enqueued_job(ImageMessageJob)
      end
    end

    describe "documento e vídeo" do
      it "documento enfileira com as propriedades dele" do
        document = { documentUrl: "https://z/doc.pdf", mimeType: "application/pdf", fileName: "orçamento.pdf", title: "Orçamento", caption: "Segue" }

        expect { receive_message(document: document, text: nil) }.to have_enqueued_job(ImageMessageJob).with(
          anything, organization.id, "https://z/doc.pdf", message_id, false,
          { mimetype: "application/pdf", fileName: "orçamento.pdf", title: "Orçamento", caption: "Segue" }.to_json, kind_of(String)
        )
      end

      it "vídeo enfileira com a URL do vídeo" do
        expect { receive_message(video: { videoUrl: "https://z/video.mp4", mimeType: "video/mp4", caption: "Veja" }, text: nil) }.to have_enqueued_job(ImageMessageJob).with(
          anything, organization.id, "https://z/video.mp4", message_id, false,
          { mimetype: "video/mp4", fileName: nil, title: nil, caption: "Veja" }.to_json, kind_of(String)
        )
      end

      it "do webhook até o documento na conversa, com nome e tipo reais" do
        stub_request(:get, "https://z/doc.pdf").to_return(status: 200, body: "%PDF")

        perform_enqueued_jobs do
          receive_message(document: { documentUrl: "https://z/doc.pdf", mimeType: "application/pdf", fileName: "orcamento.pdf" }, text: nil)
        end

        message = ChatMessage::Media.where(chat_id: chat_of.id, message_id: message_id).take
        expect(message).to have_attributes(media_type: "application/pdf", media_properties: include("fileName" => "orcamento.pdf"))
        expect(blob_of(message)).to have_attributes(content_type: "application/pdf")
        expect(blob_of(message).filename.to_s).to eq("orcamento.pdf")
      end

      it "do webhook até o vídeo na conversa" do
        stub_request(:get, "https://z/video.mp4").to_return(status: 200, body: "mp4")

        perform_enqueued_jobs do
          receive_message(video: { videoUrl: "https://z/video.mp4", mimeType: "video/mp4", caption: "Veja" }, text: nil)
        end

        expect(ChatMessage::Media.where(chat_id: chat_of.id, message_id: message_id).take).to have_attributes(media_type: "video/mp4", caption: "Veja")
      end

      it "sem URL não enfileira" do
        expect { receive_message(document: { fileName: "a.pdf" }, text: nil) }.not_to have_enqueued_job(ImageMessageJob)
      end
    end

    describe "tipo não suportado" do
      {
        "figurinha" => { sticker: { stickerUrl: "https://z/f.webp" } },
        "localização" => { location: { latitude: -19.9 } },
        "contato" => { contact: { displayName: "Ana" } },
        "desconhecido" => { algo: true }
      }.each do |name, content|
        it "#{name} não vira mensagem" do
          allow(Rails.logger).to receive(:warn)

          expect { receive_message(text: nil, **content) }.not_to have_enqueued_job

          expect(messages_of(chat_of).count).to eq(0)
          expect(Rails.logger).to have_received(:warn).with(a_string_including("Unsupported message type"))
        end
      end
    end

    # A mensagem ainda não chegou inteira: fica a nota até a Z-API entregar o conteúdo.
    describe "mensagem aguardando" do
      def waiting
        receive_message(text: nil, waitingMessage: true)
      end

      it "registra a nota" do
        waiting

        expect(notes_of(chat_of, "waiting-message").take).to have_attributes(content: ".", missing_message: true)
        expect(messages_of(chat_of).count).to eq(0)
        expect(Flows::InboundDispatcher).not_to have_received(:call)
      end

      it "o conteúdo que chega depois, com o mesmo id, é gravado e vai para os fluxos" do
        waiting
        receive_message(text: { message: "Agora chegou" })

        expect(ChatMessage::Text.where(chat_id: chat_of.id, message_id: message_id).take.content).to eq("Agora chegou")
        expect(Flows::InboundDispatcher).to have_received(:call).with(hash_including(text: "Agora chegou", event: "first_message"))
      end

      it "a reentrega do aviso não abre outra nota" do
        2.times { waiting }

        expect(notes_of(chat_of, "waiting-message").count).to eq(1)
      end
    end

    # Saudação de anúncio (Click-to-WhatsApp): o webhook traz `externalAdReply` e a mensagem do
    # contato. Fica um cartão (nota 'base') e a mensagem segue o caminho normal.
    describe "cartão de anúncio (CTWA)" do
      let!(:chat) { create(:chat, connector: connector, external_id: "558382186331", automation_enabled: true) }
      let(:ad) do
        {
          title: "Obter Oferta",
          body: "ATENÇÃO, MORADORES DE MASSARANDUBA!",
          mediaType: 2,
          mediaUrl: "https://www.facebook.com/reel/1600018434891894/",
          thumbnailUrl: "https://cdn.exemplo.com/thumb.jpg",
          sourceType: "ad",
          sourceId: "120246672247670342",
          sourceUrl: "https://www.instagram.com/p/DZYZqvEDGYP/",
          sourceApp: "instagram",
          automatedGreetingMessageShown: true,
          greetingMessageBody: "Seja bem-vindo à ZONA SAT RASTREAMENTO!",
          originalImageUrl: "https://scontent.xx.fbcdn.net/v/t15/722215515.jpg",
          ctwaClid: "Afg9J8FuQlciv8gaClv5A8miepenBpIV"
        }
      end

      def receive_ad(**payload)
        receive_message(phone: "558382186331", messageId: "AD-MSG-1", senderName: "Kaiky", text: { message: "Bom" }, externalAdReply: ad, **payload)
      end

      def cards
        notes_of(chat, "instagram-ad-greeting")
      end

      it "cria o cartão de saudação" do
        expect { receive_ad }.to change { cards.count }.by(1)
      end

      it "guarda o conteúdo e os metadados do anúncio" do
        receive_ad

        card = cards.take
        expect(card).to have_attributes(role: "base", content: "Seja bem-vindo à ZONA SAT RASTREAMENTO!", message_origin: "platform")
        expect(card.external_ad_reply).to include(
          "title" => "Obter Oferta",
          "body" => "ATENÇÃO, MORADORES DE MASSARANDUBA!",
          "source_app" => "instagram",
          "source_type" => "ad",
          "source_id" => "120246672247670342",
          "source_url" => "https://www.instagram.com/p/DZYZqvEDGYP/",
          "media_url" => "https://www.facebook.com/reel/1600018434891894/",
          "media_type" => 2,
          "thumbnail_url" => "https://cdn.exemplo.com/thumb.jpg",
          "original_image_url" => "https://scontent.xx.fbcdn.net/v/t15/722215515.jpg",
          "greeting_message_body" => "Seja bem-vindo à ZONA SAT RASTREAMENTO!",
          "automated_greeting_message_shown" => true,
          "ctwa_clid" => "Afg9J8FuQlciv8gaClv5A8miepenBpIV"
        )
      end

      it "põe o cartão um segundo antes da mensagem do contato" do
        receive_ad(momment: 1_786_732_755_000)

        expect(cards.take.created_at.to_i).to eq(1_786_732_754)
      end

      it "também segue o caminho normal até os fluxos" do
        receive_ad

        expect(messages_of(chat).pluck(:content)).to eq([ "Bom" ])
        expect(Flows::InboundDispatcher).to have_received(:call).with(chat: chat, text: "Bom", event: "first_message", message_id: "AD-MSG-1")
      end

      it "o cartão em si não desliga a automação" do
        receive_ad

        expect(chat.reload.automation_enabled).to be(true)
      end

      it "sem externalAdReply não cria cartão" do
        receive_message(phone: "558382186331", messageId: "PLAIN-1", text: { message: "Olá" })

        expect(cards.count).to eq(0)
      end

      it "o conteúdo cai para o título e por fim para o texto padrão" do
        receive_ad(externalAdReply: ad.except(:greetingMessageBody), messageId: "AD-1")
        receive_ad(externalAdReply: { sourceId: "1", ctwaClid: "outro" }, messageId: "AD-2")

        expect(cards.pluck(:content)).to contain_exactly("Obter Oferta", "Mensagem de saudação automática")
      end

      it "a reentrega do webhook não duplica o cartão" do
        receive_ad
        travel(6.minutes) { receive_ad }

        expect(cards.count).to eq(1)
      end

      it "a nova tentativa do job não duplica o cartão" do
        allow(ChatMessage::Text).to receive(:create!).and_raise(StandardError, "mongo fora")

        expect { receive_ad }.to raise_error(StandardError, "mongo fora")

        allow(ChatMessage::Text).to receive(:create!).and_call_original
        receive_ad

        expect(cards.count).to eq(1)
        expect(messages_of(chat).count).to eq(1)
      end

      it "o mesmo clique em outra mensagem não abre outro cartão" do
        receive_ad
        receive_ad(messageId: "AD-MSG-2", text: { message: "Ainda quero" })

        expect(cards.count).to eq(1)
        expect(messages_of(chat).count).to eq(2)
      end

      it "mídia vinda de anúncio também ganha o cartão" do
        expect { receive_ad(text: nil, image: { imageUrl: "https://z/foto.jpg" }) }.to have_enqueued_job(ImageMessageJob)

        expect(cards.count).to eq(1)
      end

      it "a primeira mensagem continua sendo a primeira com o cartão gravado antes" do
        create(:chat_text_message, chat: chat, role: "base", role_base_type: "instagram-ad-greeting", content: "cartão anterior")

        receive_ad

        expect(Flows::InboundDispatcher).to have_received(:call).with(hash_including(event: "first_message"))
      end
    end
  end

  describe "#on_whatsapp_disconnected" do
    def disconnected(**payload)
      events({ type: "DisconnectedCallback", instanceId: "INST123", disconnected: true, phone: "5531971810932", **payload }).on_whatsapp_disconnected
    end

    def log
      Connector::DisconnectionLog.where(connector_id: connector.id.to_s).take
    end

    it "fecha o conector" do
      disconnected

      expect(connector.reload.status).to eq(:closed)
    end

    it "traduz o erro conhecido, no log e no aviso" do
      service = alert_service

      disconnected(error: "It was not possible to restore a session with the current token, please login again ")

      reason = "Não foi possível restaurar a sessão com o token atual. Conecte de novo."
      expect(log).to have_attributes(translated_reason: reason, organization_id: organization.id, instance_id: "INST123")
      expect(service).to have_received(:connector_disconnected).with(organization, connector, message: reason)
    end

    it "guarda o erro original e o trecho do webhook" do
      disconnected(error: "algo novo")

      expect(log).to have_attributes(raw_error: "algo novo", translated_reason: "algo novo")
      expect(log.payload_snapshot).to include("error" => "algo novo", "instanceId" => "INST123", "disconnected" => true)
    end

    it "sem erro, avisa com a mensagem padrão" do
      service = alert_service

      disconnected

      expect(log).to have_attributes(raw_error: nil, translated_reason: nil)
      expect(service).to have_received(:connector_disconnected).with(organization, connector, message: "O WhatsApp \"Loja da Ana\" foi desconectado.")
    end

    it "não derruba o webhook sem o serviço de avisos" do
      expect { disconnected }.not_to raise_error
    end
  end

  describe "#on_whatsapp_connected" do
    def connected(**payload)
      events({ type: "ConnectedCallback", connected: true, phone: "5531988887777", **payload }).on_whatsapp_connected
    end

    context "conector aguardando o QR code" do
      before { connector.set(status_cd: "pending") }

      it "ativa e guarda o número" do
        connected

        expect(connector.reload).to have_attributes(status: :active, number_id: "5531988887777")
      end

      it "transmite success_scan" do
        expect { connected }.to have_broadcasted_to(connector.stream_name).with(status: "success_scan", base64: "")
      end

      it "assina a instância" do
        stub_env("ZAPI_ACCOUNT_TOKEN" => "conta")
        sign = stub_request(:post, "#{zapi_url}/integrator/on-demand/subscription")
          .with(headers: { "Authorization" => "Bearer conta" })
          .to_return(status: 201)

        connected

        expect(sign).to have_been_requested
      end

      it "falha na assinatura não derruba o webhook" do
        stub_env("ZAPI_ACCOUNT_TOKEN" => nil)

        expect { connected }.not_to raise_error
        expect(connector.reload.status).to eq(:active)
      end

      it "traz para cá as conversas de conector antigo com o mesmo número" do
        old = create(:connector_whatsapp_web, :zapi, organization: organization, number_id: "5531988887777", status: :closed)
        chat = create(:chat, connector: old, external_id: phone)

        connected

        expect(chat.reload.connector_id).to eq(connector.id)
      end

      it "resolve o aviso de desconexão" do
        service = alert_service

        connected

        expect(service).to have_received(:connector_reconnected).with(organization, connector)
      end
    end

    context "conector que já estava ativo" do
      it "não mexe no status nem transmite, mas resolve o aviso" do
        service = alert_service

        expect { connected }.not_to have_broadcasted_to(connector.stream_name)

        expect(connector.reload).to have_attributes(status: :active, number_id: "5531971810932")
        expect(service).to have_received(:connector_reconnected).with(organization, connector)
      end
    end
  end

  # O conector próprio da Z-API (instância de quem contratou direto) passa pelos mesmos eventos.
  describe "com Connector::Zapi" do
    let(:connector) { create(:connector_zapi, organization: organization) }
    let(:zapi_url) { "https://api.z-api.io/instances/ZINST/token/ZTOKEN" }

    it "grava e entrega o texto" do
      receive_message

      expect(messages_of(chat_of).count).to eq(1)
      expect(Flows::InboundDispatcher).to have_received(:call).with(hash_including(chat: chat_of))
    end

    it "baixa a imagem pela URL" do
      stub_request(:get, "https://z/foto.jpg").to_return(status: 200, body: "bytes-jpeg")

      perform_enqueued_jobs { receive_message(text: nil, image: { imageUrl: "https://z/foto.jpg", mimeType: "image/jpeg" }) }

      expect(blob_of(ChatMessage::Image.where(chat_id: chat_of.id).take).download).to eq("bytes-jpeg")
    end

    it "responde ao comando" do
      send_text = stub_send_text(zapi_url)

      receive_message(text: { message: "CCTX" })

      expect(send_text).to have_been_requested
    end

    it "ativa com os dados da instância ao conectar" do
      connector.set(status_cd: "pending")
      stub_request(:get, "#{zapi_url}/device").to_return(status: 200, headers: InboundHelpers::JSON_HEADERS, body: { phone: "5531988887777", displayName: "Padaria" }.to_json)
      stub_request(:get, "#{zapi_url}/profile-picture").to_return(status: 200, headers: InboundHelpers::JSON_HEADERS, body: { link: "https://img/p.png" }.to_json)

      events({ connected: true, phone: "5531988887777" }).on_whatsapp_connected

      expect(connector.reload).to have_attributes(status: :active, phone_number: "5531988887777", profile_name: "Padaria", profile_picture_url: "https://img/p.png")
    end

    it "fecha ao desconectar" do
      events({ error: "algo" }).on_whatsapp_disconnected

      expect(connector.reload.status).to eq(:closed)
      expect(Connector::DisconnectionLog.where(connector_id: connector.id.to_s).take.instance_id).to eq("ZINST")
    end
  end
end
