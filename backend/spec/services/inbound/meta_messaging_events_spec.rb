require "rails_helper"

# Messenger e Instagram Direct, um endpoint só. Não havia spec disto na origem: os cenários vêm
# de `Api::V1::MetaMessagingController` e da documentação de webhooks da Meta.
RSpec.describe Inbound::MetaMessagingEvents do
  include ActiveJob::TestHelper
  include InboundHelpers

  let(:organization) { create(:organization) }
  let(:messenger) { create(:connector_messenger, organization: organization) }
  let(:instagram) { create(:connector_instagram, organization: organization) }
  let(:sender_id) { "PSID-1234" }
  let(:media_url) { "https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=1&signature=abc" }

  before do
    allow(Flows::InboundDispatcher).to receive(:call)
    stub_env("OPENAI_ACCESS_TOKEN" => nil)
  end

  def receive_event(connector: messenger, **event)
    object, entry_id = connector.is_a?(Connector::InstagramDirect) ? [ "instagram", connector.instagram_account_id ] : [ "page", connector.page_id ]

    described_class.new(webhook_payload(
      object: object,
      entry: [ { id: entry_id, time: 1_786_732_755_000, messaging: [ { sender: { id: sender_id }, recipient: { id: entry_id }, timestamp: 1_786_732_755_000 }.merge(event) ] } ]
    )).call
  end

  def receive_message(mid: "m_1", connector: messenger, **message)
    receive_event(connector: connector, message: { mid: mid, **message })
  end

  def receive_attachment(type, connector: messenger, url: media_url, mid: "m_1", **payload)
    receive_message(mid: mid, connector: connector, attachments: [ { type: type, payload: { url: url, **payload }.compact } ])
  end

  def chat_of(connector = messenger, external_id = sender_id)
    Chat.where(connector_id: connector.id, external_id: external_id).take
  end

  describe "qual conector" do
    it "Messenger vai pelo id da página" do
      receive_message(text: "Oi")

      expect(chat_of).to have_attributes(audience_type: "facebook", organization_id: organization.id)
    end

    it "Instagram vai pelo id da conta" do
      stub_request(:get, %r{graph\.instagram\.com/v22\.0/#{sender_id}}).to_return(status: 404)

      receive_message(text: "Oi", connector: instagram)

      expect(chat_of(instagram)).to have_attributes(audience_type: "instagram", organization_id: organization.id)
    end

    it "não mistura página com conta de Instagram de mesmo id" do
      messenger
      instagram.set(instagram_account_id: messenger.page_id)
      stub_request(:get, %r{graph\.instagram\.com}).to_return(status: 404)

      described_class.new(webhook_payload(
        object: "instagram",
        entry: [ { id: messenger.page_id, messaging: [ { sender: { id: sender_id }, message: { mid: "m_1", text: "Oi" } } ] } ]
      )).call

      expect(chat_of(instagram)).to be_present
      expect(chat_of).to be_nil
    end

    it "avisa e segue quando a entrada não é de nenhum conector" do
      allow(Rails.logger).to receive(:warn)

      described_class.new(webhook_payload(object: "page", entry: [ { id: "nao-existe", messaging: [ { sender: { id: sender_id }, message: { mid: "m_1", text: "Oi" } } ] } ])).call

      expect(Chat.where(external_id: sender_id).count).to eq(0)
      expect(Rails.logger).to have_received(:warn).with(a_string_including("Connector not found"))
    end

    it "ignora objeto de outra rede" do
      expect {
        described_class.new(webhook_payload(object: "whatsapp_business_account", entry: [ { id: messenger.page_id, messaging: [ { sender: { id: sender_id }, message: { mid: "m_1", text: "Oi" } } ] } ])).call
      }.not_to change(Chat, :count)
    end

    it "processa cada entrada no conector dela" do
      other = create(:connector_messenger, organization: create(:organization))

      described_class.new(webhook_payload(
        object: "page",
        entry: [ messenger, other ].map { |connector| { id: connector.page_id, messaging: [ { sender: { id: sender_id }, message: { mid: "m_#{connector.id}", text: "Oi" } } ] } }
      )).call

      expect(chat_of(messenger)).to be_present
      expect(chat_of(other)).to have_attributes(organization_id: other.organization_id)
    end

    it "não faz nada sem entradas" do
      expect { described_class.new(webhook_payload(object: "page")).call }.not_to raise_error
    end
  end

  describe "conversa" do
    it "abre com a automação padrão e a sessão" do
      organization.update!(settings: { "default_automation_enabled" => false })

      receive_message(text: "Oi")

      expect(chat_of).to have_attributes(automation_enabled: false, status: "open")
      expect(chat_of.session_start_at).to be_within(5.seconds).of(Time.current)
    end

    it "reaproveita a conversa do remetente, sem cair em outra" do
      decoy = create(:chat, connector: messenger, external_id: "OUTRO-PSID")
      target = create(:chat, connector: messenger, external_id: sender_id)

      receive_message(text: "Oi")

      expect(messages_of(target).count).to eq(1)
      expect(messages_of(decoy).count).to eq(0)
    end

    it "isola por conector" do
      other = create(:chat, connector: create(:connector_messenger, organization: organization), external_id: sender_id)

      receive_message(text: "Oi")

      expect(messages_of(other).count).to eq(0)
      expect(messages_of(chat_of).count).to eq(1)
    end

    # O remetente é um id da rede: não se aplicam as variantes de telefone.
    it "não trata o id como telefone" do
      numeric = "5531971810932"
      create(:chat, connector: messenger, external_id: "553171810932")

      described_class.new(webhook_payload(object: "page", entry: [ { id: messenger.page_id, messaging: [ { sender: { id: numeric }, message: { mid: "m_1", text: "Oi" } } ] } ])).call

      expect(chat_of(messenger, numeric)).to be_present
    end
  end

  describe "texto" do
    it "grava a mensagem do contato" do
      receive_message(text: "Olá, tudo bem?")

      expect(ChatMessage::Text.where(chat_id: chat_of.id, message_id: "m_1").take).to have_attributes(role: "user", content: "Olá, tudo bem?", message_origin: "platform")
    end

    it "entrega aos fluxos como primeira mensagem" do
      receive_message(text: "Olá")

      expect(Flows::InboundDispatcher).to have_received(:call).with(chat: chat_of, text: "Olá", event: "first_message", message_id: "m_1", sent_at: anything)
    end

    it "as seguintes são message_received" do
      receive_message(text: "Olá", mid: "m_1")
      receive_message(text: "Oi de novo", mid: "m_2")

      expect(Flows::InboundDispatcher).to have_received(:call).with(chat: chat_of, text: "Oi de novo", event: "message_received", message_id: "m_2", sent_at: anything)
    end

    it "atualiza a prévia e conta como não lida" do
      receive_message(text: "Olá")

      expect(chat_of).to have_attributes(last_message_content: "Olá", last_message_by: "user", last_message_type: "text", unread_messages: 1)
    end

    it "não duplica na reentrega" do
      2.times { receive_message(text: "Olá") }

      expect(messages_of(chat_of).count).to eq(1)
      expect(Flows::InboundDispatcher).to have_received(:call).once
    end

    it "com a automação da conversa desligada, grava e conta como não lida" do
      create(:chat, connector: messenger, external_id: sender_id, automation_enabled: false)

      receive_message(text: "Olá")

      expect(chat_of.unread_messages).to eq(1)
      expect(Flows::InboundDispatcher).not_to have_received(:call)
    end

    it "com texto e anexo, vale o texto" do
      expect {
        receive_message(text: "Olha", attachments: [ { type: "image", payload: { url: media_url } } ])
      }.not_to have_enqueued_job(ImageMessageJob)

      expect(messages_of(chat_of).pluck(:content)).to eq([ "Olha" ])
    end

    it "sem texto nem anexo não grava nada" do
      receive_message

      expect(messages_of(chat_of).count).to eq(0)
    end
  end

  describe "comandos" do
    let!(:send_text) do
      stub_request(:post, "https://graph.facebook.com/v22.0/#{messenger.page_id}/messages")
        .with(headers: { "Authorization" => "Bearer page-token" })
        .to_return(status: 200, headers: InboundHelpers::JSON_HEADERS, body: { message_id: "m_resposta" }.to_json)
    end

    # Na origem este caminho quebrava: usava uma variável `message` que não existe ali.
    it "CCTX limpa o contexto, responde ao remetente e não vira mensagem" do
      chat = create(:chat, connector: messenger, external_id: sender_id, automation_enabled: false)
      previous = create(:chat_text_message, chat: chat, content: "antes")

      receive_message(text: " cctx ")

      expect(previous.reload.active).to be(false)
      expect(chat.reload.automation_enabled).to be(true)
      expect(notes_of(chat, "context-clear").count).to eq(1)
      expect(send_text.with(body: hash_including("recipient" => { "id" => sender_id }, "message" => { "text" => "Contexto limpo" }))).to have_been_requested
      expect(ChatMessage::Text.where(chat_id: chat.id, message_id: "m_1").exists?).to be(false)
      expect(Flows::InboundDispatcher).not_to have_received(:call)
    end

    it "no Instagram responde pelo Graph do Instagram" do
      stub_request(:get, %r{graph\.instagram\.com/v22\.0/#{sender_id}}).to_return(status: 404)
      reply = stub_request(:post, "https://graph.instagram.com/v22.0/#{instagram.instagram_account_id}/messages")
        .with(headers: { "Authorization" => "Bearer ig-token" })
        .to_return(status: 200, headers: InboundHelpers::JSON_HEADERS, body: { message_id: "m_resposta" }.to_json)

      receive_message(text: "--CLEAR-CONTEXT--", connector: instagram)

      expect(reply).to have_been_requested
    end

    it "--RE-ACTIVE-ME-- é mensagem comum" do
      create(:chat, connector: messenger, external_id: sender_id, automation_enabled: false)

      receive_message(text: "--RE-ACTIVE-ME--")

      expect(chat_of.automation_enabled).to be(false)
      expect(messages_of(chat_of).pluck(:content)).to eq([ "--RE-ACTIVE-ME--" ])
    end
  end

  describe "anexos" do
    describe "imagem" do
      it "enfileira o job, sem baixar no webhook" do
        expect { receive_attachment("image") }.to have_enqueued_job(ImageMessageJob).with(
          anything, organization.id, media_url, "m_1", false, { mimetype: "image", extension: "jpg" }.to_json
        )
        expect(a_request(:get, media_url)).not_to have_been_made
      end

      it "do webhook até a imagem na conversa" do
        stub_request(:get, media_url).to_return(status: 200, body: "bytes-jpeg")

        perform_enqueued_jobs { receive_attachment("image") }

        message = ChatMessage::Image.where(chat_id: chat_of.id, message_id: "m_1").take
        expect(message).to have_attributes(role: "user", image_url: start_with("/rails/active_storage/blobs/proxy/"))
        expect(blob_of(message).download).to eq("bytes-jpeg")
        expect(blob_of(message).filename.to_s).to eq("m_1.jpg")
        expect(Flows::InboundDispatcher).to have_received(:call).with(chat: chat_of, text: "", event: "first_message", message_id: "m_1", sent_at: anything)
      end

      it "sem URL não enfileira" do
        expect { receive_attachment("image", url: nil) }.not_to have_enqueued_job
      end
    end

    describe "áudio" do
      it "enfileira o job de áudio" do
        expect { receive_attachment("audio") }.to have_enqueued_job(AudioMessageJob).with(anything, organization.id, media_url, "m_1", false)
      end

      it "do webhook até o áudio na conversa" do
        stub_request(:get, media_url).to_return(status: 200, body: "bytes-audio")

        perform_enqueued_jobs { receive_attachment("audio") }

        message = ChatMessage::Audio.where(chat_id: chat_of.id, message_id: "m_1").take
        expect(message).to have_attributes(role: "user", content: "-")
        expect(blob_of(message).download).to eq("bytes-audio")
        expect(chat_of.last_message_type).to eq("audio")
      end

      it "sem URL não enfileira" do
        expect { receive_attachment("audio", url: nil) }.not_to have_enqueued_job
      end
    end

    %w[video reel ig_reel].each do |type|
      describe type do
        it "enfileira como mp4" do
          expect { receive_attachment(type, name: "clipe.mp4", size: 1024) }.to have_enqueued_job(ImageMessageJob).with(
            anything, organization.id, media_url, "m_1", false,
            { mimetype: type, extension: "mp4", fileName: "clipe.mp4", fileLength: 1024 }.to_json
          )
        end

        it "do webhook até a mídia na conversa, com a extensão certa" do
          stub_request(:get, media_url).to_return(status: 200, body: "bytes-mp4")

          perform_enqueued_jobs { receive_attachment(type) }

          message = ChatMessage::Media.where(chat_id: chat_of.id, message_id: "m_1").take
          expect(message).to have_attributes(role: "user", media_type: type)
          expect(blob_of(message).filename.to_s).to eq("m_1.mp4")
        end
      end
    end

    describe "arquivo" do
      it "pega a extensão do nome" do
        expect { receive_attachment("file", name: "contrato.final.pdf", size: 2048) }.to have_enqueued_job(ImageMessageJob).with(
          anything, organization.id, media_url, "m_1", false,
          { mimetype: "file", extension: "pdf", fileName: "contrato.final.pdf", fileLength: 2048 }.to_json
        )
      end

      it "sem nome, a extensão é bin" do
        expect { receive_attachment("file") }.to have_enqueued_job(ImageMessageJob).with(
          anything, organization.id, media_url, "m_1", false, { mimetype: "file", extension: "bin" }.to_json
        )
      end

      it "do webhook até a mídia na conversa, com o nome e o tamanho" do
        stub_request(:get, media_url).to_return(status: 200, body: "%PDF")

        perform_enqueued_jobs { receive_attachment("file", name: "contrato.pdf", size: 2048) }

        message = ChatMessage::Media.where(chat_id: chat_of.id, message_id: "m_1").take
        expect(message).to have_attributes(media_type: "file", media_properties: { "fileName" => "contrato.pdf", "fileLength" => 2048 })
        expect(blob_of(message).filename.to_s).to eq("contrato.pdf")
      end
    end

    describe "fallback" do
      def receive_fallback(payload: nil, **attachment)
        receive_message(attachments: [ { type: "fallback", payload: payload, **attachment }.compact ])
      end

      def text
        ChatMessage::Text.where(chat_id: chat_of.id, message_id: "m_1").take&.content
      end

      it "vira texto com o título e o link" do
        receive_fallback(payload: { title: "Promoção", url: "https://loja.exemplo.com/p" })

        expect(text).to eq("Promoção — https://loja.exemplo.com/p")
        expect(Flows::InboundDispatcher).to have_received(:call).with(hash_including(text: "Promoção — https://loja.exemplo.com/p"))
      end

      it "só com o link" do
        receive_fallback(payload: { url: "https://loja.exemplo.com/p" })

        expect(text).to eq("https://loja.exemplo.com/p")
      end

      it "aceita o link fora do payload" do
        receive_fallback(title: "ignorado", url: "https://loja.exemplo.com/p")

        expect(text).to eq("https://loja.exemplo.com/p")
      end

      it "só com o título" do
        receive_fallback(payload: { title: "Promoção" })

        expect(text).to eq("Promoção")
      end

      it "vazio não grava nada" do
        receive_fallback(payload: {})

        expect(text).to be_nil
      end

      it "não duplica na reentrega" do
        2.times { receive_fallback(payload: { title: "Promoção" }) }

        expect(messages_of(chat_of).count).to eq(1)
      end
    end

    it "tipo que não conhecemos só vai para o log" do
      allow(Rails.logger).to receive(:warn)

      expect { receive_attachment("story_mention") }.not_to have_enqueued_job

      expect(Rails.logger).to have_received(:warn).with(a_string_including("Unsupported attachment type: story_mention"))
    end

    it "várias mídias na mesma mensagem ficam cada uma com o seu id" do
      attachments = [ { type: "image", payload: { url: "#{media_url}&n=1" } }, { type: "video", payload: { url: "#{media_url}&n=2" } }, { type: "audio", payload: { url: "#{media_url}&n=3" } } ]

      receive_message(attachments: attachments)

      expect(ImageMessageJob).to have_been_enqueued.with(anything, organization.id, "#{media_url}&n=1", "m_1", false, kind_of(String))
      expect(ImageMessageJob).to have_been_enqueued.with(anything, organization.id, "#{media_url}&n=2", "m_1-1", false, kind_of(String))
      expect(AudioMessageJob).to have_been_enqueued.with(anything, organization.id, "#{media_url}&n=3", "m_1-2", false)
    end

    it "não enfileira mídia que já chegou" do
      chat = create(:chat, connector: messenger, external_id: sender_id)
      create(:chat_image_message, chat: chat, message_id: "m_1")
      create(:chat_audio_message, chat: chat, message_id: "m_2")

      expect {
        receive_attachment("image", mid: "m_1")
        receive_attachment("audio", mid: "m_2")
      }.not_to have_enqueued_job
    end

    it "mídia que falha em todas as tentativas vira nota de erro" do
      stub_request(:get, media_url).to_return(status: 500)

      perform_enqueued_jobs { receive_attachment("image") }

      expect(notes_of(chat_of, "error").take.content).to eq("Chegou uma mídia que não foi possível baixar.")
      expect(messages_of(chat_of).count).to eq(0)
    end
  end

  describe "delivery" do
    let!(:chat) { create(:chat, connector: messenger, external_id: sender_id) }
    let!(:sent) { create(:chat_text_message, chat: chat, role: "assistant", message_id: "mid.ENVIADA", status: "server_ack") }

    it "marca as mensagens como entregues" do
      other = create(:chat_text_message, chat: chat, role: "assistant", message_id: "mid.OUTRA", status: "server_ack")

      receive_event(delivery: { mids: [ "mid.ENVIADA", "mid.OUTRA" ], watermark: 1_786_732_755_000 })

      expect(sent.reload.status).to eq("delivery_ack")
      expect(other.reload.status).to eq("delivery_ack")
    end

    it "não regride mensagem já lida" do
      sent.set(status: "read")

      receive_event(delivery: { mids: [ "mid.ENVIADA" ] })

      expect(sent.reload.status).to eq("read")
    end

    it "só alcança a conversa de quem recebeu" do
      other_chat = create(:chat, connector: messenger, external_id: "OUTRO-PSID")
      other_message = create(:chat_text_message, chat: other_chat, role: "assistant", message_id: "mid.ENVIADA", status: "server_ack")

      receive_event(delivery: { mids: [ "mid.ENVIADA" ] })

      expect(other_message.reload.status).to eq("server_ack")
    end

    it "transmite a mudança" do
      expect { receive_event(delivery: { mids: [ "mid.ENVIADA" ] }) }.to have_broadcasted_to(ChatMessage::Base.stream_for(chat))
    end

    it "sem mids não faz nada" do
      receive_event(delivery: { watermark: 1_786_732_755_000 })

      expect(sent.reload.status).to eq("server_ack")
    end

    it "sem conversa não faz nada" do
      chat.delete

      expect { receive_event(delivery: { mids: [ "mid.ENVIADA" ] }) }.not_to raise_error
    end

    it "não abre conversa" do
      expect {
        described_class.new(webhook_payload(object: "page", entry: [ { id: messenger.page_id, messaging: [ { sender: { id: "NOVO" }, delivery: { mids: [ "x" ] } } ] } ])).call
      }.not_to change(Chat, :count)
    end
  end

  describe "read" do
    let!(:chat) { create(:chat, connector: messenger, external_id: sender_id) }
    let(:watermark_time) { Time.zone.parse("2026-11-01 10:00:00") }
    let(:watermark) { (watermark_time.to_f * 1000).to_i }

    def sent_at(time, role: "assistant", **attributes)
      create(:chat_text_message, chat: chat, role: role, created_at: time, status: "delivery_ack", **attributes)
    end

    it "marca como lidas as nossas mensagens até o watermark" do
      before_mark = sent_at(watermark_time - 1.minute)
      on_mark = sent_at(watermark_time)

      receive_event(read: { watermark: watermark })

      expect(before_mark.reload.status).to eq("read")
      expect(on_mark.reload.status).to eq("read")
    end

    it "não marca o que veio depois do watermark" do
      after_mark = sent_at(watermark_time + 1.minute)

      receive_event(read: { watermark: watermark })

      expect(after_mark.reload.status).to eq("delivery_ack")
    end

    it "não mexe nas mensagens do contato" do
      from_contact = sent_at(watermark_time - 1.minute, role: "user")

      receive_event(read: { watermark: watermark })

      expect(from_contact.reload.status).to eq("delivery_ack")
    end

    it "só alcança a conversa de quem leu" do
      other_chat = create(:chat, connector: messenger, external_id: "OUTRO-PSID")
      other = create(:chat_text_message, chat: other_chat, role: "assistant", created_at: watermark_time - 1.minute, status: "delivery_ack")

      receive_event(read: { watermark: watermark })

      expect(other.reload.status).to eq("delivery_ack")
    end

    it "sem watermark não faz nada" do
      message = sent_at(watermark_time - 1.minute)

      receive_event(read: { mid: "x" })

      expect(message.reload.status).to eq("delivery_ack")
    end

    it "sem conversa não faz nada" do
      chat.delete

      expect { receive_event(read: { watermark: watermark }) }.not_to raise_error
    end
  end

  describe "postback" do
    it "grava o título do botão como texto do contato" do
      receive_event(postback: { title: "Quero comprar", payload: "COMPRAR" })

      expect(messages_of(chat_of).take).to have_attributes(role: "user", content: "Quero comprar", message_id: "postback_1786732755000")
    end

    it "entrega aos fluxos" do
      receive_event(postback: { title: "Quero comprar", payload: "COMPRAR" })

      expect(Flows::InboundDispatcher).to have_received(:call).with(chat: chat_of, text: "Quero comprar", event: "first_message", message_id: "postback_1786732755000", sent_at: anything)
    end

    it "sem título, usa o payload" do
      receive_event(postback: { payload: "COMPRAR" })

      expect(messages_of(chat_of).take.content).to eq("COMPRAR")
    end

    it "vazio não abre conversa" do
      receive_event(postback: { title: "", mid: "x" })

      expect(chat_of).to be_nil
    end

    it "não duplica na reentrega, porque o id vem do momento do evento" do
      2.times { receive_event(postback: { title: "Quero comprar" }) }

      expect(messages_of(chat_of).count).to eq(1)
    end
  end

  describe "is_echo" do
    it "o eco do que enviamos não abre conversa nem grava nada" do
      receive_message(is_echo: true, text: "Enviado por nós")

      expect(chat_of).to be_nil
      expect(Flows::InboundDispatcher).not_to have_received(:call)
    end

    it "não pausa a automação de quem já está na conversa" do
      chat = create(:chat, connector: messenger, external_id: sender_id)

      receive_message(is_echo: true, text: "Enviado por nós")

      expect(chat.reload.automation_enabled).to be(true)
      expect(messages_of(chat).count).to eq(0)
    end
  end

  describe "outros eventos" do
    it "reação é ignorada" do
      allow(Rails.logger).to receive(:info)

      receive_event(reaction: { mid: "m_1", action: "react", emoji: "👍" })

      expect(chat_of).to be_nil
      expect(Rails.logger).to have_received(:info).with(a_string_including("Reaction event received"))
    end

    it "tipo desconhecido vai para o log" do
      allow(Rails.logger).to receive(:warn)

      receive_event(optin: { ref: "x" })

      expect(chat_of).to be_nil
      expect(Rails.logger).to have_received(:warn).with(a_string_including("Unknown event type"))
    end
  end

  describe "perfil do remetente do Instagram" do
    def stub_profile(status: 200, body: {})
      stub_request(:get, "https://graph.instagram.com/v22.0/#{sender_id}")
        .with(query: { fields: "name,username,profile_pic", access_token: "ig-token" })
        .to_return(status: status, headers: InboundHelpers::JSON_HEADERS, body: body.to_json)
    end

    def receive_on_instagram
      receive_message(text: "Oi", connector: instagram)
    end

    it "preenche a conversa nova com nome, foto e @" do
      stub_profile(body: { name: "Ana Lima", username: "analima", profile_pic: "https://img/ana.png" })

      receive_on_instagram

      expect(chat_of(instagram)).to have_attributes(user_name: "Ana Lima", audience_user_name: "analima", profile_picture_url: "https://img/ana.png")
    end

    it "sem nome, o @ faz o papel" do
      stub_profile(body: { username: "analima" })

      receive_on_instagram

      expect(chat_of(instagram)).to have_attributes(user_name: "analima", audience_user_name: "analima")
    end

    it "a conversa abre mesmo sem conseguir ler o perfil" do
      stub_profile(status: 400, body: { error: { message: "nope" } })

      receive_on_instagram

      expect(chat_of(instagram)).to have_attributes(user_name: nil, audience_type: "instagram")
      expect(messages_of(chat_of(instagram)).count).to eq(1)
    end

    it "sem token, nem tenta ler o perfil" do
      instagram.set(instagram_user_access_token_ciphertext: nil)

      receive_on_instagram

      expect(a_request(:get, /graph\.instagram\.com/)).not_to have_been_made
      expect(chat_of(instagram)).to be_present
    end

    it "só lê o perfil ao abrir a conversa" do
      profile = stub_profile(body: { name: "Ana Lima" })

      receive_message(text: "Oi", mid: "m_1", connector: instagram)
      receive_message(text: "De novo", mid: "m_2", connector: instagram)

      expect(profile).to have_been_requested.once
    end

    it "o Messenger não lê perfil" do
      receive_message(text: "Oi")

      expect(a_request(:get, /graph\.instagram\.com/)).not_to have_been_made
      expect(chat_of.user_name).to be_nil
    end

    it "anexo também abre a conversa com o perfil" do
      stub_profile(body: { name: "Ana Lima" })

      receive_attachment("image", connector: instagram)

      expect(chat_of(instagram).user_name).to eq("Ana Lima")
    end
  end
  describe "contato novo em rajada" do
    it "espera a conversa que outro processo está criando, em vez de abrir outra" do
      connector = create(:connector_messenger, organization: organization)
      Rails.cache.write("chats.creation.#{connector.id}.PSID-RAJADA", true)
      other = nil
      allow(Chats::Locator).to receive(:sleep) { other ||= create(:chat, connector: connector, external_id: "PSID-RAJADA") }

      described_class.new(
        { object: "page", entry: [ { id: connector.page_id, messaging: [ { sender: { id: "PSID-RAJADA" }, message: { mid: "m-rajada", text: "oi" } } ] } ] }.with_indifferent_access
      ).call

      expect(Chat.where(connector_id: connector.id, external_id: "PSID-RAJADA").count).to eq(1)
      expect(ChatMessage::Text.where(chat_id: other.id, message_id: "m-rajada").exists?).to be(true)
    end
  end
end
