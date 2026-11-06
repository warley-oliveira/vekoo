require "rails_helper"

# Eventos da Evolution API. Na origem eram `Evolution::EventHandler` (fila do RabbitMQ) e
# `Api::V1::WapiController`; aqui chegam por webhook e rodam no job. As specs de lá eram quase
# todas dublê: estas passam pelo banco de verdade e só o provedor é stub.
RSpec.describe Inbound::EvolutionEvents do
  include ActiveJob::TestHelper
  include ActiveSupport::Testing::TimeHelpers
  include InboundHelpers

  let(:organization) { create(:organization) }
  let(:connector) { create(:connector_whatsapp_web, organization: organization) }
  let(:codename) { "IWA-#{connector.id}" }
  let(:phone) { "5531971810932" }
  let(:jid) { "#{phone}@s.whatsapp.net" }
  let(:message_id) { "MSG_001" }

  before do
    allow(Flows::InboundDispatcher).to receive(:call)
    stub_env("OPENAI_ACCESS_TOKEN" => nil)
  end

  def handle(event, data)
    described_class.for_codename(webhook_payload(event: event, instance: codename, data: data), codename).call
  end

  def upsert_data(message: { conversation: "Bom dia" }, id: message_id, from_me: false, remote_jid: jid, push_name: "João", timestamp: nil, **data)
    {
      key: { remoteJid: remote_jid, id: id, fromMe: from_me },
      message: message,
      pushName: push_name,
      messageTimestamp: timestamp,
      **data
    }.compact.merge(message: message)
  end

  def upsert(**options)
    handle("messages.upsert", upsert_data(**options))
  end

  def chat_of(number = phone)
    Chat.where(connector_id: connector.id, external_id: number).take
  end

  def stub_send_text
    stub_request(:post, "http://evolution.test/message/sendText/#{connector.instance_name}")
      .to_return(status: 201, headers: InboundHelpers::JSON_HEADERS, body: { key: { id: "RESPOSTA" } }.to_json)
  end

  def alert_service
    double("OrganizationAlertService", connector_disconnected: nil, connector_reconnected: nil).tap do |service|
      stub_const("OrganizationAlertService", service)
    end
  end

  describe ".for_codename" do
    let(:payload) { webhook_payload(event: "qrcode.updated", data: {}) }

    it "acha o conector pelo id, sem o prefixo" do
      expect(described_class.for_codename(payload, codename).send(:connector)).to eq(connector)
    end

    it "devolve nil para nome sem o prefixo das nossas instâncias" do
      expect(described_class.for_codename(payload, "assistente-antigo")).to be_nil
    end

    it "devolve nil para conector que não existe, sem levantar" do
      expect(described_class.for_codename(payload, "IWA-#{BSON::ObjectId.new}")).to be_nil
    end

    it "não acha conector de outro tipo" do
      cloud = create(:connector_whatsapp_cloud, organization: organization)

      expect(described_class.for_codename(payload, "IWA-#{cloud.id}")).to be_nil
    end
  end

  describe "evento desconhecido" do
    it "só registra em debug" do
      logged = []
      allow(Rails.logger).to receive(:debug) { |message = nil, &block| logged << (message || block&.call) }

      expect { handle("algo.diferente", {}) }.not_to have_broadcasted_to(connector.stream_name)

      expect(logged).to include(a_string_including("Unhandled event: algo.diferente"))
      expect(Chat.where(connector_id: connector.id).count).to eq(0)
    end
  end

  describe "messages.update" do
    let(:chat) { create(:chat, connector: connector, external_id: phone) }
    let!(:message) { create(:chat_text_message, chat: chat, role: "assistant", message_id: "SENT-1", status: "delivery_ack") }

    def update_status(status, **data)
      handle("messages.update", { keyId: "SENT-1", messageId: "interno-da-evolution", remoteJid: jid, fromMe: true, status: status, **data })
    end

    it "aplica a leitura pelo id do WhatsApp (keyId), não pelo id interno da Evolution" do
      update_status("READ")

      expect(message.reload.status).to eq("read")
    end

    it "aceita o formato do provider AIVA, com o id em `id`" do
      handle("messages.update", { id: "SENT-1", remoteJid: jid, status: "READ" })

      expect(message.reload.status).to eq("read")
    end

    it "acha a conversa pela variante do 9º dígito" do
      handle("messages.update", { keyId: "SENT-1", remoteJid: "553171810932@s.whatsapp.net", status: "READ" })

      expect(message.reload.status).to eq("read")
    end

    it "conta áudio ouvido como lido" do
      update_status("PLAYED")

      expect(message.reload.status).to eq("read")
    end

    it "não regride com evento fora de ordem" do
      message.update(status: "read")

      update_status("DELIVERY_ACK")

      expect(message.reload.status).to eq("read")
    end

    it "não põe status em mensagem recebida, que não tem o que acompanhar" do
      received = create(:chat_text_message, chat: chat, role: "user", message_id: "RECV-1")

      handle("messages.update", { keyId: "RECV-1", remoteJid: jid, status: "READ" })

      expect(received.reload.status).to be_nil
    end

    it "transmite para a conversa aberta" do
      expect { update_status("READ") }.to have_broadcasted_to(ChatMessage::Base.stream_for(chat)).with(a_hash_including("status" => "read"))
    end

    it "ignora o que não dá para resolver, sem levantar nem agendar nova tentativa" do
      expect {
        update_status(nil)
        handle("messages.update", { keyId: "SENT-1", status: "READ" })
        handle("messages.update", { keyId: "NAO-EXISTE", remoteJid: jid, status: "READ" })
        handle("messages.update", { keyId: "SENT-1", remoteJid: "5599999999999@s.whatsapp.net", status: "READ" })
      }.not_to have_enqueued_job

      expect(message.reload.status).to eq("delivery_ack")
    end

    it "não alcança mensagem de outro conector com o mesmo número" do
      other_chat = create(:chat, connector: create(:connector_whatsapp_web, organization: organization), external_id: phone)
      other = create(:chat_text_message, chat: other_chat, role: "assistant", message_id: "SENT-2", status: "delivery_ack")

      handle("messages.update", { keyId: "SENT-2", remoteJid: jid, status: "READ" })

      expect(other.reload.status).to eq("delivery_ack")
    end
  end

  describe "conteúdo que chega depois de \"Message absent from node\"" do
    it "conta como não lida uma vez só" do
      upsert(message: nil, messageStubParameters: [ "Message absent from node" ])
      chat = Chat.where(connector_id: connector.id).take
      expect(chat.reload.unread_messages).to eq(1)

      Rails.cache.delete("id_performed.#{chat.id}.#{message_id}")
      upsert(message: { conversation: "Agora sim" })

      expect(chat.reload.unread_messages).to eq(1)
    end
  end

  describe "qrcode.updated" do
    context "com pairCode" do
      let(:data) { { statusCode: 200, qrcode: { base64: "BASE64STR", pairCode: "PAIR1" } } }

      it "guarda o QR code e o código de pareamento por 15 minutos" do
        handle("qrcode.updated", data)

        expect(Rails.cache.read("qrcode.base64.#{connector.id}")).to eq("BASE64STR")
        expect(Rails.cache.read("pair_code.#{connector.id}")).to eq("PAIR1")

        travel 16.minutes do
          expect(Rails.cache.read("qrcode.base64.#{connector.id}")).to be_nil
          expect(Rails.cache.read("pair_code.#{connector.id}")).to be_nil
        end
      end

      it "transmite qr_updated com os dois" do
        expect { handle("qrcode.updated", data) }.to have_broadcasted_to(connector.stream_name).with(
          status: "qr_updated", base64: "BASE64STR", pairCode: "PAIR1"
        )
      end
    end

    context "sem pairCode" do
      let(:data) { { statusCode: 200, qrcode: { base64: "B64ONLY" } } }

      it "não grava a chave do código" do
        handle("qrcode.updated", data)

        expect(Rails.cache.exist?("pair_code.#{connector.id}")).to be(false)
      end

      it "transmite o código que já estava guardado" do
        Rails.cache.write("pair_code.#{connector.id}", "ANTERIOR")

        expect { handle("qrcode.updated", data) }.to have_broadcasted_to(connector.stream_name).with(
          status: "qr_updated", base64: "B64ONLY", pairCode: "ANTERIOR"
        )
      end
    end

    context "com statusCode 500 (o QR code expirou)" do
      let(:data) { { statusCode: 500 } }

      it "apaga o QR code guardado" do
        Rails.cache.write("qrcode.base64.#{connector.id}", "VELHO")

        handle("qrcode.updated", data)

        expect(Rails.cache.read("qrcode.base64.#{connector.id}")).to be_nil
      end

      it "marca o conector como failed" do
        handle("qrcode.updated", data)

        expect(connector.reload.status).to eq(:failed)
      end

      it "transmite qr_timeout com o base64 vazio" do
        expect { handle("qrcode.updated", data) }.to have_broadcasted_to(connector.stream_name).with(status: "qr_timeout", base64: "")
      end
    end
  end

  describe "connection.update" do
    def stub_instance_info
      stub_request(:get, "http://evolution.test/instance/fetchInstances?instanceName=#{connector.instance_name}").to_return(
        status: 200,
        headers: InboundHelpers::JSON_HEADERS,
        body: [ { name: connector.instance_name, ownerJid: "5531988887777@s.whatsapp.net", profileName: "Loja Nova", profilePicUrl: "https://img/loja.png" } ].to_json
      )
    end

    context "403, conector ainda não recusado" do
      let(:data) { { statusReason: 403, state: "close" } }

      it "marca como reject" do
        handle("connection.update", data)

        expect(connector.reload.status).to eq(:reject)
      end

      it "avisa a organização do bloqueio" do
        service = alert_service

        handle("connection.update", data)

        expect(service).to have_received(:connector_disconnected).with(organization, connector, message: "Conta bloqueada: Loja da Ana")
      end

      it "não derruba o webhook sem o serviço de avisos" do
        expect { handle("connection.update", data) }.not_to raise_error
      end

      # Na origem este aviso ia para o Slack, que saiu.
      it "deixa o possível bloqueio no log" do
        allow(Rails.logger).to receive(:warn)

        handle("connection.update", data)

        expect(Rails.logger).to have_received(:warn).with(a_string_including("Possível bloqueio"))
      end
    end

    context "403, conector já recusado" do
      let(:data) { { statusReason: 403, state: "close" } }

      before { connector.set(status_cd: "reject") }

      it "não faz nada, nem avisa de novo" do
        service = alert_service

        handle("connection.update", data)

        expect(service).not_to have_received(:connector_disconnected)
        expect(connector.reload.status).to eq(:reject)
      end
    end

    context "401" do
      let(:data) { { statusReason: 401, state: "close" } }

      it "marca como closed" do
        handle("connection.update", data)

        expect(connector.reload.status).to eq(:closed)
      end

      it "avisa da desconexão" do
        service = alert_service

        handle("connection.update", data)

        expect(service).to have_received(:connector_disconnected).with(organization, connector, message: "O WhatsApp \"Loja da Ana\" foi desconectado.")
      end
    end

    context "200, fora de connecting" do
      let(:data) { { statusReason: 200, state: "open" } }

      before do
        connector.set(status_cd: "pending")
        stub_instance_info
      end

      it "ativa o conector com os dados da instância" do
        handle("connection.update", data)

        expect(connector.reload).to have_attributes(status: :active, number_id: "5531988887777", profile_name: "Loja Nova", profile_picture_url: "https://img/loja.png")
      end

      it "transmite success_scan" do
        expect { handle("connection.update", data) }.to have_broadcasted_to(connector.stream_name).with(status: "success_scan", base64: "")
      end

      it "resolve o aviso de desconexão" do
        service = alert_service

        handle("connection.update", data)

        expect(service).to have_received(:connector_reconnected).with(organization, connector)
      end
    end

    context "200 com o conector recusado" do
      let(:data) { { statusReason: 200, state: "open" } }

      before { connector.set(status_cd: "reject") }

      it "não volta para active nem transmite" do
        expect { handle("connection.update", data) }.not_to have_broadcasted_to(connector.stream_name)

        expect(connector.reload.status).to eq(:reject)
      end
    end

    context "200 em connecting" do
      let(:data) { { statusReason: 200, state: "connecting" } }

      before { connector.set(status_cd: "pending") }

      it "não faz nada" do
        expect { handle("connection.update", data) }.not_to have_broadcasted_to(connector.stream_name)

        expect(connector.reload.status).to eq(:pending)
      end
    end
  end

  describe "messages.upsert" do
    describe "o que é descartado antes de abrir conversa" do
      after { expect(Chat.where(connector_id: connector.id).count).to eq(0) }

      it "sem data" do
        handle("messages.upsert", nil)
      end

      it "sem key" do
        handle("messages.upsert", { message: { conversation: "oi" } })
      end

      it "grupo" do
        upsert(remote_jid: "120363042@g.us")
      end

      it "lista de transmissão" do
        upsert(remote_jid: "status@broadcast")
      end

      it "@lid sem o telefone em remoteJidAlt" do
        upsert(remote_jid: "30429960773680@lid")
      end

      it "peerDataOperation" do
        upsert(message: { protocolMessage: { peerDataOperationRequestResponseMessage: { foo: 1 } } })
      end

      it "EPHEMERAL_SYNC_RESPONSE" do
        upsert(message: { protocolMessage: { type: "EPHEMERAL_SYNC_RESPONSE" } })
      end

      it "stub que não é \"Message absent from node\"" do
        upsert(messageStubParameters: [ "Some unrecognized stub" ])
      end

      it "conector pausado" do
        connector.set(status_cd: "paused")

        upsert
      end
    end

    describe "resolução da conversa" do
      it "cria a conversa só com o telefone, sem o sufixo" do
        upsert

        expect(chat_of).to have_attributes(organization_id: organization.id, connector_id: connector.id, status: "open", automation_enabled: true)
      end

      it "usa o telefone de remoteJidAlt quando remoteJid é @lid" do
        handle("messages.upsert", upsert_data.deep_merge(key: { remoteJid: "XXXX@lid", remoteJidAlt: jid }))

        expect(chat_of).to be_present
        expect(Chat.where(connector_id: connector.id).count).to eq(1)
      end

      context "com uma isca anterior no mesmo conector" do
        let!(:decoy) { create(:chat, connector: connector, external_id: "5531900000000") }
        let!(:target) { create(:chat, connector: connector, external_id: phone) }

        it "resolve a conversa do remetente, nunca a isca" do
          upsert

          expect(messages_of(target).count).to eq(1)
          expect(messages_of(decoy).count).to eq(0)
          expect(Flows::InboundDispatcher).to have_received(:call).with(hash_including(chat: target))
        end

        it "acha pela variante sem o 9º dígito, sem abrir outra conversa" do
          upsert(remote_jid: "553171810932@s.whatsapp.net")

          expect(messages_of(target).count).to eq(1)
          expect(Chat.where(connector_id: connector.id).count).to eq(2)
        end
      end

      it "acha a conversa gravada com o sufixo do JID" do
        with_suffix = create(:chat, connector: connector, external_id: jid)

        upsert

        expect(messages_of(with_suffix).count).to eq(1)
      end

      it "isola por conector" do
        other = create(:chat, connector: create(:connector_whatsapp_web, organization: organization), external_id: phone)

        upsert

        expect(messages_of(other).count).to eq(0)
        expect(chat_of.id).not_to eq(other.id)
      end

      it "conversa nova guarda de onde veio e a foto que já estava em cache" do
        Rails.cache.write("ppu-#{phone}", "https://img/contato.png")

        upsert(message: { extendedTextMessage: { text: "oi", contextInfo: { entryPointConversionApp: "instagram" } } })

        expect(chat_of).to have_attributes(origin_entry_point: "instagram", profile_picture_url: "https://img/contato.png")
      end

      it "com a automação padrão da organização desligada, a conversa nasce sem automação" do
        organization.update!(settings: { "default_automation_enabled" => false })

        upsert

        expect(chat_of.automation_enabled).to be(false)
        expect(Flows::InboundDispatcher).not_to have_received(:call)
      end
    end

    describe "reentrega" do
      it "não processa o mesmo id duas vezes" do
        2.times { upsert }

        expect(messages_of(chat_of).count).to eq(1)
        expect(chat_of.unread_messages).to eq(1)
        expect(Flows::InboundDispatcher).to have_received(:call).once
      end

      it "não enfileira a mesma mídia duas vezes" do
        expect {
          2.times { upsert(message: { imageMessage: { url: "https://wa/img.jpg" } }) }
        }.to have_enqueued_job(ImageMessageJob).once
      end

      it "depois de o cache expirar, a mensagem gravada ainda segura a duplicata" do
        upsert
        travel 16.minutes do
          upsert
        end

        expect(messages_of(chat_of).count).to eq(1)
        expect(Flows::InboundDispatcher).to have_received(:call).once
      end

      it "limpa a presença do contato" do
        chat = create(:chat, connector: connector, external_id: phone)
        Rails.cache.write("presence.#{chat.id}", "composing")

        upsert

        expect(Rails.cache.read("presence.#{chat.id}")).to be_nil
      end
    end

    # O job refaz tudo depois de um erro: a marca de "já processada" não pode barrar a
    # própria retentativa, senão a mensagem some em silêncio.
    describe "nova tentativa depois de um erro" do
      it "grava a mensagem que falhou na primeira vez" do
        allow(ChatMessage::Text).to receive(:create!).and_raise(StandardError, "mongo fora")

        expect { upsert }.to raise_error(StandardError, "mongo fora")

        allow(ChatMessage::Text).to receive(:create!).and_call_original
        upsert

        expect(messages_of(chat_of).pluck(:message_id)).to eq([ message_id ])
        expect(Flows::InboundDispatcher).to have_received(:call).once
      end

      it "enfileira a mídia que falhou na primeira vez" do
        allow(ImageMessageJob).to receive(:perform_later).and_raise(StandardError, "redis fora")
        payload = { message: { imageMessage: { url: "https://wa/img.jpg" } } }

        expect { upsert(**payload) }.to raise_error(StandardError, "redis fora")

        allow(ImageMessageJob).to receive(:perform_later).and_call_original

        expect { upsert(**payload) }.to have_enqueued_job(ImageMessageJob).once
      end
    end

    describe "áudio" do
      let(:message) { { audioMessage: { url: "https://mmg.whatsapp.net/audio.enc" }, mediaUrl: "https://bucket.exemplo.com/audio.ogg" } }

      it "enfileira o job com o que ele precisa para baixar" do
        chat = create(:chat, connector: connector, external_id: phone)

        expect { upsert(message: message) }.to have_enqueued_job(AudioMessageJob).with(
          chat.id.to_s, organization.id, "https://bucket.exemplo.com/audio.ogg", message_id, false, "João",
          { key: { remoteJid: jid, id: message_id, fromMe: false }, message: message }.to_json
        )
      end

      it "sem mediaUrl, usa a URL do audioMessage" do
        expect { upsert(message: { audioMessage: { url: "https://wa/audio.ogg" } }) }.to have_enqueued_job(AudioMessageJob).with(
          anything, organization.id, "https://wa/audio.ogg", message_id, false, "João", kind_of(String)
        )
      end

      it "do webhook até o áudio na conversa" do
        stub_request(:get, "https://bucket.exemplo.com/audio.ogg").to_return(status: 200, body: "bytes-ogg")

        perform_enqueued_jobs { upsert(message: message) }

        audio = ChatMessage::Audio.where(chat_id: chat_of.id, message_id: message_id).take
        expect(audio).to have_attributes(role: "user", content: "-", audio_url: start_with("/rails/active_storage/blobs/proxy/"))
        expect(blob_of(audio).download).to eq("bytes-ogg")
      end
    end

    describe "mídia que não baixa" do
      before { stub_request(:get, "https://bucket.exemplo.com/arquivo").to_return(status: 500) }

      {
        "imagem" => { imageMessage: { url: "https://cdn/enc" }, mediaUrl: "https://bucket.exemplo.com/arquivo" },
        "documento" => { documentMessage: { url: "https://cdn/enc", mimetype: "application/pdf" }, mediaUrl: "https://bucket.exemplo.com/arquivo" },
        "vídeo" => { videoMessage: { url: "https://cdn/enc", mimetype: "video/mp4" }, mediaUrl: "https://bucket.exemplo.com/arquivo" },
        "áudio" => { audioMessage: { url: "https://cdn/enc" }, mediaUrl: "https://bucket.exemplo.com/arquivo" }
      }.each do |name, message|
        it "#{name} vira nota de erro na conversa depois das tentativas" do
          perform_enqueued_jobs { upsert(message: message) }

          expect(a_request(:get, "https://bucket.exemplo.com/arquivo")).to have_been_made.times(3)
          expect(notes_of(chat_of, "error").pluck(:content)).to eq([ "Chegou uma mídia que não foi possível baixar." ])
          expect(messages_of(chat_of).count).to eq(0)
        end
      end
    end

    describe "documento e vídeo" do
      let(:document) { { url: "https://wa/doc.pdf", mimetype: "application/pdf", fileName: "orçamento.pdf", caption: "Segue" } }

      def expect_image_job(url, properties)
        have_enqueued_job(ImageMessageJob).with(anything, organization.id, url, message_id, false, properties.to_json, kind_of(String))
      end

      it "documento enfileira com as propriedades do próprio documento" do
        expect { upsert(message: { documentMessage: document }) }.to expect_image_job("https://wa/doc.pdf", document)
      end

      it "vídeo enfileira com as propriedades do vídeo" do
        video = { url: "https://wa/video.mp4", mimetype: "video/mp4", seconds: 12 }

        expect { upsert(message: { videoMessage: video }) }.to expect_image_job("https://wa/video.mp4", video)
      end

      it "documento com legenda vem em outro envelope" do
        expect {
          upsert(message: { documentWithCaptionMessage: { message: { documentMessage: document } } })
        }.to expect_image_job("https://wa/doc.pdf", document)
      end

      it "do webhook até a mídia na conversa, pelo bucket" do
        stub_request(:get, "https://bucket.exemplo.com/doc.pdf").to_return(status: 200, body: "%PDF")

        perform_enqueued_jobs { upsert(message: { documentMessage: document, mediaUrl: "https://bucket.exemplo.com/doc.pdf" }) }

        media = ChatMessage::Media.where(chat_id: chat_of.id, message_id: message_id).take
        expect(media).to have_attributes(media_type: "application/pdf", caption: "Segue", media_properties: include("fileName" => "orçamento.pdf"))
        expect(blob_of(media)).to have_attributes(content_type: "application/pdf")
      end
    end

    describe "imagem" do
      it "enfileira com mimetype image e a legenda" do
        expect {
          upsert(message: { imageMessage: { url: "https://wa/img.jpg", caption: "Olha isso" } })
        }.to have_enqueued_job(ImageMessageJob).with(
          anything, organization.id, "https://wa/img.jpg", message_id, false,
          { mimetype: "image", caption: "Olha isso" }.to_json, kind_of(String)
        )
      end

      it "não vira texto nem chama os fluxos antes de baixar" do
        upsert(message: { imageMessage: { url: "https://wa/img.jpg" } })

        expect(messages_of(chat_of).count).to eq(0)
        expect(Flows::InboundDispatcher).not_to have_received(:call)
      end
    end

    describe "figurinha" do
      let(:bucket_url) { "https://ev.exemplo.com/content/stickerMessage/1786732755838.webp" }
      let(:message) do
        {
          stickerMessage: { url: "https://mmg.whatsapp.net/v/t62/775448943_158.enc?ccb=11-4", mimetype: "image/webp", isAnimated: false },
          mediaUrl: bucket_url
        }
      end

      def sticker
        ChatMessage::Media.unscoped.where(chat_id: chat_of.id, message_id: message_id).take
      end

      it "grava mídia do tipo sticker apontando para o bucket" do
        upsert(message: message, timestamp: 1_786_732_755)

        expect(sticker).to have_attributes(role: "user", message_origin: "platform", media_type: "sticker", media_url: bucket_url, content: "", caption: "")
        expect(sticker.created_at.to_i).to eq(1_786_732_755)
      end

      it "fica fora do contexto da IA, mas na lista da conversa" do
        upsert(message: message)

        expect(sticker).to have_attributes(is_span: true, has_span: false)
        expect(ChatMessage::Base.where(chat_id: chat_of.id, message_id: message_id).exists?).to be(false)
        expect(ChatMessage::Base.unscoped.list_for_chat.where(chat_id: chat_of.id, message_id: message_id).exists?).to be(true)
      end

      it "guarda o mimetype em media_properties" do
        upsert(message: message)

        expect(sticker.media_properties).to eq("mimetype" => "image/webp", "isAnimated" => false)
      end

      it "atualiza a prévia da lista" do
        upsert(message: message)

        expect(chat_of).to have_attributes(last_message_type: "sticker", last_message_by: "user", last_message_content: "", unread_messages: 1)
      end

      it "transmite para a conversa" do
        chat = create(:chat, connector: connector, external_id: phone)

        expect { upsert(message: message) }.to have_broadcasted_to(ChatMessage::Base.stream_for(chat))
      end

      it "não enfileira nada nem chama os fluxos" do
        expect { upsert(message: message) }.not_to have_enqueued_job

        expect(Flows::InboundDispatcher).not_to have_received(:call)
      end

      it "só com a URL da CDN da Meta, ignora: o .enc não abre" do
        upsert(message: message.except(:mediaUrl))

        expect(sticker).to be_nil
      end

      it "ignora mediaUrl que aponta para a CDN da Meta" do
        upsert(message: message.merge(mediaUrl: "https://mmg.whatsapp.net/v/t62/775448943_158.webp"))

        expect(sticker).to be_nil
      end

      it "desfaz o escape de & que a Meta deixa na URL" do
        upsert(message: message.merge(mediaUrl: "#{bucket_url}?a=1\\u0026b=2"))

        expect(sticker.media_url).to eq("#{bucket_url}?a=1&b=2")
      end

      it "não grava a mesma figurinha duas vezes" do
        upsert(message: message)
        travel 16.minutes do
          upsert(message: message)
        end

        expect(ChatMessage::Media.unscoped.where(chat_id: chat_of.id).count).to eq(1)
        expect(chat_of.unread_messages).to eq(1)
      end

      context "do nosso número" do
        before { upsert(message: message, from_me: true) }

        it "entra como nossa e zera as não lidas" do
          expect(sticker).to have_attributes(role: "assistant", message_origin: "user")
          expect(chat_of).to have_attributes(unread_messages: 0, last_message_by: "assistant")
        end

        it "pausa a automação" do
          expect(chat_of.automation_enabled).to be(false)
        end
      end
    end

    describe "reação" do
      let(:chat) { create(:chat, connector: connector, external_id: phone, automation_enabled: true) }
      let!(:target) { create(:chat_text_message, chat: chat, role: "assistant", message_id: "TARGET_MSG_ID", content: "Temos horário amanhã") }

      def reaction(text: "👍🏻", target_id: "TARGET_MSG_ID", target_from_me: true)
        { reactionMessage: { key: { remoteJid: "30429960773680@lid", fromMe: target_from_me, id: target_id }, text: text } }
      end

      def react(text: "👍🏻", id: "REACAO_1", **options)
        upsert(message: reaction(text: text, **options), id: id, **options.slice(:from_me))
      end

      def reactions
        target.reload.reactions.map { |entry| entry.slice("emoji", "from", "sender_name") }
      end

      it "acha o alvo pelo id de dentro de reactionMessage.key, não pelo id do evento" do
        upsert(message: reaction, id: "ID_DO_EVENTO")

        expect(reactions).to eq([ { "emoji" => "👍🏻", "from" => "user", "sender_name" => "João" } ])
      end

      # data.key.fromMe diz quem reagiu; reactionMessage.key.fromMe descreve o alvo.
      it "atribui ao contato quando o evento não é nosso, mesmo com o alvo sendo nosso" do
        upsert(message: reaction(target_from_me: true), id: "REACAO_1", from_me: false)

        expect(reactions.first).to include("from" => "user", "sender_name" => "João")
      end

      it "atribui a nós quando o evento é nosso, sem nome" do
        upsert(message: reaction(target_from_me: false), id: "REACAO_1", from_me: true)

        expect(reactions).to eq([ { "emoji" => "👍🏻", "from" => "assistant" } ])
      end

      it "a reação substitui a anterior do mesmo lado" do
        upsert(message: reaction(text: "👍🏻"), id: "REACAO_1")
        upsert(message: reaction(text: "❤️"), id: "REACAO_2")

        expect(reactions).to eq([ { "emoji" => "❤️", "from" => "user", "sender_name" => "João" } ])
      end

      it "não mexe na reação do outro lado" do
        upsert(message: reaction(text: "👍🏻"), id: "REACAO_1", from_me: true)
        upsert(message: reaction(text: "❤️"), id: "REACAO_2", from_me: false)

        expect(reactions.pluck("from", "emoji")).to contain_exactly([ "assistant", "👍🏻" ], [ "user", "❤️" ])
      end

      it "texto vazio remove só a reação daquele lado" do
        upsert(message: reaction(text: "👍🏻"), id: "REACAO_1", from_me: true)
        upsert(message: reaction(text: "❤️"), id: "REACAO_2", from_me: false)
        upsert(message: reaction(text: ""), id: "REACAO_3", from_me: false)

        expect(reactions.pluck("from")).to eq([ "assistant" ])
      end

      it "não cria mensagem nem chama os fluxos" do
        expect { upsert(message: reaction, id: "REACAO_1") }.not_to have_enqueued_job

        expect(messages_of(chat).pluck(:message_id)).to eq([ "TARGET_MSG_ID" ])
        expect(Flows::InboundDispatcher).not_to have_received(:call)
      end

      it "transmite a mensagem atualizada" do
        expect { upsert(message: reaction, id: "REACAO_1") }.to have_broadcasted_to(ChatMessage::Base.stream_for(chat))
      end

      it "reagir do nosso aparelho não pausa a automação" do
        upsert(message: reaction, id: "REACAO_1", from_me: true)

        expect(chat.reload.automation_enabled).to be(true)
      end

      it "alvo fora do histórico não faz nada" do
        upsert(message: reaction(target_id: "NAO_EXISTE"), id: "REACAO_1")

        expect(target.reload.reactions).to be_empty
      end

      it "não alcança mensagem de outra conversa" do
        other_target = create(:chat_text_message, chat: create(:chat, connector: connector, external_id: "5531900000000"), message_id: "DA_OUTRA")

        upsert(message: reaction(target_id: "DA_OUTRA"), id: "REACAO_1")

        expect(other_target.reload.reactions).to be_empty
      end

      it "sem id do alvo não faz nada" do
        upsert(message: { reactionMessage: { key: {}, text: "👍" } }, id: "REACAO_1")

        expect(target.reload.reactions).to be_empty
      end

      it "alcança mensagem que está fora do default_scope" do
        target.set(active: false)

        upsert(message: reaction, id: "REACAO_1")

        expect(reactions.size).to eq(1)
      end
    end

    describe "texto" do
      it "grava a mensagem do contato" do
        upsert(message: { conversation: "hello there" })

        expect(ChatMessage::Text.where(chat_id: chat_of.id, message_id: message_id).take).to have_attributes(
          role: "user", content: "hello there", message_origin: "platform", missing_message: nil
        )
      end

      it "usa a data do provedor" do
        upsert(timestamp: 1_786_732_755)

        expect(ChatMessage::Text.where(chat_id: chat_of.id).take.created_at.to_i).to eq(1_786_732_755)
      end

      it "atualiza a prévia da lista" do
        upsert(message: { conversation: "hello there" })

        expect(chat_of).to have_attributes(last_message_type: "text", last_message_content: "hello there", last_message_by: "user", unread_messages: 1)
      end

      it "entrega aos fluxos" do
        upsert(message: { conversation: "hello there" })

        expect(Flows::InboundDispatcher).to have_received(:call).with(chat: chat_of, text: "hello there", event: "first_message", message_id: message_id)
      end

      it "na segunda mensagem o evento é message_received" do
        upsert(id: "M1")
        upsert(id: "M2", message: { conversation: "De novo" })

        expect(Flows::InboundDispatcher).to have_received(:call).with(chat: chat_of, text: "De novo", event: "message_received", message_id: "M2")
      end

      it "guarda o nome do contato" do
        upsert(push_name: "João")

        expect(chat_of.user_name).to eq("João")
      end

      it "atualiza o nome quando o contato troca" do
        create(:chat, connector: connector, external_id: phone, user_name: "Antigo")

        upsert(push_name: "Novo Nome")

        expect(chat_of.user_name).to eq("Novo Nome")
      end

      it "mantém o nome quando o pushName vem vazio" do
        create(:chat, connector: connector, external_id: phone, user_name: "Antigo")

        upsert(push_name: "")

        expect(chat_of.user_name).to eq("Antigo")
      end

      {
        "extendedTextMessage" => { extendedTextMessage: { text: "o texto" } },
        "ephemeralMessage" => { ephemeralMessage: { message: { extendedTextMessage: { text: "o texto" } } } },
        "listResponseMessage" => { listResponseMessage: { title: "o texto" } },
        "editedMessage aninhada" => { editedMessage: { message: { protocolMessage: { editedMessage: { conversation: "o texto" } } } } }
      }.each do |format, message|
        it "lê o texto de #{format}" do
          upsert(message: message)

          expect(ChatMessage::Text.where(chat_id: chat_of.id).take.content).to eq("o texto")
        end
      end

      it "tipo de mensagem que não entendemos não vira mensagem" do
        upsert(message: { locationMessage: { degreesLatitude: -19.9 } })

        expect(messages_of(chat_of).count).to eq(0)
        expect(Flows::InboundDispatcher).not_to have_received(:call)
      end
    end

    describe "resposta citada (stanzaId)" do
      let(:chat) { create(:chat, connector: connector, external_id: phone) }

      def reply_to(stanza_id)
        { extendedTextMessage: { text: "Quero esse", contextInfo: { stanzaId: stanza_id, participant: "553133330000@s.whatsapp.net" } } }
      end

      it "aponta para a mensagem citada e guarda o contexto" do
        quoted = create(:chat_text_message, chat: chat, role: "assistant", message_id: "CITADA")

        upsert(message: reply_to("CITADA"))

        expect(ChatMessage::Text.where(chat_id: chat.id, message_id: message_id).take).to have_attributes(
          reply_to_message_id: quoted.id.to_s,
          context_message: include("stanzaId" => "CITADA")
        )
      end

      it "fica sem citação quando a mensagem não está no histórico" do
        chat

        upsert(message: reply_to("NAO_EXISTE"))

        expect(ChatMessage::Text.where(chat_id: chat.id, message_id: message_id).take.reply_to_message_id).to be_nil
      end
    end

    describe "comandos" do
      let!(:chat) { create(:chat, connector: connector, external_id: phone, automation_enabled: false) }
      let!(:send_text) { stub_send_text }

      [ "--CLEAR-CONTEXT--", "CCTX", "cctx" ].each do |command|
        context command do
          it "desativa o histórico, religa a automação e responde" do
            previous = create(:chat_text_message, chat: chat, content: "antes")

            upsert(message: { conversation: command })

            expect(previous.reload.active).to be(false)
            expect(chat.reload.automation_enabled).to be(true)
            expect(notes_of(chat, "context-clear").take.content).to eq("Contexto limpo")
            expect(send_text.with(body: hash_including("number" => jid, "text" => "Contexto limpo"))).to have_been_requested
          end

          it "não vira mensagem nem chama os fluxos" do
            upsert(message: { conversation: command })

            expect(messages_of(chat).count).to eq(0)
            expect(Flows::InboundDispatcher).not_to have_received(:call)
          end
        end
      end

      it "CCTX zera o freio de contato" do
        Rails.cache.write(Chats::InboundThrottle.counter_key(chat), 20)

        upsert(message: { conversation: "CCTX" })

        expect(Rails.cache.read(Chats::InboundThrottle.counter_key(chat))).to be_nil
      end

      it "--RE-ACTIVE-ME-- religa a automação e confirma" do
        upsert(message: { conversation: "--RE-ACTIVE-ME--" })

        expect(chat.reload.automation_enabled).to be(true)
        expect(send_text.with(body: hash_including("number" => jid, "text" => "Certo, sua conversa está ativa de novo."))).to have_been_requested
        expect(messages_of(chat).count).to eq(0)
      end

      it "--RE-ACTIVE-ME-- digitado do nosso aparelho também religa, em vez de pausar" do
        upsert(from_me: true, message: { conversation: "--RE-ACTIVE-ME--" })

        expect(chat.reload.automation_enabled).to be(true)
        expect(messages_of(chat).count).to eq(0)
      end

      # O PFUP era a depuração de follow-up do assistente, que saiu.
      it "PFUP é mensagem comum" do
        upsert(message: { conversation: "PFUP" })

        expect(messages_of(chat).pluck(:content)).to eq([ "PFUP" ])
        expect(send_text).not_to have_been_requested
      end
    end

    describe "automação" do
      it "com a automação da conversa desligada, conta como não lida e não chama os fluxos" do
        create(:chat, connector: connector, external_id: phone, automation_enabled: false, unread_messages: 2)

        upsert

        expect(chat_of.unread_messages).to eq(3)
        expect(Flows::InboundDispatcher).not_to have_received(:call)
      end

      it "com o conector inativo, grava mas não chama os fluxos" do
        connector.set(status_cd: "closed")

        upsert

        expect(messages_of(chat_of).count).to eq(1)
        expect(Flows::InboundDispatcher).not_to have_received(:call)
      end

      it "com advertências demais desliga a automação, com nota, e não chama os fluxos" do
        chat = create(:chat, connector: connector, external_id: phone, red_flag_count: 5)

        upsert

        expect(chat.reload.automation_enabled).to be(false)
        expect(notes_of(chat, "automation-stopped").take.content).to include("Cota de advertências")
        expect(Flows::InboundDispatcher).not_to have_received(:call)
      end
    end

    describe "mensagem nossa, de outro aparelho" do
      before { organization.update!(settings: { "automation_pause_period" => "hours", "automation_pause_time_to" => 2 }) }

      let!(:chat) { create(:chat, connector: connector, external_id: phone, user_name: "Maria", unread_messages: 3) }

      it "texto entra como nosso, pausa a automação e agenda a volta" do
        expect { upsert(from_me: true, message: { conversation: "Já te respondo" }) }.to have_enqueued_job(EnableContactJob)

        expect(ChatMessage::Text.where(chat_id: chat.id).take).to have_attributes(role: "assistant", message_origin: "user")
        expect(chat.reload).to have_attributes(automation_enabled: false, unread_messages: 0, last_message_by: "assistant")
        expect(chat.automation_resume_at).to be_within(5.seconds).of(2.hours.from_now)
        expect(Flows::InboundDispatcher).not_to have_received(:call)
      end

      it "não troca o nome do contato pelo nosso" do
        upsert(from_me: true, push_name: "Loja da Ana")

        expect(chat.reload.user_name).to eq("Maria")
      end

      it "imagem pausa depois de baixada" do
        stub_request(:get, "https://bucket.exemplo.com/foto.jpg").to_return(status: 200, body: "jpeg")

        perform_enqueued_jobs(only: ImageMessageJob) do
          upsert(from_me: true, message: { imageMessage: { url: "https://cdn/enc", caption: "Segue" }, mediaUrl: "https://bucket.exemplo.com/foto.jpg" })
        end

        expect(ChatMessage::Image.where(chat_id: chat.id).take).to have_attributes(role: "assistant", message_origin: "user", caption: "Segue")
        expect(chat.reload).to have_attributes(automation_enabled: false, unread_messages: 0)
      end

      it "áudio pausa depois de baixado" do
        stub_request(:get, "https://bucket.exemplo.com/audio.ogg").to_return(status: 200, body: "ogg")

        perform_enqueued_jobs(only: AudioMessageJob) do
          upsert(from_me: true, message: { audioMessage: { url: "https://cdn/enc" }, mediaUrl: "https://bucket.exemplo.com/audio.ogg" })
        end

        expect(ChatMessage::Audio.where(chat_id: chat.id).take).to have_attributes(role: "assistant", content: "")
        expect(chat.reload).to have_attributes(automation_enabled: false, unread_messages: 0)
      end
    end

    describe "limpeza de contexto por inatividade" do
      let!(:chat) { create(:chat, connector: connector, external_id: phone, last_message_at: 2.hours.ago, automation_enabled: false) }

      def enable_auto_clear(interval: 1)
        organization.update!(settings: { "auto_clear_context_enabled" => true, "auto_clear_context_interval" => interval })
      end

      it "limpa quando o intervalo passou, e a mensagem é a primeira de novo" do
        enable_auto_clear
        old = create(:chat_text_message, chat: chat, content: "antiga")
        chat.set(last_message_at: 2.hours.ago)

        upsert

        expect(old.reload.active).to be(false)
        expect(notes_of(chat, "context-clear").take.content).to eq("Limpeza de contexto por inatividade")
        expect(Flows::InboundDispatcher).to have_received(:call).with(hash_including(event: "first_message"))
      end

      it "não limpa antes do intervalo" do
        enable_auto_clear(interval: 3)

        upsert

        expect(notes_of(chat, "context-clear").count).to eq(0)
      end

      it "não limpa com a opção desligada" do
        upsert

        expect(notes_of(chat, "context-clear").count).to eq(0)
      end
    end

    # "Message absent from node": a Evolution avisa que chegou uma mensagem que ela ainda não
    # conseguiu abrir (`message` nulo), e o conteúdo vem depois com o mesmo id.
    describe "mensagem ausente (missing_message)" do
      def absent(**options)
        upsert(message: nil, messageStubParameters: [ "Message absent from node" ], **options)
      end

      def message
        ChatMessage::Text.where(chat_id: chat_of.id, message_id: message_id).take
      end

      it "guarda um marcador e a nota de que está aguardando" do
        absent

        expect(message).to have_attributes(content: ".", missing_message: true, role: "user")
        expect(notes_of(chat_of, "context-fup").take.content).to eq("Aguardando mensagem")
      end

      it "não chama os fluxos enquanto o conteúdo não chega" do
        absent

        expect(Flows::InboundDispatcher).not_to have_received(:call)
      end

      it "o conteúdo que chega depois preenche o marcador, sem criar outra mensagem" do
        absent
        upsert(message: { conversation: "Agora sim" })

        expect(messages_of(chat_of).count).to eq(1)
        expect(message).to have_attributes(content: "Agora sim", missing_message: false)
      end

      it "ao preencher, transmite o conteúdo para quem está com a conversa aberta" do
        absent

        expect {
          upsert(message: { conversation: "Agora sim" })
        }.to have_broadcasted_to(ChatMessage::Base.stream_for(chat_of)).with(a_hash_including("content" => "Agora sim", "missingMessage" => false))
      end

      it "ao preencher, entrega aos fluxos como primeira mensagem" do
        absent
        upsert(message: { conversation: "Agora sim" })

        expect(Flows::InboundDispatcher).to have_received(:call).once
        expect(Flows::InboundDispatcher).to have_received(:call).with(
          chat: chat_of, text: "Agora sim", event: "first_message", message_id: message_id
        )
      end

      it "ao preencher depois de outra mensagem, o evento é message_received" do
        absent
        upsert(id: "OUTRA", message: { conversation: "Oi" })
        upsert(message: { conversation: "Agora sim" })

        expect(Flows::InboundDispatcher).to have_received(:call).with(
          chat: chat_of, text: "Agora sim", event: "message_received", message_id: message_id
        )
      end

      it "o aviso repetido não apaga a marca: o conteúdo ainda consegue chegar" do
        absent
        absent
        expect(message.missing_message).to be(true)

        upsert(message: { conversation: "Agora sim" })

        expect(message).to have_attributes(content: "Agora sim", missing_message: false)
      end

      it "depois de preenchida, a reentrega do conteúdo não faz nada" do
        absent
        2.times { upsert(message: { conversation: "Agora sim" }) }

        expect(Flows::InboundDispatcher).to have_received(:call).once
      end

      it "o conteúdo que chega depois de o cache expirar também preenche" do
        absent
        travel 16.minutes do
          upsert(message: { conversation: "Agora sim" })
        end

        expect(message).to have_attributes(content: "Agora sim", missing_message: false)
      end

      it "mensagem nula nossa não é guardada" do
        absent(from_me: true)

        expect(messages_of(chat_of).count).to eq(0)
      end

      it "mensagem nossa que estava ausente entra quando o conteúdo chega, e pausa a automação" do
        absent(from_me: true)

        upsert(from_me: true, message: { conversation: "Já te atendo" })

        expect(messages_of(chat_of).pluck(:content)).to eq([ "Já te atendo" ])
        expect(chat_of.automation_enabled).to be(false)
      end

      it "evento sem conteúdo que entendemos não barra o que chega depois com o mesmo id" do
        upsert(message: { messageContextInfo: { deviceListMetadata: {} } })

        upsert(message: { conversation: "Agora sim" })

        expect(messages_of(chat_of).pluck(:content)).to eq([ "Agora sim" ])
      end

      it "o conteúdo que preenche pode ser uma resposta citada" do
        absent
        quoted = create(:chat_text_message, chat: chat_of, role: "assistant", message_id: "CITADA")

        upsert(message: { extendedTextMessage: { text: "Quero esse", contextInfo: { stanzaId: "CITADA" } } })

        expect(message).to have_attributes(
          content: "Quero esse",
          reply_to_message_id: quoted.id.to_s,
          context_message: include("stanzaId" => "CITADA")
        )
      end

      # O job não grava por cima de um id que já existe: sem tirar o marcador, a mídia sumiria.
      context "quando o conteúdo não é texto" do
        it "a imagem entra no lugar do marcador" do
          stub_request(:get, "https://bucket.exemplo.com/foto.jpg").to_return(status: 200, body: "jpeg")
          absent

          perform_enqueued_jobs do
            upsert(message: { imageMessage: { url: "https://cdn/enc", caption: "Olha" }, mediaUrl: "https://bucket.exemplo.com/foto.jpg" })
          end

          expect(messages_of(chat_of).map(&:class)).to eq([ ChatMessage::Image ])
          expect(ChatMessage::Image.where(chat_id: chat_of.id, message_id: message_id).take.caption).to eq("Olha")
          expect(Flows::InboundDispatcher).to have_received(:call).with(hash_including(text: "Olha", event: "first_message"))
        end

        it "o áudio entra no lugar do marcador" do
          stub_request(:get, "https://bucket.exemplo.com/audio.ogg").to_return(status: 200, body: "ogg")
          absent

          perform_enqueued_jobs do
            upsert(message: { audioMessage: { url: "https://cdn/enc" }, mediaUrl: "https://bucket.exemplo.com/audio.ogg" })
          end

          expect(messages_of(chat_of).map(&:class)).to eq([ ChatMessage::Audio ])
        end

        it "a figurinha entra no lugar do marcador" do
          absent

          upsert(message: { stickerMessage: { mimetype: "image/webp" }, mediaUrl: "https://ev.exemplo.com/fig.webp" })

          expect(messages_of(chat_of).map(&:class)).to eq([ ChatMessage::Media ])
          expect(messages_of(chat_of).take.media_type).to eq("sticker")
        end

        it "a reação tira o marcador e vale para a mensagem alvo" do
          absent
          target = create(:chat_text_message, chat: chat_of, message_id: "ALVO")

          upsert(message: { reactionMessage: { key: { id: "ALVO" }, text: "👍" } })

          expect(ChatMessage::Base.unscoped.where(chat_id: chat_of.id, message_id: message_id).exists?).to be(false)
          expect(target.reload.reactions.first).to include("emoji" => "👍")
        end

        it "o tipo que não entendemos só tira o marcador" do
          absent

          upsert(message: { locationMessage: { degreesLatitude: -19.9 } })

          expect(messages_of(chat_of).count).to eq(0)
        end

        it "o aviso repetido não tira o marcador" do
          absent
          absent

          expect(messages_of(chat_of).pluck(:missing_message)).to eq([ true ])
        end
      end
    end

    describe "mensagem editada" do
      def edit(original_id, text, id: "EVENTO_EDIT")
        upsert(id: id, message: { protocolMessage: { type: "MESSAGE_EDIT", key: { id: original_id }, editedMessage: { conversation: text } } })
      end

      it "preenche a mensagem que estava ausente" do
        upsert(message: nil, messageStubParameters: [ "Message absent from node" ])

        edit(message_id, "Texto editado")

        expect(ChatMessage::Text.where(chat_id: chat_of.id, message_id: message_id).take).to have_attributes(content: "Texto editado", missing_message: false)
        expect(messages_of(chat_of).count).to eq(1)
        expect(Flows::InboundDispatcher).to have_received(:call).with(hash_including(text: "Texto editado"))
      end

      it "ignora a edição de mensagem que já chegou inteira, como na origem" do
        upsert(message: { conversation: "Original" })

        edit(message_id, "Texto editado")

        expect(ChatMessage::Text.where(chat_id: chat_of.id, message_id: message_id).take.content).to eq("Original")
        expect(messages_of(chat_of).count).to eq(1)
        expect(Flows::InboundDispatcher).to have_received(:call).once
      end

      it "edição de mensagem que não conhecemos vira mensagem nova" do
        edit("DESCONHECIDA", "Texto editado")

        expect(messages_of(chat_of).pluck(:message_id, :content)).to eq([ [ "EVENTO_EDIT", "Texto editado" ] ])
      end
    end
  end

  describe "presence.update" do
    let!(:chat) { create(:chat, connector: connector, external_id: phone) }

    def presence_data(presence: "composing", **data)
      { id: jid, presences: { jid => { lastKnownPresence: presence } }, **data }
    end

    it "guarda a presença pela conversa, com phoneNumber" do
      handle("presence.update", presence_data(phoneNumber: phone))

      expect(Rails.cache.read("presence.#{chat.id}")).to eq("composing")
    end

    it "tira o sufixo do id quando não há phoneNumber" do
      handle("presence.update", presence_data(presence: "paused"))

      expect(Rails.cache.read("presence.#{chat.id}")).to eq("paused")
    end

    it "acha a conversa pela variante do 9º dígito" do
      handle("presence.update", { id: "553171810932@s.whatsapp.net", presences: { "553171810932@s.whatsapp.net" => { lastKnownPresence: "recording" } } })

      expect(Rails.cache.read("presence.#{chat.id}")).to eq("recording")
    end

    it "expira em 10 segundos" do
      handle("presence.update", presence_data)

      travel 11.seconds do
        expect(Rails.cache.read("presence.#{chat.id}")).to be_nil
      end
    end

    it "sem conversa, não grava nada" do
      other = "5511999999999"

      expect(Rails.cache).not_to receive(:write).with(/\Apresence\./, anything, anything)

      handle("presence.update", { id: "#{other}@s.whatsapp.net", phoneNumber: other })
    end

    it "sem telefone, não faz nada" do
      expect(Rails.cache).not_to receive(:write)

      handle("presence.update", { presences: {} })
    end
  end

  describe "contacts.upsert e contacts.update" do
    let!(:chat) { create(:chat, connector: connector, external_id: phone, user_name: "Antigo", profile_picture_url: "https://img/antiga.png") }
    let(:picture) { "https://pps.whatsapp.net/v/t61.24694-24/134030344.jpg" }

    # Forma emitida quando o evento nasce de uma mensagem recebida.
    context "objeto único" do
      let(:data) { { remoteJid: jid, pushName: "Warley", profilePicUrl: picture, instanceId: "d3cbba22" } }

      it "atualiza nome e foto da conversa" do
        handle("contacts.update", data)

        expect(chat.reload).to have_attributes(user_name: "Warley", profile_picture_url: picture)
      end

      it "só mexe na conversa desse contato e desse conector" do
        other_contact = create(:chat, connector: connector, external_id: "5531900000000", user_name: "Outro")
        other_connector = create(:chat, connector: create(:connector_whatsapp_web, organization: organization), external_id: phone, user_name: "Outro")

        handle("contacts.update", data)

        expect(other_contact.reload.user_name).to eq("Outro")
        expect(other_connector.reload.user_name).to eq("Outro")
      end

      it "alcança a conversa gravada na variante do 9º dígito" do
        variant = create(:chat, connector: connector, external_id: "553188887777", user_name: "Antigo")

        handle("contacts.update", { remoteJid: "5531988887777@s.whatsapp.net", pushName: "Warley" })

        expect(variant.reload.user_name).to eq("Warley")
      end

      # Lida por messages.upsert ao abrir a conversa: a foto de quem ainda não escreveu não
      # se perde.
      it "guarda a foto por telefone mesmo sem conversa" do
        handle("contacts.update", { remoteJid: "5511999999999@s.whatsapp.net", profilePicUrl: picture })

        expect(Rails.cache.read("ppu-5511999999999")).to eq(picture)

        upsert(remote_jid: "5511999999999@s.whatsapp.net")

        expect(chat_of("5511999999999").profile_picture_url).to eq(picture)
      end
    end

    # Forma emitida na sincronização em lote da agenda.
    context "lista" do
      it "atualiza cada contato" do
        other = create(:chat, connector: connector, external_id: "5511888888888", user_name: "Antigo")

        handle("contacts.upsert", [
          { remoteJid: jid, pushName: "Maria", profilePicUrl: "https://img/a.png" },
          { remoteJid: "5511888888888@s.whatsapp.net", pushName: "João" }
        ])

        expect(chat.reload).to have_attributes(user_name: "Maria", profile_picture_url: "https://img/a.png")
        expect(other.reload).to have_attributes(user_name: "João")
      end

      it "um item estranho no meio não atrapalha os outros" do
        handle("contacts.upsert", [ "lixo", { remoteJid: jid, pushName: "Maria" } ])

        expect(chat.reload.user_name).to eq("Maria")
      end
    end

    it "só com pushName, só atualiza o nome" do
      handle("contacts.upsert", { remoteJid: jid, pushName: "Maria" })

      expect(chat.reload).to have_attributes(user_name: "Maria", profile_picture_url: "https://img/antiga.png")
    end

    it "só com a foto, só atualiza a foto" do
      handle("contacts.upsert", { remoteJid: jid, profilePicUrl: "https://img/a.png" })

      expect(chat.reload).to have_attributes(user_name: "Antigo", profile_picture_url: "https://img/a.png")
    end

    # pushName vem vazio quando a mensagem é nossa.
    it "com pushName vazio e sem foto não atualiza nada" do
      handle("contacts.upsert", { remoteJid: jid, pushName: "" })

      expect(chat.reload.user_name).to eq("Antigo")
    end

    it "sem jid não faz nada" do
      handle("contacts.upsert", { pushName: "Maria" })

      expect(chat.reload.user_name).to eq("Antigo")
    end

    # A conversa da Evolution só guarda o telefone: um @lid não tem como casar.
    it "@lid é descartado, sem gravar foto" do
      handle("contacts.upsert", { remoteJid: "30429960773680@lid", pushName: "Maria", profilePicUrl: "https://img/a.png" })

      expect(chat.reload.user_name).to eq("Antigo")
      expect(Rails.cache.exist?("ppu-30429960773680")).to be(false)
    end

    it "aceita a grafia antiga id / profilePictureUrl" do
      handle("contacts.upsert", [ { id: jid, profilePictureUrl: "https://img/legacy.png" } ])

      expect(chat.reload.profile_picture_url).to eq("https://img/legacy.png")
    end

    it "erro num contato não sobe" do
      allow(BrPhoneVariants).to receive(:call).and_raise(StandardError, "boom")

      expect { handle("contacts.update", { remoteJid: jid, pushName: "Maria" }) }.not_to raise_error
    end

    # O corpo exato de um contacts.update de produção, pelo mesmo caminho do webhook. Trava a
    # regressão da origem que fazia a foto sumir: lia `id`/`profilePictureUrl` num array, e a
    # Evolution manda `remoteJid`/`profilePicUrl` num objeto.
    it "aceita o corpo de um evento real" do
      body = %({"event":"contacts.update","instance":"#{codename}",) +
             %("data":{"remoteJid":"#{jid}","pushName":"Warley",) +
             %("profilePicUrl":"https://pps.whatsapp.net/v/t61.24694-24/134030344_36016.jpg?ccb=11-4",) +
             %("instanceId":"d3cbba22-c834-4ad5-86a4-35a88de09812"},) +
             %("server_url":"http://localhost:8089","date_time":"2026-08-14T21:10:01.304Z"})

      Inbound::ProcessWebhookJob.perform_now("evolution", body, codename)

      expect(chat.reload).to have_attributes(
        user_name: "Warley",
        profile_picture_url: "https://pps.whatsapp.net/v/t61.24694-24/134030344_36016.jpg?ccb=11-4"
      )
    end
  end
end
