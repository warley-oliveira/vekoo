require "rails_helper"

# Webhook da WhatsApp Cloud API. Na origem o controlador respondia e processava no mesmo
# request, e os headers X-Waba-* contavam o que aconteceu; aqui quem conta é `diagnostics`, e
# o que acontecia dentro de TextMessageJob virou a chamada a `Flows::InboundDispatcher`.
RSpec.describe Inbound::WhatsappCloudEvents do
  include ActiveJob::TestHelper
  include InboundHelpers

  let(:organization) { create(:organization) }
  let(:connector) { create(:connector_whatsapp_cloud, organization: organization) }
  let(:from_number) { "5531971810932" }
  let(:waba_message_id) { "wamid.HBgMNTUzMTgzNzk0MTM3FQIAEhggQUNBNDVBQUY5QzI2OEQzQUVCNDBCQ0U0MzVGODQ3ODIA" }

  before do
    allow(Flows::InboundDispatcher).to receive(:call)
    stub_env("OPENAI_ACCESS_TOKEN" => nil)
  end

  def webhook(messages: nil, statuses: nil, contacts: nil, entry_id: connector.waba_id, phone_number_id: connector.phone_number_id)
    webhook_payload(
      object: "whatsapp_business_account",
      entry: [ {
        id: entry_id.to_s,
        changes: [ {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "553133330000", phone_number_id: phone_number_id.to_s },
            contacts: contacts || [ { profile: { name: "Maria Souza" }, wa_id: from_number } ],
            statuses: statuses,
            messages: messages
          }.compact
        } ]
      } ]
    )
  end

  def text_message(id: waba_message_id, from: from_number, body: "Olá", **extra)
    { from: from, id: id, timestamp: "1777384162", type: "text", text: { body: body }, **extra }
  end

  def receive_webhook(payload)
    described_class.new(payload, connector: connector).call
  end

  def receive_text(**options)
    receive_webhook(webhook(messages: [ text_message(**options) ]))
  end

  def chat_of(number = from_number)
    Chat.where(connector_id: connector.id, external_id: number).take
  end

  describe "mensagem de texto" do
    it "grava a mensagem com os atributos certos" do
      receive_text

      message = ChatMessage::Text.where(chat_id: chat_of.id, message_id: waba_message_id).take
      expect(message).to have_attributes(role: "user", content: "Olá", message_origin: "platform", reply_to_message_id: nil)
    end

    it "abre a conversa com organização, nome do contato, sessão e número de origem" do
      receive_text

      expect(chat_of).to have_attributes(
        organization_id: organization.id,
        user_name: "Maria Souza",
        status: "open",
        sender_phone_number_id: connector.phone_number_id,
        automation_enabled: true
      )
      expect(chat_of.session_start_at).to be_within(5.seconds).of(Time.current)
    end

    it "lê o nome do contato de quem mandou, não do primeiro da lista" do
      receive_webhook(webhook(
        contacts: [ { profile: { name: "Outra Pessoa" }, wa_id: "5511900000000" }, { profile: { name: "Maria Souza" }, wa_id: from_number } ],
        messages: [ text_message ]
      ))

      expect(chat_of.user_name).to eq("Maria Souza")
    end

    it "não quebra sem nó de contatos" do
      payload = webhook(messages: [ text_message ])
      payload[:entry][0][:changes][0][:value].delete(:contacts)

      expect { receive_webhook(payload) }.not_to raise_error
      expect(chat_of.user_name).to be_nil
    end

    it "entrega aos fluxos como primeira mensagem" do
      receive_text

      expect(Flows::InboundDispatcher).to have_received(:call).with(
        chat: chat_of, text: "Olá", event: "first_message", message_id: waba_message_id
      )
    end

    it "entrega as seguintes como message_received" do
      receive_text(id: "wamid.1")
      receive_text(id: "wamid.2", body: "Tudo bem?")

      expect(Flows::InboundDispatcher).to have_received(:call).with(
        chat: chat_of, text: "Tudo bem?", event: "message_received", message_id: "wamid.2"
      )
    end

    it "relata o que foi processado sem avisos nem erros" do
      expect(receive_text).to eq(processed: [ "text:#{waba_message_id}" ], warnings: [], errors: [])
    end

    it "ignora texto sem o nó `text`" do
      message = text_message.except(:text)

      receive_webhook(webhook(messages: [ message ]))

      expect(Chat.where(connector_id: connector.id).count).to eq(0)
      expect(Flows::InboundDispatcher).not_to have_received(:call)
    end

    it "com a automação padrão desligada, grava e conta como não lida sem chamar os fluxos" do
      organization.update!(settings: { "default_automation_enabled" => false })

      receive_text

      expect(chat_of).to have_attributes(automation_enabled: false, unread_messages: 1)
      expect(messages_of(chat_of).count).to eq(1)
      expect(Flows::InboundDispatcher).not_to have_received(:call)
    end
  end

  # Regressão da origem: um default_scope com `.or` fazia `.first` devolver uma conversa
  # arbitrária. A isca nasce antes do alvo: busca ampla demais cairia nela.
  describe "resolução da conversa" do
    let!(:decoy) { create(:chat, connector: connector, external_id: "5531900000000", sender_phone_number_id: connector.phone_number_id) }
    let!(:target) { create(:chat, connector: connector, external_id: from_number, sender_phone_number_id: connector.phone_number_id) }

    it "associa a mensagem ao alvo, nunca à isca" do
      receive_text

      expect(messages_of(target).pluck(:message_id)).to eq([ waba_message_id ])
      expect(messages_of(decoy).count).to eq(0)
    end

    it "entrega aos fluxos com a conversa certa" do
      receive_text

      expect(Flows::InboundDispatcher).to have_received(:call).with(hash_including(chat: target))
    end

    it "acha a conversa quando a Meta manda o número sem o 9º dígito" do
      receive_text(from: "553171810932")

      expect(messages_of(target).count).to eq(1)
      expect(Chat.where(connector_id: connector.id).count).to eq(2)
    end

    it "acha a conversa gravada sem o 9º dígito quando o número chega com ele" do
      old_form = create(:chat, connector: connector, external_id: "553188887777", sender_phone_number_id: connector.phone_number_id)

      receive_text(from: "5531988887777")

      expect(messages_of(old_form).count).to eq(1)
    end

    it "acha a conversa gravada com o sufixo do JID" do
      with_suffix = create(:chat, connector: connector, external_id: "5531988887777@s.whatsapp.net", sender_phone_number_id: connector.phone_number_id)

      receive_text(from: "5531988887777")

      expect(messages_of(with_suffix).count).to eq(1)
    end

    it "não mistura com o mesmo número em outro conector" do
      other_connector = create(:connector_whatsapp_cloud, organization: organization)
      other = create(:chat, connector: other_connector, external_id: from_number)

      receive_text

      expect(messages_of(other).count).to eq(0)
      expect(messages_of(target).count).to eq(1)
    end

    it "cada número da conta tem a própria conversa com o contato" do
      receive_webhook(webhook(messages: [ text_message ], phone_number_id: connector.phone_number_id + 1))

      other = Chat.where(connector_id: connector.id, sender_phone_number_id: connector.phone_number_id + 1).take
      expect(other).to be_present
      expect(other.id).not_to eq(target.id)
      expect(messages_of(target).count).to eq(0)
    end

    it "adota a conversa antiga que ainda não tem número de origem" do
      legacy = create(:chat, connector: connector, external_id: "5531977776666", sender_phone_number_id: nil)

      receive_text(from: "5531977776666")

      expect(legacy.reload.sender_phone_number_id).to eq(connector.phone_number_id)
      expect(messages_of(legacy).count).to eq(1)
    end

    it "preenche a sessão da conversa que nunca teve uma" do
      target.set(session_start_at: nil)

      receive_text

      expect(target.reload.session_start_at).to be_within(5.seconds).of(Time.current)
    end
  end

  # O webhook de aplicativo da Meta é um só: vale o conector do `entry.id`, não o da URL.
  describe "roteamento pelo entry.id" do
    let(:other_connector) { create(:connector_whatsapp_cloud, organization: create(:organization)) }

    it "manda para o conector dono da WABA" do
      receive_webhook(webhook(messages: [ text_message ], entry_id: other_connector.waba_id))

      expect(Chat.where(connector_id: other_connector.id, external_id: from_number).exists?).to be(true)
      expect(chat_of).to be_nil
    end

    it "aceita o id do business, no conector sem WABA" do
      other_connector.update!(waba_id: nil)

      receive_webhook(webhook(messages: [ text_message ], entry_id: other_connector.business_id))

      expect(Chat.where(connector_id: other_connector.id).take.organization_id).to eq(other_connector.organization_id)
    end

    it "fica no conector da URL quando o entry.id não é de ninguém" do
      receive_webhook(webhook(messages: [ text_message ], entry_id: 669_519_285_653_650))

      expect(chat_of).to be_present
    end
  end

  describe "reentrega" do
    it "não duplica o texto nem chama os fluxos de novo" do
      2.times { receive_text }

      expect(messages_of(chat_of).count).to eq(1)
      expect(chat_of.unread_messages).to eq(1)
      expect(Flows::InboundDispatcher).to have_received(:call).once
    end

    it "não duplica o botão" do
      button = { from: from_number, id: "wamid.BTN", type: "button", button: { payload: "Sim", text: "Sim" } }

      2.times { receive_webhook(webhook(messages: [ button ])) }

      expect(messages_of(chat_of).count).to eq(1)
    end

    it "não enfileira mídia que já chegou" do
      chat = create(:chat, connector: connector, external_id: from_number, sender_phone_number_id: connector.phone_number_id)
      create(:chat_image_message, chat: chat, message_id: "wamid.IMG")

      expect {
        receive_webhook(webhook(messages: [ { from: from_number, id: "wamid.IMG", type: "image", image: { id: "M1" } } ]))
      }.not_to have_enqueued_job(ImageMessageJob)
    end
  end

  describe "resposta citada (context.id)" do
    let(:chat) { create(:chat, connector: connector, external_id: from_number, sender_phone_number_id: connector.phone_number_id) }

    it "aponta para a mensagem citada" do
      quoted = create(:chat_text_message, chat: chat, role: "assistant", message_id: "wamid.CITADA")

      receive_text(context: { from: "553133330000", id: "wamid.CITADA" })

      expect(ChatMessage::Text.where(chat_id: chat.id, message_id: waba_message_id).take.reply_to_message_id).to eq(quoted.id.to_s)
    end

    it "fica sem citação quando a mensagem não está no histórico" do
      chat

      receive_text(context: { from: "553133330000", id: "wamid.NAO-EXISTE" })

      expect(ChatMessage::Text.where(chat_id: chat.id, message_id: waba_message_id).take.reply_to_message_id).to be_nil
    end

    it "não acha citação em outra conversa" do
      other_chat = create(:chat, connector: connector, external_id: "5531900000000")
      create(:chat_text_message, chat: other_chat, message_id: "wamid.DA-OUTRA")
      chat

      receive_text(context: { id: "wamid.DA-OUTRA" })

      expect(ChatMessage::Text.where(chat_id: chat.id, message_id: waba_message_id).take.reply_to_message_id).to be_nil
    end
  end

  # A Meta entrega o botão de resposta rápida de template como `type: 'button'`, sem nó `text`.
  describe "botão de template" do
    let(:button_id) { "wamid.HBgNBUTTON2A0FC4870B50AF1025" }

    def button_message(button: { payload: "Conferir orçamento", text: "Conferir orçamento" }, **extra)
      { from: from_number, id: button_id, timestamp: "1780424465", type: "button", button: button, **extra }
    end

    it "grava o rótulo como texto do contato" do
      receive_webhook(webhook(messages: [ button_message ]))

      expect(ChatMessage::Text.where(chat_id: chat_of.id, message_id: button_id).take).to have_attributes(
        role: "user", content: "Conferir orçamento", message_origin: "platform"
      )
    end

    it "segue o caminho normal até os fluxos" do
      receive_webhook(webhook(messages: [ button_message ]))

      expect(Flows::InboundDispatcher).to have_received(:call).with(
        chat: chat_of, text: "Conferir orçamento", event: "first_message", message_id: button_id
      )
    end

    it "relata como button, sem avisos" do
      result = receive_webhook(webhook(messages: [ button_message ]))

      expect(result).to eq(processed: [ "button:#{button_id}" ], warnings: [], errors: [])
    end

    it "usa o payload quando o botão não tem texto" do
      receive_webhook(webhook(messages: [ button_message(button: { payload: "SIM_QUERO" }) ]))

      expect(ChatMessage::Text.where(chat_id: chat_of.id, message_id: button_id).take.content).to eq("SIM_QUERO")
    end

    it "guarda a mensagem do template como citada" do
      chat = create(:chat, connector: connector, external_id: from_number, sender_phone_number_id: connector.phone_number_id)
      template = create(:chat_text_message, chat: chat, role: "assistant", message_id: "wamid.TEMPLATE")

      receive_webhook(webhook(messages: [ button_message(context: { from: "553133330000", id: "wamid.TEMPLATE" }) ]))

      expect(ChatMessage::Text.where(chat_id: chat.id, message_id: button_id).take.reply_to_message_id).to eq(template.id.to_s)
    end
  end

  # A regra do status é de `WabaStatusUpdateService`, com spec própria. Aqui, o caminho até
  # ele e o que volta para o diagnóstico.
  describe "status" do
    let(:chat) { create(:chat, connector: connector, external_id: from_number) }
    let!(:sent_message) { create(:chat_text_message, chat: chat, role: "assistant", message_id: waba_message_id, status: "server_ack") }

    def status_payload(status: "read", id: waba_message_id, recipient_id: from_number, **extra)
      webhook(statuses: [ { id: id, status: status, recipient_id: recipient_id, timestamp: "1777384200", **extra } ])
    end

    it "atualiza a mensagem e relata o status traduzido" do
      result = receive_webhook(status_payload)

      expect(sent_message.reload.status).to eq("read")
      expect(result[:processed]).to eq([ "status:read:#{waba_message_id}" ])
      expect(Flows::InboundDispatcher).not_to have_received(:call)
    end

    it "acha a conversa pela variante do 9º dígito" do
      receive_webhook(status_payload(recipient_id: "553171810932"))

      expect(sent_message.reload.status).to eq("read")
    end

    it "avisa de status desconhecido sem alterar nada" do
      result = receive_webhook(status_payload(status: "banana"))

      expect(sent_message.reload.status).to eq("server_ack")
      expect(result).to eq(processed: [], warnings: [ "unknown_status:banana" ], errors: [])
    end

    it "avisa de status sem id" do
      result = receive_webhook(status_payload(id: nil))

      expect(result[:warnings]).to eq([ "status_missing_id" ])
    end

    it "sem conversa do destinatário, avisa e agenda nova tentativa" do
      result = nil

      expect { result = receive_webhook(status_payload(recipient_id: "5511999990000")) }.to have_enqueued_job(WabaStatusRetryJob)

      expect(result[:warnings]).to eq([ "status_no_message:#{waba_message_id}" ])
      expect(sent_message.reload.status).to eq("server_ack")
    end

    it "sem a mensagem, avisa e agenda nova tentativa" do
      result = nil

      expect { result = receive_webhook(status_payload(id: "wamid.NAO-EXISTE")) }.to have_enqueued_job(WabaStatusRetryJob)

      expect(result[:warnings]).to eq([ "status_no_message:wamid.NAO-EXISTE" ])
    end

    it "não regride o status de mensagem já lida, sem avisar de nada" do
      sent_message.set(status: "read")

      result = receive_webhook(status_payload(status: "delivered"))

      expect(sent_message.reload.status).to eq("read")
      expect(result).to eq(processed: [], warnings: [], errors: [])
    end

    it "guarda o motivo traduzido quando a Meta recusa" do
      receive_webhook(status_payload(status: "failed", errors: [ { code: 131_026, title: "Message undeliverable" } ]))

      expect(sent_message.reload).to have_attributes(status: "failed", status_message: be_present)
    end
  end

  # Na origem o controlador engolia a exceção para responder 2xx. Aqui o 2xx já foi (ver
  # spec/requests/inbound/webhooks_spec.rb): a exceção sobe para o job tentar de novo.
  describe "erro no meio do processamento" do
    before { allow(Chats::Locator).to receive(:find_or_create).and_raise(StandardError, "boom") }

    it "sobe para o job, sem ter chamado os fluxos" do
      expect { receive_text }.to raise_error(StandardError, "boom")
      expect(Flows::InboundDispatcher).not_to have_received(:call)
    end

    it "a nova tentativa grava a mensagem" do
      expect { receive_text }.to raise_error(StandardError, "boom")

      allow(Chats::Locator).to receive(:find_or_create).and_call_original
      receive_text

      expect(messages_of(chat_of).count).to eq(1)
      expect(Flows::InboundDispatcher).to have_received(:call).once
    end
  end

  describe "tipo não suportado" do
    def unsupported(type)
      { from: from_number, id: waba_message_id, type: type, type.to_sym => { id: "x" } }
    end

    it "ignora a reação da WABA e avisa" do
      result = receive_webhook(webhook(messages: [ { from: from_number, id: waba_message_id, type: "reaction", reaction: { message_id: "x", emoji: "👍" } } ]))

      expect(result).to eq(processed: [], warnings: [ "unsupported_type:reaction" ], errors: [])
      expect(Chat.where(connector_id: connector.id).count).to eq(0)
      expect(Flows::InboundDispatcher).not_to have_received(:call)
    end

    it "escreve o aviso no log" do
      allow(Rails.logger).to receive(:warn)

      receive_webhook(webhook(messages: [ unsupported("reaction") ]))

      expect(Rails.logger).to have_received(:warn).with(a_string_including("Unsupported message type"))
    end

    %w[video sticker].each do |type|
      it "avisa de #{type}, sem enfileirar nada" do
        result = nil

        expect { result = receive_webhook(webhook(messages: [ unsupported(type) ])) }.not_to have_enqueued_job

        expect(result[:warnings]).to eq([ "unsupported_type:#{type}" ])
      end
    end
  end

  describe "payload vazio" do
    it "não faz nada" do
      result = receive_webhook(webhook_payload(object: "whatsapp_business_account"))

      expect(result).to eq(processed: [], warnings: [], errors: [])
      expect(Flows::InboundDispatcher).not_to have_received(:call)
    end
  end

  # A Meta agrupa vários eventos numa entrega só.
  describe "payload misto" do
    it "processa status, texto e aponta a figurinha no mesmo webhook" do
      chat = create(:chat, connector: connector, external_id: from_number, sender_phone_number_id: connector.phone_number_id)
      sent = create(:chat_text_message, chat: chat, role: "assistant", message_id: "wamid.STATUS", status: "server_ack")

      result = receive_webhook(webhook(
        statuses: [ { id: "wamid.STATUS", status: "delivered", recipient_id: from_number } ],
        messages: [ text_message, { from: from_number, id: "wamid.SECOND", type: "sticker", sticker: { id: "x" } } ]
      ))

      expect(result[:processed]).to contain_exactly("status:delivery_ack:wamid.STATUS", "text:#{waba_message_id}")
      expect(result[:warnings]).to eq([ "unsupported_type:sticker" ])
      expect(sent.reload.status).to eq("delivery_ack")
      expect(Flows::InboundDispatcher).to have_received(:call).once
    end
  end

  # Regressão da origem: `process_document` foi copiado de `process_image`, forçava `<id>.jpg`
  # e gravava todo PDF como imagem.
  describe "documento" do
    let(:media_id) { "1494521802407171" }
    let(:document_id) { "wamid.HBgNNTUyMTk2OTk1Mjk0NBUCABIYFjNFQjAxNEU0QTg3RkQ4QjlFMkIyODIA" }
    let(:filename) { "Media Partner_Midia Kit RIW 2026 .pdf" }
    let(:caption) { "Proposta de parceria Rio Innovation Week" }

    def document_message(**document)
      {
        from: from_number, id: document_id, timestamp: "1779995276", type: "document",
        document: {
          caption: caption, filename: filename, mime_type: "application/pdf", sha256: "RQR0VXtLKOk=", id: media_id,
          url: "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=#{media_id}"
        }.merge(document)
      }
    end

    def receive_document(**document)
      perform_enqueued_jobs { receive_webhook(webhook(messages: [ document_message(**document) ])) }
    end

    before { stub_waba_media(media_id, body: "%PDF-1.4 bytes", mime_type: "application/pdf", file_size: 84_233) }

    it "enfileira o job com o id da mídia e as propriedades, sem baixar nada no webhook" do
      expect {
        receive_webhook(webhook(messages: [ document_message ]))
      }.to have_enqueued_job(ImageMessageJob).with(
        anything, organization.id, media_id, document_id, false,
        { mime_type: "application/pdf", fileName: filename, caption: caption }.to_json
      )
      expect(a_request(:any, /graph\.facebook\.com/)).not_to have_been_made
    end

    it "guarda com o nome real e o tipo do PDF, nunca como .jpg" do
      receive_document

      blob = blob_of(ChatMessage::Media.where(chat_id: chat_of.id, message_id: document_id).take)
      expect(blob.filename.to_s).to eq(ActiveStorage::Filename.new(filename).to_s)
      expect(blob.filename.to_s).not_to end_with(".jpg")
      expect(blob.content_type).to eq("application/pdf")
      expect(blob.download).to eq("%PDF-1.4 bytes")
    end

    it "grava mídia, nunca imagem, com o tipo, a legenda e as propriedades do documento" do
      receive_document

      expect(ChatMessage::Image.where(chat_id: chat_of.id).exists?).to be(false)
      expect(ChatMessage::Media.where(chat_id: chat_of.id, message_id: document_id).take).to have_attributes(
        role: "user",
        message_origin: "platform",
        media_type: "application/pdf",
        caption: caption,
        content: caption,
        media_url: start_with("/rails/active_storage/blobs/proxy/"),
        media_properties: { "fileLength" => 84_233, "mimeType" => "application/pdf", "fileName" => filename }
      )
    end

    it "baixa em dois saltos: Bearer no lookaside, nada na CDN" do
      urls = stub_waba_media(media_id, body: "%PDF-1.4 bytes", mime_type: "application/pdf")

      receive_document

      expect(a_request(:get, urls[:lookaside]).with(headers: { "Authorization" => "Bearer token-da-meta" })).to have_been_made.once
      expect(a_request(:get, urls[:cdn]).with { |request| !request.headers.key?("Authorization") }).to have_been_made.once
    end

    it "apaga o arquivo temporário" do
      paths = track_downloaded_paths

      receive_document

      expect(paths.size).to eq(1)
      expect(paths.first).to end_with(".pdf")
      expect(File.exist?(paths.first)).to be(false)
    end

    it "relata o documento sem erros e entrega a legenda aos fluxos" do
      result = nil

      perform_enqueued_jobs { result = receive_webhook(webhook(messages: [ document_message ])) }

      expect(result).to eq(processed: [ "document:#{document_id}" ], warnings: [], errors: [])
      expect(Flows::InboundDispatcher).to have_received(:call).with(
        chat: chat_of, text: caption, event: "first_message", message_id: document_id
      )
    end

    it "sem nome no webhook, pede o arquivo pela extensão do tipo" do
      paths = track_downloaded_paths

      receive_document(filename: nil)

      expect(paths.first).to end_with(".pdf")
      expect(blob_of(ChatMessage::Media.where(chat_id: chat_of.id).take).filename.to_s).to eq("#{document_id}.pdf")
    end

    it "conta o documento mesmo com a automação desligada" do
      create(:chat, connector: connector, external_id: from_number, sender_phone_number_id: connector.phone_number_id, automation_enabled: false)

      receive_document

      expect(chat_of).to have_attributes(unread_messages: 1, last_message_type: "media")
      expect(Flows::InboundDispatcher).not_to have_received(:call)
    end
  end

  describe "imagem" do
    let(:media_id) { "998877" }

    def image_message(**image)
      { from: from_number, id: "wamid.IMG", timestamp: "1779995276", type: "image", image: { id: media_id, mime_type: "image/jpeg", sha256: "x", caption: "Olha a foto" }.merge(image) }
    end

    it "enfileira o job com o nó da imagem" do
      expect {
        receive_webhook(webhook(messages: [ image_message ]))
      }.to have_enqueued_job(ImageMessageJob).with(
        anything, organization.id, media_id, "wamid.IMG", false,
        { id: media_id, mime_type: "image/jpeg", sha256: "x", caption: "Olha a foto" }.to_json
      )
    end

    it "baixa em dois saltos e grava como imagem" do
      urls = stub_waba_media(media_id, body: "bytes-jpeg")

      result = nil
      perform_enqueued_jobs { result = receive_webhook(webhook(messages: [ image_message ])) }

      message = ChatMessage::Image.where(chat_id: chat_of.id, message_id: "wamid.IMG").take
      expect(message).to have_attributes(role: "user", caption: "Olha a foto", content: "Olha a foto", image_url: start_with("/rails/active_storage/blobs/proxy/"))
      expect(blob_of(message)).to have_attributes(content_type: "image/jpeg")
      expect(blob_of(message).download).to eq("bytes-jpeg")
      expect(a_request(:get, urls[:cdn])).to have_been_made.once
      expect(result[:processed]).to eq([ "image:wamid.IMG" ])
    end

    it "grava imagem que não é jpeg como mídia" do
      stub_waba_media(media_id, body: "bytes-png", mime_type: "image/png")

      perform_enqueued_jobs { receive_webhook(webhook(messages: [ image_message(mime_type: "image/png") ])) }

      expect(ChatMessage::Media.where(chat_id: chat_of.id, message_id: "wamid.IMG").take.media_type).to eq("image/png")
    end
  end

  describe "áudio" do
    let(:audio_message) { { from: from_number, id: "wamid.AUD", timestamp: "1779995276", type: "audio", audio: { id: "A1", mime_type: "audio/ogg; codecs=opus", voice: true } } }

    it "enfileira o job com o id da mídia e o nome do contato" do
      expect {
        receive_webhook(webhook(messages: [ audio_message ]))
      }.to have_enqueued_job(AudioMessageJob).with(anything, organization.id, "A1", "wamid.AUD", false, "Maria Souza")
    end

    it "baixa em dois saltos e grava o áudio" do
      urls = stub_waba_media("A1", body: "bytes-ogg", mime_type: "audio/ogg")

      with_fake_ffmpeg do
        perform_enqueued_jobs { receive_webhook(webhook(messages: [ audio_message ])) }
      end

      message = ChatMessage::Audio.where(chat_id: chat_of.id, message_id: "wamid.AUD").take
      expect(message).to have_attributes(role: "user", content: "-", audio_url: start_with("/rails/active_storage/blobs/proxy/"))
      expect(a_request(:get, urls[:lookaside])).to have_been_made.once
      expect(chat_of.last_message_type).to eq("audio")
    end
  end

  describe "mídia que não baixa" do
    before { stub_request(:get, "https://graph.facebook.com/M1").to_return(status: 400, headers: InboundHelpers::JSON_HEADERS, body: { error: { message: "nope", code: 100 } }.to_json) }

    {
      "imagem" => { type: "image", image: { id: "M1", mime_type: "image/jpeg" } },
      "documento" => { type: "document", document: { id: "M1", filename: "a.pdf", mime_type: "application/pdf" } },
      "áudio" => { type: "audio", audio: { id: "M1" } }
    }.each do |name, content|
      it "#{name} vira nota de erro na conversa depois das tentativas" do
        with_fake_ffmpeg do
          perform_enqueued_jobs { receive_webhook(webhook(messages: [ { from: from_number, id: "wamid.MIDIA", **content } ])) }
        end

        expect(a_request(:get, "https://graph.facebook.com/M1")).to have_been_made.times(3)
        expect(notes_of(chat_of, "error").pluck(:content)).to eq([ "Chegou uma mídia que não foi possível baixar." ])
        expect(messages_of(chat_of).count).to eq(0)
        expect(Flows::InboundDispatcher).not_to have_received(:call)
      end
    end
  end

  # Anúncio Click-to-WhatsApp: a Meta anexa um `referral` e a mensagem vira um cartão (nota
  # 'base') mais o texto do contato, sem interromper o caminho normal.
  describe "cartão de anúncio (CTWA)" do
    let(:ctwa_clid) { "AfjgwJEHBU7aUse-fFNAUPeADnLkEhU_sWUejHxGKtQ" }
    let(:video_url) { "https://www.facebook.com/story.php?story_fbid=1003212665447068" }
    let(:referral) do
      {
        source_url: "https://fb.me/4EXeLTzg5",
        source_id: "120249040689730341",
        source_type: "ad",
        body: "Você sabe como funciona a remoção ultrassônica?",
        headline: "Aline Bertolotti",
        media_type: "video",
        video_url: video_url,
        thumbnail_url: "https://cdn.exemplo.com/thumb.jpg",
        ctwa_clid: ctwa_clid,
        welcome_message: { text: "Oi! Como podemos ajudar?" }
      }
    end

    def ad_message(id: waba_message_id, referral: self.referral, body: "Olá! Tenho interesse.", timestamp: "1783106393")
      text_message(id: id, body: body, referral: referral, timestamp: timestamp)
    end

    def ad_cards(chat = chat_of)
      notes_of(chat, "instagram-ad-greeting")
    end

    it "cria o cartão com o anúncio normalizado" do
      receive_webhook(webhook(messages: [ ad_message ]))

      card = ad_cards.take
      expect(card).to have_attributes(role: "base", content: "Oi! Como podemos ajudar?", message_origin: "platform")
      expect(card.external_ad_reply).to include(
        "title" => "Aline Bertolotti",
        "body" => "Você sabe como funciona a remoção ultrassônica?",
        "source_type" => "ad",
        "source_id" => "120249040689730341",
        "source_url" => "https://fb.me/4EXeLTzg5",
        "media_type" => "video",
        "media_url" => video_url,
        "thumbnail_url" => "https://cdn.exemplo.com/thumb.jpg",
        "greeting_message_body" => "Oi! Como podemos ajudar?",
        "ctwa_clid" => ctwa_clid
      )
    end

    it "põe o cartão um segundo antes da mensagem do contato" do
      receive_webhook(webhook(messages: [ ad_message ]))

      expect(ad_cards.take.created_at.to_i).to eq(1_783_106_393 - 1)
    end

    it "usa a imagem do anúncio quando não há vídeo" do
      image_referral = referral.except(:video_url).merge(image_url: "https://cdn.exemplo.com/anuncio.jpg")

      receive_webhook(webhook(messages: [ ad_message(referral: image_referral) ]))

      expect(ad_cards.take.external_ad_reply).to include(
        "media_url" => "https://cdn.exemplo.com/anuncio.jpg", "original_image_url" => "https://cdn.exemplo.com/anuncio.jpg"
      )
    end

    it "continua gravando o texto e chamando os fluxos" do
      receive_webhook(webhook(messages: [ ad_message ]))

      expect(ChatMessage::Text.where(chat_id: chat_of.id, message_id: waba_message_id).take).to have_attributes(role: "user", content: "Olá! Tenho interesse.")
      expect(Flows::InboundDispatcher).to have_received(:call).with(hash_including(text: "Olá! Tenho interesse."))
    end

    it "relata o cartão e o texto" do
      result = receive_webhook(webhook(messages: [ ad_message ]))

      expect(result[:processed]).to contain_exactly("ad_greeting:120249040689730341", "text:#{waba_message_id}")
    end

    it "o conteúdo cai para o título, o corpo e por fim o texto padrão" do
      {
        referral.except(:welcome_message) => "Aline Bertolotti",
        referral.except(:welcome_message, :headline) => "Você sabe como funciona a remoção ultrassônica?",
        { source_id: "1", ctwa_clid: "sem-texto" } => "Mensagem de saudação automática"
      }.each_with_index do |(block, content), index|
        receive_webhook(webhook(messages: [ ad_message(id: "wamid.#{index}", referral: block.merge(ctwa_clid: "clique-#{index}")) ]))

        expect(ad_cards.where("external_ad_reply.ctwa_clid" => "clique-#{index}").take.content).to eq(content)
      end
    end

    describe "idempotência" do
      it "a reentrega do webhook não duplica o cartão nem a mensagem" do
        2.times { receive_webhook(webhook(messages: [ ad_message ])) }

        expect(ad_cards.count).to eq(1)
        expect(messages_of(chat_of).count).to eq(1)
      end

      it "o mesmo clique em outra mensagem não abre outro cartão, e avisa" do
        receive_webhook(webhook(messages: [ ad_message ]))

        result = receive_webhook(webhook(messages: [ ad_message(id: "wamid.OUTRA", body: "Ainda quero") ]))

        expect(ad_cards.count).to eq(1)
        expect(result[:warnings]).to include("ad_greeting_duplicate:120249040689730341")
        expect(ChatMessage::Text.where(chat_id: chat_of.id, message_id: "wamid.OUTRA").exists?).to be(true)
      end

      it "um clique novo abre outro cartão" do
        receive_webhook(webhook(messages: [ ad_message ]))
        receive_webhook(webhook(messages: [ ad_message(id: "wamid.OUTRA", referral: referral.merge(ctwa_clid: "outro-clique")) ]))

        expect(ad_cards.count).to eq(2)
      end

      it "não confunde com o cartão de outra conversa" do
        other = create(:chat, connector: connector, external_id: "5531900000000")
        create(:chat_text_message, chat: other, role: "base", role_base_type: "instagram-ad-greeting", external_ad_reply: { "ctwa_clid" => ctwa_clid })

        receive_webhook(webhook(messages: [ ad_message ]))

        expect(ad_cards.count).to eq(1)
      end
    end

    it "mídia vinda de anúncio também ganha o cartão, uma vez só" do
      image = { from: from_number, id: "wamid.IMG", timestamp: "1783106393", type: "image", referral: referral, image: { id: "M1", mime_type: "image/jpeg" } }

      2.times { receive_webhook(webhook(messages: [ image ])) }

      expect(ad_cards.count).to eq(1)
      expect(ImageMessageJob).to have_been_enqueued.twice
    end

    it "áudio e documento vindos de anúncio ganham o cartão" do
      audio = { from: from_number, id: "wamid.AUD", type: "audio", referral: referral, audio: { id: "A1" } }
      document = { from: from_number, id: "wamid.DOC", type: "document", referral: referral.merge(ctwa_clid: "doc"), document: { id: "D1", filename: "a.pdf", mime_type: "application/pdf" } }

      receive_webhook(webhook(messages: [ audio, document ]))

      expect(ad_cards.pluck("external_ad_reply.ctwa_clid").size).to eq(2)
      expect(AudioMessageJob).to have_been_enqueued
      expect(ImageMessageJob).to have_been_enqueued
    end

    # Regressão da origem: o cartão, criado antes de decidir se é a primeira mensagem, ficava
    # na associação em memória e os leads de anúncio nunca davam `first_message`.
    describe "primeira mensagem" do
      let!(:chat) { create(:chat, connector: connector, external_id: from_number, sender_phone_number_id: connector.phone_number_id) }

      it "a mensagem que chega com o cartão é a primeira" do
        receive_webhook(webhook(messages: [ ad_message ]))

        expect(Flows::InboundDispatcher).to have_received(:call).with(hash_including(chat: chat, event: "first_message"))
      end

      it "grava de verdade o cartão e a mensagem" do
        receive_webhook(webhook(messages: [ ad_message ]))

        expect(ChatMessage::Base.unscoped.where(chat_id: chat.id).pluck(:role, :role_base_type))
          .to contain_exactly([ "base", "instagram-ad-greeting" ], [ "user", nil ])
      end

      it "sem anúncio também é a primeira" do
        receive_text

        expect(Flows::InboundDispatcher).to have_received(:call).with(hash_including(event: "first_message"))
      end

      it "com mensagem anterior do contato não é a primeira, mesmo vindo de anúncio" do
        create(:chat_text_message, chat: chat, content: "mensagem anterior")

        receive_webhook(webhook(messages: [ ad_message ]))

        expect(Flows::InboundDispatcher).to have_received(:call).with(hash_including(event: "message_received"))
      end

      it "com só um cartão anterior continua sendo a primeira" do
        create(:chat_text_message, chat: chat, role: "base", role_base_type: "instagram-ad-greeting", content: "cartão anterior")

        receive_text

        expect(Flows::InboundDispatcher).to have_received(:call).with(hash_including(event: "first_message"))
      end
    end
  end

  describe "comandos do contato" do
    let!(:chat) { create(:chat, connector: connector, external_id: from_number, sender_phone_number_id: connector.phone_number_id, automation_enabled: false) }
    let!(:reply) do
      stub_request(:post, "https://graph.facebook.com/v19.0/#{connector.phone_number_id}/messages")
        .to_return(status: 200, headers: InboundHelpers::JSON_HEADERS, body: { messages: [ { id: "wamid.RESPOSTA" } ] }.to_json)
    end

    [ "CCTX", "cctx", " CCTX ", "--CLEAR-CONTEXT--" ].each do |command|
      it "#{command.inspect} limpa o contexto e não vira mensagem" do
        previous = create(:chat_text_message, chat: chat, content: "antes do comando")

        receive_text(body: command)

        expect(previous.reload.active).to be(false)
        expect(chat.reload.automation_enabled).to be(true)
        expect(ChatMessage::Text.where(chat_id: chat.id, message_id: waba_message_id).exists?).to be(false)
        expect(notes_of(chat, "context-clear").count).to eq(1)
        expect(Flows::InboundDispatcher).not_to have_received(:call)
      end
    end

    it "responde ao contato pela Meta" do
      receive_text(body: "CCTX")

      expect(reply.with(body: hash_including("to" => from_number.to_i, "text" => { "body" => "Contexto limpo" }))).to have_been_requested
    end

    # Só Z-API e Evolution tinham este comando na origem.
    it "--RE-ACTIVE-ME-- é mensagem comum aqui" do
      receive_text(body: "--RE-ACTIVE-ME--")

      expect(chat.reload.automation_enabled).to be(false)
      expect(ChatMessage::Text.where(chat_id: chat.id, content: "--RE-ACTIVE-ME--").exists?).to be(true)
    end
  end
end
