require "rails_helper"

# O que muda da AIVA (v1) para a Evolution v2: caminhos e formato dos corpos.
RSpec.describe Connector::WhatsappWeb::Providers::EvolutionApi do
  include ConnectorHelpers
  include ActiveSupport::Testing::TimeHelpers

  let(:organization) { create(:organization) }
  let(:connector) { create(:connector_whatsapp_web, organization: organization, instance_name: "WS-EVO") }
  let(:base) { "http://evolution.test" }

  before { allow(Connector::WhatsappWeb::Providers::Base).to receive(:sleep) }

  around { |example| with_env("BACKEND_URL" => "https://api.vekoo.test") { example.run } }

  # Resposta real da Evolution 2.3.x quando o destino não tem conta no WhatsApp.
  def number_not_found(number)
    jid = "#{number}@s.whatsapp.net"
    json_reply({ status: 400, error: "Bad Request", response: { message: [ { jid: jid, exists: false, number: jid } ] } }, status: 400)
  end

  describe "#send_text_message" do
    let(:url) { "#{base}/message/sendText/WS-EVO" }

    it "usa o corpo plano da v2, sem o envelope textMessage, e devolve o id" do
      request = stub_request(:post, url)
        .with(headers: { "apikey" => "chave-evolution" }, body: { number: "5511999999999@s.whatsapp.net", text: "oi", delay: 0, presence: "available" }.to_json)
        .to_return(json_reply({ key: { id: "OUT-EVO" } }, status: 201))

      expect(connector.send_text_message("5511999999999", "oi")).to eq("OUT-EVO")
      expect(request).to have_been_requested
    end

    it "não repete o sufixo de um JID que já veio pronto" do
      stub_request(:post, url).to_return(json_reply({ key: { id: "X" } }))

      connector.send_text_message("55119@s.whatsapp.net", "oi")

      expect(a_request(:post, url).with(body: hash_including("number" => "55119@s.whatsapp.net"))).to have_been_made
    end

    it "cita a mensagem em `quoted` quando é resposta" do
      stub_request(:post, url).to_return(json_reply({ key: { id: "OUT" } }))

      connector.send_text_message("55119", "oi", nil, reply_to_external_id: "WAID-PAI")

      expect(a_request(:post, url).with(body: hash_including(
        "quoted" => { "key" => { "remoteJid" => "55119@s.whatsapp.net", "fromMe" => false, "id" => "WAID-PAI" } }
      ))).to have_been_made
    end

    it "tenta 3 vezes em erro de servidor e levanta" do
      request = stub_request(:post, url).to_return(status: 500, body: "boom")

      expect { connector.send_text_message("55119", "oi") }.to raise_error(/Failed to send message/)
      expect(request).to have_been_made.times(3)
    end

    it "2xx sem corpo devolve nil sem reenviar: a mensagem já saiu" do
      request = stub_request(:post, url).to_return(status: 201, body: "", headers: { "Content-Type" => "application/json" })

      expect(connector.send_text_message("55119", "oi")).to be_nil
      expect(request).to have_been_made.once
    end

    it "2xx com corpo que não é JSON devolve nil sem reenviar" do
      request = stub_request(:post, url).to_return(status: 200, body: "ok", headers: { "Content-Type" => "text/plain" })

      expect(connector.send_text_message("55119", "oi")).to be_nil
      expect(request).to have_been_made.once
    end
  end

  describe "número que não existe no WhatsApp" do
    it "levanta WhatsappNumberNotFoundError no texto, sem repetir" do
      request = stub_request(:post, "#{base}/message/sendText/WS-EVO").to_return(number_not_found("5548988314715"))

      expect { connector.send_text_message("5548988314715", "oi") }.to raise_error(WhatsappNumberNotFoundError, /exists":false/)
      expect(request).to have_been_made.once
    end

    it "levanta WhatsappNumberNotFoundError na mídia, sem repetir" do
      request = stub_request(:post, "#{base}/message/sendMedia/WS-EVO").to_return(number_not_found("5548988314715"))

      expect { connector.send_media_message("5548988314715", media_dto) }.to raise_error(WhatsappNumberNotFoundError)
      expect(request).to have_been_made.once
    end

    it "repete qualquer outro 400: pode ser transitório" do
      request = stub_request(:post, "#{base}/message/sendText/WS-EVO").to_return(status: 400, body: "boom")

      expect { connector.send_text_message("5548988314715", "oi") }.to raise_error(RuntimeError, /Failed to send message: boom/)
      expect(request).to have_been_made.times(3)
    end

    it "repete 400 com JSON que não fala de número inexistente" do
      request = stub_request(:post, "#{base}/message/sendText/WS-EVO")
        .to_return(json_reply({ response: { message: [ "instance not connected" ] } }, status: 400))

      expect { connector.send_text_message("5548988314715", "oi") }.to raise_error(RuntimeError, /Failed to send message/)
      expect(request).to have_been_made.times(3)
    end

    it "repete 400 quando o número existe" do
      request = stub_request(:post, "#{base}/message/sendText/WS-EVO")
        .to_return(json_reply({ response: { message: [ { exists: true } ] } }, status: 400))

      expect { connector.send_text_message("5548988314715", "oi") }.to raise_error(RuntimeError)
      expect(request).to have_been_made.times(3)
    end
  end

  describe "#send_media_message" do
    let(:url) { "#{base}/message/sendMedia/WS-EVO" }

    it "manda JSON para sendMedia, não multipart para sendMediaFile" do
      request = stub_request(:post, url)
        .with(body: { number: "5511999999999", mediatype: "image", media: "https://cdn.exemplo.com/foto.jpg", mimetype: "image/jpeg", fileName: "foto.jpg", caption: "Olha" }.to_json)
        .to_return(json_reply({ key: { id: "MED1" } }, status: 201))

      connector.send_media_message("5511999999999", media_dto(caption: "Olha"))

      expect(request).to have_been_requested
    end

    it "leva o caminho relativo para a URL pública do backend: é a Evolution quem baixa (na origem era a troca de localhost)" do
      stub_request(:post, url).to_return(json_reply({ key: { id: "X" } }, status: 201))

      connector.send_media_message("55119", media_dto(url: "/rails/active_storage/blobs/proxy/abc/foto.jpg"))

      expect(a_request(:post, url).with(body: hash_including("media" => "https://api.vekoo.test/rails/active_storage/blobs/proxy/abc/foto.jpg"))).to have_been_made
    end

    it "cai na URL do Attachment quando o DTO só tem o id" do
      stub_const("Attachment", double("Attachment", find_by: double(file_url: "https://cdn.exemplo.com/guardada.jpg")))
      stub_request(:post, url).to_return(json_reply({ key: { id: "X" } }, status: 201))

      connector.send_media_message("55119", media_dto(url: nil, attachment_id: "CA-42"))

      expect(a_request(:post, url).with(body: hash_including("media" => "https://cdn.exemplo.com/guardada.jpg"))).to have_been_made
    end

    it "manda base64 do arquivo local quando não há URL" do
      path = Rails.root.join("spec/fixtures/files/documento.txt").to_s
      stub_request(:post, url).to_return(json_reply({ key: { id: "X" } }, status: 201))

      connector.send_media_message("55119", media_dto("document", "documento.txt", url: nil, attachment: path))

      expect(a_request(:post, url).with(body: hash_including("media" => Base64.strict_encode64(File.binread(path))))).to have_been_made
    end

    it "levanta um erro claro sem nenhuma fonte de mídia, em vez de receber um 400 enigmático" do
      expect { connector.send_media_message("55119", media_dto(url: nil)) }.to raise_error(/no media_url or local attachment available/)
      expect(a_request(:post, url)).not_to have_been_made
    end

    it "tira acentos do nome do arquivo" do
      stub_request(:post, url).to_return(json_reply({ key: { id: "X" } }, status: 201))

      connector.send_media_message("55119", media_dto("document", "relatório-março.pdf"))

      expect(a_request(:post, url).with(body: hash_including("fileName" => "relatorio-marco.pdf"))).to have_been_made
    end

    it "só manda legenda quando há legenda" do
      request = stub_request(:post, url).with { |req| !JSON.parse(req.body).key?("caption") }.to_return(json_reply({ key: { id: "X" } }, status: 201))

      connector.send_media_message("55119", media_dto)

      expect(request).to have_been_requested
    end

    {
      "image" => "image/jpeg", "video" => "video/mp4", "audio" => "audio/ogg",
      "document" => "application/octet-stream", "file" => "application/octet-stream", "sticker" => "application/octet-stream"
    }.each do |type, mimetype|
      it "#{type} vai como #{mimetype}" do
        stub_request(:post, url).to_return(json_reply({ key: { id: "X" } }, status: 201))

        connector.send_media_message("55119", media_dto(type, "arquivo"))

        expect(a_request(:post, url).with(body: hash_including("mediatype" => type, "mimetype" => mimetype))).to have_been_made
      end
    end

    it "sem tipo vai como imagem" do
      stub_request(:post, url).to_return(json_reply({ key: { id: "X" } }, status: 201))

      connector.send_media_message("55119", media_dto(nil, nil))

      expect(a_request(:post, url).with(body: hash_including("mediatype" => "image", "fileName" => "image.jpg"))).to have_been_made
    end

    it "tenta 3 vezes e levanta quando o provedor recusa" do
      request = stub_request(:post, url).to_return(status: 500, body: "boom")

      expect { connector.send_media_message("55119", media_dto) }.to raise_error(/Failed to send message/)
      expect(request).to have_been_made.times(3)
    end

    # A Evolution 2.3.7 responde 2xx com corpo vazio em boa parte dos sendMedia.
    describe "recuperação do id" do
      let(:find_url) { "#{base}/chat/findMessages/WS-EVO" }

      def stored_message(id, timestamp)
        { key: { id: id, fromMe: true }, messageTimestamp: timestamp }
      end

      def stub_find(*records)
        stub_request(:post, find_url).to_return(json_reply({ messages: { records: records } }))
      end

      context "quando a Evolution devolve a mensagem no corpo" do
        before { stub_request(:post, url).to_return(json_reply({ key: { id: "3EB0A" } }, status: 201)) }

        it "devolve a resposta intacta" do
          expect(Connectors::ExternalId.from(connector.send_media_message("557199573929", media_dto))).to eq("3EB0A")
        end

        it "não consulta findMessages" do
          connector.send_media_message("557199573929", media_dto)

          expect(a_request(:post, find_url)).not_to have_been_made
        end
      end

      context "quando a Evolution responde 2xx com corpo vazio" do
        before { stub_request(:post, url).to_return(status: 201, body: "") }

        it "recupera o id da mensagem que acabou de enviar" do
          stub_find(stored_message("3EB0NEW", Time.current.to_i))

          expect(connector.send_media_message("557199573929", media_dto)).to eq("key" => { "id" => "3EB0NEW", "fromMe" => true })
        end

        it "entrega o id recuperado no mesmo formato da resposta normal" do
          stub_find(stored_message("3EB0NEW", Time.current.to_i))

          expect(Connectors::ExternalId.from(connector.send_media_message("557199573929", media_dto))).to eq("3EB0NEW")
        end

        it "procura só as nossas mensagens para o JID do destino" do
          stub_find(stored_message("3EB0NEW", Time.current.to_i))

          connector.send_media_message("557199573929", media_dto)

          expect(a_request(:post, find_url).with(body: hash_including(
            "where" => { "key" => { "remoteJid" => "557199573929@s.whatsapp.net", "fromMe" => true } }
          ))).to have_been_made
        end

        it "não atribui ao envio uma mensagem mais antiga" do
          stub_find(stored_message("3EB0OLD", 1.hour.ago.to_i))

          response = connector.send_media_message("557199573929", media_dto)

          expect(response.code).to eq(201)
          expect(Connectors::ExternalId.from(response)).to be_nil
        end

        it "aceita a folga de relógio entre a aplicação e a Evolution" do
          stub_find(stored_message("3EB0SKEW", 10.seconds.ago.to_i))

          expect(Connectors::ExternalId.from(connector.send_media_message("557199573929", media_dto))).to eq("3EB0SKEW")
        end

        it "volta para a resposta original quando findMessages falha" do
          stub_request(:post, find_url).to_raise(Net::ReadTimeout)

          response = connector.send_media_message("557199573929", media_dto)

          expect(response.code).to eq(201)
          expect(Connectors::ExternalId.from(response)).to be_nil
        end

        it "volta para a resposta original quando findMessages não traz nada" do
          stub_request(:post, find_url).to_return(json_reply({}))

          expect(connector.send_media_message("557199573929", media_dto).code).to eq(201)
        end

        it "não reenvia a mídia: ela já saiu" do
          stub_find

          connector.send_media_message("557199573929", media_dto)

          expect(a_request(:post, url)).to have_been_made.once
        end
      end
    end
  end

  describe "#send_audio_message_by_url" do
    let(:url) { "#{base}/message/sendWhatsAppAudio/WS-EVO" }

    it "manda { number, audio, encoding: true }, sem o envelope audioMessage" do
      request = stub_request(:post, url)
        .with(body: { number: "5511999999999", audio: "https://x/a.ogg", encoding: true }.to_json)
        .to_return(json_reply({ key: { id: "AUD1" } }, status: 201))

      connector.send_audio_message_by_url("5511999999999", "https://x/a.ogg", nil)

      expect(request).to have_been_requested
    end

    it "devolve a resposta: é dela que sai o id da mensagem" do
      stub_request(:post, url).to_return(json_reply({ key: { id: "AUD1" } }, status: 201))

      expect(Connectors::ExternalId.from(connector.send_audio_message_by_url("55119", "https://x/a.ogg"))).to eq("AUD1")
    end

    it "tenta 3 vezes e levanta quando o provedor recusa" do
      request = stub_request(:post, url).to_return(status: 500, body: "boom")

      expect { connector.send_audio_message_by_url("55119", "https://x/a.ogg") }.to raise_error(/Failed to send message/)
      expect(request).to have_been_made.times(3)
    end
  end

  describe "#mark_read_message" do
    it "marca por POST, não PUT" do
      request = stub_request(:post, "#{base}/chat/markMessageAsRead/WS-EVO")
        .with(body: { readMessages: [ { remoteJid: "55119@s.whatsapp.net", fromMe: false, id: "MID-1" } ] }.to_json)
        .to_return(json_reply({}, status: 201))

      connector.mark_read_message("55119@s.whatsapp.net", "MID-1")

      expect(request).to have_been_requested
    end

    it "levanta depois de 3 tentativas" do
      request = stub_request(:post, "#{base}/chat/markMessageAsRead/WS-EVO").to_return(status: 500, body: "boom")

      expect { connector.mark_read_message("55119", "MID-1") }.to raise_error(/Failed to send message/)
      expect(request).to have_been_made.times(3)
    end
  end

  describe "#send_reaction" do
    let(:url) { "#{base}/message/sendReaction/WS-EVO" }

    # `key` descreve a mensagem ALVO: `fromMe` diz se fomos nós que a enviamos.
    it "manda a chave da mensagem alvo e devolve o id da reação" do
      request = stub_request(:post, url)
        .with(body: { key: { remoteJid: "5511999999999@s.whatsapp.net", fromMe: true, id: "ALVO-1" }, reaction: "👍" }.to_json)
        .to_return(json_reply({ key: { id: "REACT-1" } }, status: 201))

      expect(connector.send_reaction("5511999999999", "ALVO-1", true, "👍")).to eq("REACT-1")
      expect(request).to have_been_requested
    end

    it "manda reação vazia para remover" do
      stub_request(:post, url).to_return(json_reply({ key: { id: "REACT-2" } }))

      connector.send_reaction("5511999999999", "ALVO-1", false, "")

      expect(a_request(:post, url).with(body: hash_including("reaction" => ""))).to have_been_made
    end

    it "trata nil como remoção" do
      stub_request(:post, url).to_return(json_reply({ key: { id: "REACT-3" } }))

      connector.send_reaction("5511999999999", "ALVO-1", false, nil)

      expect(a_request(:post, url).with(body: hash_including("reaction" => ""))).to have_been_made
    end

    it "levanta quando o provedor recusa a reação" do
      stub_request(:post, url).to_return(status: 400, body: "Reaction must be a single emoji or empty string")

      expect { connector.send_reaction("55119", "ALVO-1", false, "nope") }.to raise_error(/Failed to send reaction/)
    end

    it "2xx sem corpo devolve nil sem reagir de novo" do
      request = stub_request(:post, url).to_return(status: 201, body: "")

      expect(connector.send_reaction("55119", "ALVO-1", false, "👍")).to be_nil
      expect(request).to have_been_made.once
    end
  end

  describe "#send_presence" do
    let(:url) { "#{base}/chat/sendPresence/WS-EVO" }

    it "manda presença na raiz e em options" do
      request = stub_request(:post, url)
        .with(body: { number: "5511999999999", delay: 120, presence: "composing", options: { delay: 120, presence: "composing", number: "5511999999999" } }.to_json)
        .to_return(json_reply({}, status: 201))

      connector.send_presence("5511999999999", "composing")

      expect(request).to have_been_requested
    end

    it "não levanta quando o provedor recusa: presença é melhor esforço" do
      stub_request(:post, url).to_return(status: 500, body: "boom")

      expect { connector.send_presence("55119", "composing") }.not_to raise_error
    end
  end

  describe "#retriever_media_message" do
    let(:url) { "#{base}/chat/getBase64FromMediaMessage/WS-EVO" }

    it "pede o base64 e devolve o campo da resposta" do
      request = stub_request(:post, url)
        .with(body: { message: { key: { id: "MID-1" } }, convertToMp4: false }.to_json)
        .to_return(json_reply({ base64: "BASE64-DATA" }))

      expect(connector.retriever_media_message("MID-1", :audio, true)).to eq("BASE64-DATA")
      expect(request).to have_been_requested
    end

    it "grava em arquivo quando não pedem base64" do
      stub_request(:post, url).to_return(json_reply({ base64: Base64.strict_encode64("BINARIO") }))

      path = connector.retriever_media_message("MID-1", :image)

      expect(File.binread(path)).to eq("BINARIO")
      expect(path.to_s).to end_with(".jpg")
    ensure
      remove_file(path)
    end

    it "levanta depois de 3 tentativas" do
      request = stub_request(:post, url).to_return(status: 500, body: "boom")

      expect { connector.retriever_media_message("MID-1", :audio, true) }.to raise_error(/código de resposta 500/)
      expect(request).to have_been_made.times(3)
    end

    context "com a mediaUrl do webhook" do
      let(:media_url) { "https://bucket.exemplo.com/foto.jpg" }
      let(:payload) { { message: { mediaUrl: media_url } } }

      it "baixa direto e não pede base64 à Evolution" do
        stub_request(:get, media_url).to_return(status: 200, body: "BYTES")

        expect(connector.retriever_media_message("MID-1", :image, true, payload)).to eq(Base64.strict_encode64("BYTES"))
        expect(a_request(:post, url)).not_to have_been_made
      end

      it "grava em arquivo quando não pedem base64" do
        stub_request(:get, media_url).to_return(status: 200, body: "BYTES")

        path = connector.retriever_media_message("MID-1", :image, false, payload)

        expect(File.binread(path)).to eq("BYTES")
      ensure
        remove_file(path)
      end

      it "levanta quando o download falha" do
        stub_request(:get, media_url).to_return(status: 403, body: "")

        expect { connector.retriever_media_message("MID-1", :image, true, payload) }.to raise_error(/Failed to fetch media from URL \(403\)/)
      end
    end
  end

  describe "#retriever_media_message_complete" do
    it "usa o mesmo pedido do base64" do
      stub_request(:post, "#{base}/chat/getBase64FromMediaMessage/WS-EVO").to_return(json_reply({ base64: "DADOS" }))

      expect(connector.retriever_media_message_complete("MID", {}, :audio, true)).to eq("DADOS")
    end
  end

  describe "#activate" do
    let(:url) { "#{base}/instance/create" }
    let(:connector) { create(:connector_whatsapp_web, organization: organization, instance_name: "WS-EVO", status: :inactive) }

    def reply(extra = {})
      json_reply({ hash: "NEW-EVO-KEY", qrcode: { base64: "QR-B64" } }.merge(extra), status: 201)
    end

    it "cria a instância no Baileys pedindo QR code" do
      stub_request(:post, url).to_return(reply)

      connector.activate

      expect(a_request(:post, url).with(
        headers: { "apikey" => "chave-evolution" },
        body: hash_including("instanceName" => "WS-EVO", "integration" => "WHATSAPP-BAILEYS", "qrcode" => true)
      )).to have_been_made
    end

    it "já cria apontando o webhook para /inbound/evolution, com os eventos que processamos" do
      stub_request(:post, url).to_return(reply)

      connector.activate

      webhook = {
        "enabled" => true,
        "url" => "https://api.vekoo.test/inbound/evolution/IWA-#{connector.id}",
        "byEvents" => false,
        "base64" => false,
        "events" => %w[MESSAGES_UPSERT MESSAGES_UPDATE SEND_MESSAGE CONNECTION_UPDATE QRCODE_UPDATED PRESENCE_UPDATE CONTACTS_UPSERT CONTACTS_UPDATE]
      }
      expect(a_request(:post, url).with(body: hash_including("webhook" => webhook))).to have_been_made
    end

    it "o webhook aponta para uma rota que existe e cai no controlador da Evolution" do
      stub_request(:post, url).to_return(reply)

      connector.activate

      sent = nil
      expect(a_request(:post, url).with { |request| sent = JSON.parse(request.body).dig("webhook", "url") }).to have_been_made
      expect(Rails.application.routes.recognize_path(URI(sent).path, method: :post)).to include(
        controller: "inbound/evolution", action: "receive", codename: "IWA-#{connector.id}"
      )
    end

    it "guarda a chave da instância e fica pendente" do
      stub_request(:post, url).to_return(reply)

      connector.activate

      expect(connector.reload).to have_attributes(instance_api_key: "NEW-EVO-KEY", status_cd: "pending")
    end

    it "aceita a chave aninhada do formato antigo" do
      stub_request(:post, url).to_return(reply(hash: { apikey: "NESTED-KEY" }))

      connector.activate

      expect(connector.reload.instance_api_key).to eq("NESTED-KEY")
    end

    it "gera o nome da instância quando ela não tem um" do
      unnamed = create(:connector_whatsapp_web, organization: organization, instance_name: nil, status: :inactive)
      stub_request(:post, url).to_return(reply)

      unnamed.activate

      expect(unnamed.reload.instance_name).to eq("IWA-#{unnamed.id}")
    end

    it "só manda número quando há pareamento por telefone" do
      stub_request(:post, url).to_return(reply)

      connector.activate
      expect(a_request(:post, url).with { |request| !JSON.parse(request.body).key?("number") }).to have_been_made

      connector.update!(phone_number_pairing: "5531971810932")
      connector.activate
      expect(a_request(:post, url).with(body: hash_including("number" => "5531971810932"))).to have_been_made
    end

    it "guarda o QR code por 5 minutos e avisa a tela" do
      stub_request(:post, url).to_return(reply)

      expect { connector.activate }
        .to have_broadcasted_to(connector.stream_name).with(status: "qr_updated", base64: "QR-B64", pairCode: nil)

      expect(Rails.cache.read("qrcode.base64.#{connector.id}")).to eq("QR-B64")
      travel(6.minutes) { expect(Rails.cache.read("qrcode.base64.#{connector.id}")).to be_nil }
    end

    it "levanta quando a Evolution recusa" do
      stub_request(:post, url).to_return(json_reply({ message: "nome em uso" }, status: 403))

      expect { connector.activate }.to raise_error(/Failed to create instance: 403/)
      expect(connector.reload).to be_inactive
    end

    it "não manda QR vazio para a tela nem guarda nada quando a Evolution recusa" do
      stub_request(:post, url).to_return(json_reply({ message: "nome em uso" }, status: 403))

      expect {
        expect { connector.activate }.to raise_error(/Failed to create instance/)
      }.not_to have_broadcasted_to(connector.stream_name)

      expect(Rails.cache.read("qrcode.base64.#{connector.id}")).to be_nil
    end

    it "diz que falhou também quando o gateway responde HTML" do
      stub_request(:post, url).to_return(status: 502, body: "<html>Bad Gateway</html>", headers: { "Content-Type" => "text/html" })

      expect { connector.activate }.to raise_error(/Failed to create instance: 502/)
    end

    it "não escreve a chave da instância nem o QR code no log" do
      stub_request(:post, url).to_return(reply)

      log = captured_log { connector.activate }

      expect(log).to include("activate - create")
      expect(log).not_to include("NEW-EVO-KEY", "QR-B64", "chave-evolution")
    end
  end

  describe "#setup_webhook!" do
    let(:url) { "#{base}/webhook/set/WS-EVO" }

    # Na origem era no-op; aqui reconfigura uma instância existente (a URL do backend mudou).
    it "reconfigura o webhook da instância" do
      request = stub_request(:post, url)
        .with(body: hash_including("webhook" => hash_including("enabled" => true, "url" => "https://api.vekoo.test/inbound/evolution/IWA-#{connector.id}")))
        .to_return(json_reply({}, status: 201))

      expect(connector.setup_webhook!).to be(true)
      expect(request).to have_been_requested
    end

    it "levanta quando a Evolution recusa" do
      stub_request(:post, url).to_return(status: 500, body: "boom")

      expect { connector.setup_webhook! }.to raise_error(/Failed to set webhook/)
    end
  end

  describe "#reload_instance" do
    it "reinicia por PUT /instance/restart estando ativo" do
      request = stub_request(:put, "#{base}/instance/restart/WS-EVO").to_return(json_reply({}))

      connector.reload_instance

      expect(request).to have_been_requested
    end

    it "levanta quando o provedor recusa" do
      stub_request(:put, "#{base}/instance/restart/WS-EVO").to_return(status: 500, body: "boom")

      expect { connector.reload_instance }.to raise_error(/Failed to reload instance/)
    end
  end

  describe "#logout_instance" do
    let(:url) { "#{base}/instance/logout/WS-EVO" }

    [ 200, 201, 401, 404 ].each do |code|
      it "aceita #{code} e fecha o conector" do
        stub_request(:delete, url).to_return(status: code, body: "")

        connector.logout_instance

        expect(connector.reload).to be_closed
      end
    end

    it "levanta e não fecha em erro do provedor" do
      stub_request(:delete, url).to_return(status: 500, body: "boom")

      expect { connector.logout_instance }.to raise_error(/Failed to logout instance/)
      expect(connector.reload).to be_active
    end
  end

  describe "#fetch_current_information" do
    let(:url) { "#{base}/instance/fetchInstances?instanceName=WS-EVO" }

    it "lê o formato plano da v2" do
      stub_request(:get, url).to_return(json_reply([
        { name: "OUTRA", ownerJid: "1@s.whatsapp.net" },
        { name: "WS-EVO", ownerJid: "5531999999999@s.whatsapp.net", profileName: "Ana", profilePicUrl: "https://x/ana.jpg" }
      ]))

      connector.fetch_current_information(ignore_migration: true)

      expect(connector).to have_attributes(number_id: "5531999999999", profile_name: "Ana", profile_picture_url: "https://x/ana.jpg")
    end

    it "aceita o formato aninhado da v1" do
      stub_request(:get, url).to_return(json_reply([
        { instance: { instanceName: "WS-EVO", owner: "5531999999999@s.whatsapp.net", profileName: "Ana", profilePictureUrl: "https://x/ana.jpg" } }
      ]))

      connector.fetch_current_information(ignore_migration: true)

      expect(connector).to have_attributes(number_id: "5531999999999", profile_name: "Ana", profile_picture_url: "https://x/ana.jpg")
    end

    it "não muda nada em erro do provedor" do
      stub_request(:get, url).to_return(status: 500, body: "boom")

      expect { connector.fetch_current_information(ignore_migration: true) }.not_to(change { connector.number_id })
    end

    it "não escreve no log o token que a listagem da v2 traz" do
      stub_request(:get, url).to_return(json_reply([ { name: "WS-EVO", token: "TOKEN-DA-INSTANCIA", ownerJid: "5531999999999@s.whatsapp.net" } ]))

      log = captured_log { connector.fetch_current_information(ignore_migration: true) }

      expect(log).not_to include("TOKEN-DA-INSTANCIA")
    end

    it "não muda nada com a lista vazia ou sem a instância" do
      stub_request(:get, url).to_return(json_reply([]), json_reply([ { name: "OUTRA" } ]))

      2.times do
        expect { connector.fetch_current_information(ignore_migration: true) }.not_to(change { connector.number_id })
      end
    end
  end

  describe "#check_whatsapp_numbers" do
    it "manda cada número como JID completo, para a Evolution não aplicar a heurística dela" do
      answer = [ { "jid" => "554888314715@s.whatsapp.net", "exists" => true, "number" => "554888314715@s.whatsapp.net" } ]
      request = stub_request(:post, "#{base}/chat/whatsappNumbers/WS-EVO")
        .with(body: { numbers: %w[5548988314715@s.whatsapp.net 554888314715@s.whatsapp.net] }.to_json)
        .to_return(json_reply(answer))

      expect(described_class.check_whatsapp_numbers(connector, %w[5548988314715 554888314715])).to eq(answer)
      expect(request).to have_been_requested
    end

    it "tenta 3 vezes e levanta quando o provedor recusa" do
      request = stub_request(:post, "#{base}/chat/whatsappNumbers/WS-EVO").to_return(status: 500, body: "boom")

      expect { described_class.check_whatsapp_numbers(connector, %w[55119]) }.to raise_error(/Failed to check WhatsApp numbers/)
      expect(request).to have_been_made.times(3)
    end
  end

  describe "#resolve_whatsapp_number" do
    let(:url) { "#{base}/chat/whatsappNumbers/WS-EVO" }

    def answer(number, exists:, jid: "#{number}@s.whatsapp.net")
      { jid: jid, exists: exists, number: "#{number}@s.whatsapp.net" }
    end

    def stub_check(*results)
      stub_request(:post, url).to_return(json_reply(results))
    end

    it "devolve a forma sem o 9º dígito quando só ela existe (DDD >= 31)" do
      stub_check(answer("5548988314715", exists: false), answer("554888314715", exists: true))

      expect(connector.resolve_whatsapp_number("+55 (48) 98831-4715")).to eq("554888314715")
    end

    it "devolve a forma com o 9º dígito quando só ela existe (DDD <= 28)" do
      stub_check(answer("551192064706", exists: false), answer("5511992064706", exists: true))

      expect(connector.resolve_whatsapp_number("551192064706")).to eq("5511992064706")
    end

    it "prefere a forma original quando as duas existem" do
      stub_check(answer("5548988314715", exists: true), answer("554888314715", exists: true))

      expect(connector.resolve_whatsapp_number("5548988314715")).to eq("5548988314715")
    end

    it "devolve nil quando nenhuma forma existe" do
      stub_check(answer("554733727500", exists: false), answer("5547933727500", exists: false))

      expect(connector.resolve_whatsapp_number("554733727500")).to be_nil
    end

    it "fica com a forma consultada quando a Evolution responde com um JID @lid" do
      stub_check(answer("554888314715", exists: true, jid: "123456789@lid"))

      expect(connector.resolve_whatsapp_number("554888314715")).to eq("554888314715")
    end

    it "consulta só o próprio número quando não é brasileiro" do
      stub_check(answer("14155552671", exists: true))

      expect(connector.resolve_whatsapp_number("14155552671")).to eq("14155552671")
      expect(a_request(:post, url).with(body: { numbers: [ "14155552671@s.whatsapp.net" ] }.to_json)).to have_been_made
    end

    it "consulta as duas formas de um celular brasileiro" do
      stub_check

      connector.resolve_whatsapp_number("5548988314715")

      expect(a_request(:post, url).with(body: { numbers: %w[5548988314715@s.whatsapp.net 554888314715@s.whatsapp.net] }.to_json)).to have_been_made
    end

    it "aceita o JID como entrada" do
      stub_check(answer("5548988314715", exists: true))

      expect(connector.resolve_whatsapp_number("5548988314715@s.whatsapp.net")).to eq("5548988314715")
    end

    it "em branco devolve vazio sem consultar" do
      expect(connector.resolve_whatsapp_number("")).to eq("")
      expect(a_request(:post, url)).not_to have_been_made
    end
  end

  describe "o que a Evolution não tem" do
    it "apagar mensagem é só da Z-API" do
      expect { connector.delete_message(phone: "1", message_id: "m") }.to raise_error(ZapiClient::Error)
    end
  end
end
