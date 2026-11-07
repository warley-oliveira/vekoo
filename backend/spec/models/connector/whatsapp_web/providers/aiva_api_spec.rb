require "rails_helper"

RSpec.describe Connector::WhatsappWeb::Providers::AivaApi do
  before { stub_every_host_as_public }

  include ConnectorHelpers

  let(:organization) { create(:organization) }
  let(:connector) { create(:connector_whatsapp_web, :aiva, organization: organization, instance_name: "WS-AIVA", api_key: "chave-aiva") }
  let(:base) { "http://aiva.test" }
  let(:fixture) { Rails.root.join("spec/fixtures/files/foto.png").to_s }

  before { allow(Connector::WhatsappWeb::Providers::Base).to receive(:sleep) }

  around { |example| with_env("BACKEND_URL" => "https://api.vekoo.test") { example.run } }

  describe "#activate" do
    let(:create_instance) do
      stub_request(:post, "#{base}/instance/create")
        .with(headers: { "apikey" => "chave-aiva" })
        .to_return(json_reply({ hash: { apikey: "NEW-KEY" } }))
    end
    let(:set_webhook) { stub_request(:post, "#{base}/webhook/set/WS-AIVA").to_return(json_reply({})) }
    let(:connect) { stub_request(:get, "#{base}/instance/connect/WS-AIVA").to_return(json_reply({})) }

    before do
      create_instance
      set_webhook
      connect
    end

    it "cria a instância, aponta o webhook, conecta e fica pendente" do
      connector.activate

      expect(create_instance).to have_been_requested
      expect(connect).to have_been_requested
      expect(a_request(:post, "#{base}/webhook/set/WS-AIVA")
        .with(body: { enabled: true, url: "https://api.vekoo.test/inbound/evolution/IWA-#{connector.id}?token=#{connector.inbound_token}" }.to_json)).to have_been_made
      expect(connector.reload).to have_attributes(instance_api_key: "NEW-KEY", status_cd: "pending")
    end

    it "gera o nome da instância quando ela não tem um" do
      unnamed = create(:connector_whatsapp_web, :aiva, organization: organization, instance_name: nil, api_key: "chave-aiva")
      name = "IWA-#{unnamed.id}"
      stub_request(:post, "#{base}/webhook/set/#{name}").to_return(json_reply({}))
      stub_request(:get, "#{base}/instance/connect/#{name}").to_return(json_reply({}))

      unnamed.activate

      expect(unnamed.reload.instance_name).to eq(name)
      expect(a_request(:post, "#{base}/instance/create").with(body: hash_including("instanceName" => name))).to have_been_made
    end

    it "só pede o histórico completo com a flag da organização" do
      connector.activate
      expect(a_request(:post, "#{base}/instance/create").with(body: hash_including("syncFullHistory" => false))).to have_been_made

      organization.update!(features: { "sync_message_history" => true })
      Connector::Base.find(connector.id).activate
      expect(a_request(:post, "#{base}/instance/create").with(body: hash_including("syncFullHistory" => true))).to have_been_made
    end

    it "pede pareamento por código quando há telefone para isso" do
      connector.update!(phone_number_pairing: "5531971810932")

      connector.activate

      expect(a_request(:post, "#{base}/instance/create")
        .with(body: hash_including("phoneNumberPairing" => "5531971810932", "pairingWithCode" => true))).to have_been_made
    end

    it "levanta quando instance/create não responde 2xx" do
      stub_request(:post, "#{base}/instance/create").to_return(status: 500, body: "boom")

      expect { connector.activate }.to raise_error(/Failed to create instance/)
      expect(connector.reload).to be_active
    end

    it "levanta quando o webhook não é aceito" do
      stub_request(:post, "#{base}/webhook/set/WS-AIVA").to_return(status: 500, body: "boom")

      expect { connector.activate }.to raise_error(/Failed to connect instance/)
    end

    it "levanta quando a conexão falha" do
      stub_request(:get, "#{base}/instance/connect/WS-AIVA").to_return(status: 500, body: "boom")

      expect { connector.activate }.to raise_error(/Failed to connect instance/)
    end

    it "não escreve a chave da instância nem o código de pareamento no log" do
      stub_request(:get, "#{base}/instance/connect/WS-AIVA").to_return(json_reply({ pairingCode: "PAREAMENTO-1", base64: "QR-B64" }))

      log = captured_log { connector.activate }

      expect(log).to include("activate - create")
      expect(log).not_to include("NEW-KEY", "PAREAMENTO-1", "QR-B64", "chave-aiva")
    end
  end

  describe "#setup_webhook!" do
    it "manda a URL e segue em silêncio na resposta 2xx" do
      request = stub_request(:post, "#{base}/webhook/set/WS-AIVA").to_return(json_reply({}, status: 201))

      expect { connector.setup_webhook! }.not_to raise_error
      expect(request).to have_been_requested
    end

    it "levanta quando a resposta não é 2xx" do
      stub_request(:post, "#{base}/webhook/set/WS-AIVA").to_return(status: 500, body: "boom")

      expect { connector.setup_webhook! }.to raise_error(/Failed to connect instance/)
    end
  end

  describe "#send_text_message" do
    let(:url) { "#{base}/message/sendText/WS-AIVA" }

    it "manda no envelope textMessage com o JID completo e devolve o id" do
      request = stub_request(:post, url)
        .with(body: { number: "5511999999999@s.whatsapp.net", textMessage: { text: "oi" }, options: { delay: 0, presence: "available" } }.to_json)
        .to_return(json_reply({ key: { id: "OUT-MID" } }))

      expect(connector.send_text_message("5511999999999", "oi")).to eq("OUT-MID")
      expect(request).to have_been_requested
    end

    it "não repete o sufixo de um JID que já veio pronto" do
      stub_request(:post, url).to_return(json_reply({ key: { id: "OUT-MID" } }))

      connector.send_text_message("5511999999999@s.whatsapp.net", "oi")

      expect(a_request(:post, url).with(body: hash_including("number" => "5511999999999@s.whatsapp.net"))).to have_been_made
    end

    it "ignora a citação: a AIVA não tem como responder a uma mensagem" do
      stub_request(:post, url).to_return(json_reply({ key: { id: "OUT-MID" } }))

      connector.send_text_message("55119", "oi", nil, reply_to_external_id: "PAI")

      expect(a_request(:post, url).with { |request| !request.body.include?("PAI") }).to have_been_made
    end

    it "tenta 3 vezes em resposta que não é 2xx e levanta" do
      request = stub_request(:post, url).to_return(status: 500, body: "boom")

      expect { connector.send_text_message("55119", "oi") }.to raise_error(/Failed to send message/)
      expect(request).to have_been_made.times(3)
    end

    it "se recupera quando a tentativa seguinte dá certo" do
      stub_request(:post, url).to_return({ status: 500, body: "boom" }, json_reply({ key: { id: "OUT-2" } }))

      expect(connector.send_text_message("55119", "oi")).to eq("OUT-2")
    end

    it "2xx sem corpo devolve nil sem reenviar: a mensagem já saiu" do
      request = stub_request(:post, url).to_return(status: 200, body: "", headers: { "Content-Type" => "application/json" })

      expect(connector.send_text_message("55119", "oi")).to be_nil
      expect(request).to have_been_made.once
    end
  end

  describe "#send_media_message" do
    let(:url) { "#{base}/message/sendMediaFile/WS-AIVA" }

    context "com arquivo local" do
      it "manda multipart para sendMediaFile com número, tipo, nome e legenda" do
        request = stub_request(:post, url)
          .with(headers: { "apikey" => "chave-aiva" }) { |req|
            req.headers["Content-Type"].start_with?("multipart/form-data") &&
              req.body.include?(%(name="number")) && req.body.include?("5511999999999") &&
              req.body.include?(%(name="mediatype")) && req.body.include?("image") &&
              req.body.include?(%(name="fileName")) && req.body.include?("foto.png") &&
              req.body.include?(%(name="caption")) && req.body.b.include?("Olha só".b)
          }
          .to_return(json_reply({ key: { id: "MED1" } }))

        response = connector.send_media_message("5511999999999", media_dto("image", "foto.png", caption: "Olha só", attachment: fixture))

        expect(request).to have_been_requested
        expect(Connectors::ExternalId.from(response)).to eq("MED1")
      end

      it "só manda legenda em imagem e vídeo" do
        request = stub_request(:post, url).with { |req| !req.body.include?(%(name="caption")) }.to_return(json_reply({}))

        connector.send_media_message("55119", media_dto("document", "foto.png", caption: "Ignorada", attachment: fixture))

        expect(request).to have_been_requested
      end

      it "tira acentos do nome do arquivo" do
        request = stub_request(:post, url).with { |req| req.body.include?("relatorio-marco.png") }.to_return(json_reply({}))

        connector.send_media_message("55119", media_dto("document", "relatório-março.png", attachment: fixture))

        expect(request).to have_been_requested
      end

      it "não quebra com strings congeladas no DTO ou no destino" do
        request = stub_request(:post, url).to_return(json_reply({}))
        dto = media_dto(nil, "foto.png".freeze, attachment: fixture)

        expect { connector.send_media_message("5511999999999".freeze, dto) }.not_to raise_error
        expect(request).to have_been_requested.once
      end

      it "tenta 3 vezes e levanta quando o provedor recusa" do
        request = stub_request(:post, url).to_return(status: 500, body: "boom")

        expect { connector.send_media_message("55119", media_dto("image", "foto.png", attachment: fixture)) }.to raise_error(/Failed to send message/)
        expect(request).to have_been_made.times(3)
      end
    end

    context "com URL remota" do
      let(:remote) { "https://cdn.exemplo.com/foto.jpg" }

      it "baixa e reenvia como arquivo" do
        stub_request(:get, remote).to_return(status: 200, body: "BYTES-DA-FOTO")
        request = stub_request(:post, url).with { |req| req.body.include?("BYTES-DA-FOTO") }.to_return(json_reply({ key: { id: "MED2" } }))

        response = connector.send_media_message("55119", media_dto("image", "foto.jpg", url: remote))

        expect(request).to have_been_requested
        expect(Connectors::ExternalId.from(response)).to eq("MED2")
      end

      it "levanta sem enviar nada quando a URL não baixa, para quem chamou registrar a falha" do
        stub_request(:get, remote).to_return(status: 404, body: "")

        expect { connector.send_media_message("55119", media_dto("image", "foto.jpg", url: remote)) }.to raise_error(/Failed to fetch remote media: HTTP 404/)

        expect(a_request(:post, url)).not_to have_been_made
      end

      context "com o arquivo temporário" do
        let(:created_dirs) { [] }
        let(:written_paths) { [] }

        before do
          stub_request(:get, remote).to_return(status: 200, body: "BYTES-DA-FOTO")
          stub_request(:post, url).to_return(json_reply({ key: { id: "MED2" } }))
          allow(Dir).to receive(:mktmpdir).and_wrap_original { |original, *args| original.call(*args).tap { |dir| created_dirs << dir } }
          allow(File).to receive(:write).and_wrap_original do |original, path, *args, **options|
            written_paths << path
            original.call(path, *args, **options)
          end
        end

        it "não deixa nada para trás" do
          connector.send_media_message("55119", media_dto("image", "foto.jpg", url: remote))

          expect(created_dirs.size).to eq(1)
          expect(Dir.exist?(created_dirs.first)).to be(false)
        end

        it "limpa também quando o provedor recusa" do
          stub_request(:post, url).to_return(status: 500, body: "boom")

          expect { connector.send_media_message("55119", media_dto("image", "foto.jpg", url: remote)) }.to raise_error(/Failed to send message/)

          expect(created_dirs).to all(satisfy { |dir| !Dir.exist?(dir) })
        end

        it "não deixa o nome do arquivo escolher onde ele cai" do
          connector.send_media_message("55119", media_dto("image", "../../fora.jpg", url: remote))

          expect(written_paths).to eq([ File.join(created_dirs.first, "fora.jpg") ])
        end
      end
    end
  end

  describe "#send_audio_message_by_url" do
    let(:url) { "#{base}/message/sendWhatsAppAudio/WS-AIVA" }

    it "manda no envelope audioMessage" do
      request = stub_request(:post, url)
        .with(body: { number: "5511999999999", audioMessage: { audio: "https://x/audio.ogg" }, options: { delay: 0 } }.to_json)
        .to_return(json_reply({ key: { id: "AUD1" } }))

      connector.send_audio_message_by_url("5511999999999", "https://x/audio.ogg", nil)

      expect(request).to have_been_requested
    end

    it "devolve a resposta: é dela que sai o id da mensagem" do
      stub_request(:post, url).to_return(json_reply({ key: { id: "AUD1" } }))

      expect(Connectors::ExternalId.from(connector.send_audio_message_by_url("55119", "https://x/audio.ogg"))).to eq("AUD1")
    end

    it "tenta 3 vezes e levanta quando o provedor recusa" do
      request = stub_request(:post, url).to_return(status: 500, body: "boom")

      expect { connector.send_audio_message_by_url("55119", "https://x/audio.ogg") }.to raise_error(/Failed to send message/)
      expect(request).to have_been_made.times(3)
    end
  end

  describe "#mark_read_message" do
    it "marca por PUT, com fromMe falso" do
      request = stub_request(:put, "#{base}/chat/markMessageAsRead/WS-AIVA")
        .with(body: { readMessages: [ { remoteJid: "55119@s.whatsapp.net", fromMe: false, id: "MID-1" } ] }.to_json)
        .to_return(json_reply({}))

      connector.mark_read_message("55119@s.whatsapp.net", "MID-1")

      expect(request).to have_been_requested
    end
  end

  describe "#send_presence" do
    let(:url) { "#{base}/message/sendPresenceUpdate/WS-AIVA" }

    it "manda presença e número" do
      request = stub_request(:post, url).with(body: { presence: "composing", number: "5511999999999" }.to_json).to_return(json_reply({}))

      connector.send_presence("5511999999999", "composing")

      expect(request).to have_been_requested
    end

    it "tenta 3 vezes e levanta quando o provedor recusa" do
      request = stub_request(:post, url).to_return(status: 500, body: "boom")

      expect { connector.send_presence("55119", "composing") }.to raise_error(/Failed to send message/)
      expect(request).to have_been_made.times(3)
    end
  end

  describe "#retriever_media_message" do
    let(:url) { "#{base}/chat/retrieverMediaMessage/WS-AIVA" }

    it "devolve o corpo em base64 quando pedido" do
      request = stub_request(:post, url)
        .with(headers: { "apikey" => "chave-aiva" }, body: { key: { id: "MID-1" } }.to_json)
        .to_return(status: 200, body: "BINARIO")

      expect(connector.retriever_media_message("MID-1", :audio, true)).to eq(Base64.strict_encode64("BINARIO"))
      expect(request).to have_been_requested
    end

    it "grava em arquivo temporário com a extensão do tipo" do
      stub_request(:post, url).to_return(status: 200, body: "BINARIO")

      path = connector.retriever_media_message("MID-1", :image)

      expect(path.to_s).to end_with(".jpg")
      expect(File.binread(path)).to eq("BINARIO")
    ensure
      remove_file(path)
    end

    it "usa o payload do webhook quando ele vem" do
      request = stub_request(:post, url).with(body: { key: { id: "OUTRO" }, message: {} }.to_json).to_return(status: 200, body: "BINARIO")

      connector.retriever_media_message("MID-1", :audio, true, { key: { id: "OUTRO" }, message: {} })

      expect(request).to have_been_requested
    end

    it "tenta 3 vezes e levanta com o código da resposta" do
      request = stub_request(:post, url).to_return(status: 500, body: "boom")

      expect { connector.retriever_media_message("MID-1", :audio, true) }.to raise_error(/código de resposta 500/)
      expect(request).to have_been_made.times(3)
    end
  end

  describe "#retriever_media_message_complete" do
    let(:url) { "#{base}/chat/retrieverMediaMessage/WS-AIVA" }

    it "manda a mensagem inteira e devolve base64" do
      request = stub_request(:post, url).with(body: { key: { id: "MID" }, message: { foo: 1 } }.to_json).to_return(status: 200, body: "BINARIO")

      expect(connector.retriever_media_message_complete("MID", { foo: 1 }, :audio, true)).to eq(Base64.strict_encode64("BINARIO"))
      expect(request).to have_been_requested
    end

    it "grava em arquivo quando não pedem base64" do
      stub_request(:post, url).to_return(status: 200, body: "BINARIO")

      path = connector.retriever_media_message_complete("MID", {}, :audio)

      expect(File.binread(path)).to eq("BINARIO")
      expect(path.to_s).to end_with(".ogg")
    ensure
      remove_file(path)
    end
  end

  describe "#reload_instance" do
    it "chama /instance/reload estando ativo" do
      request = stub_request(:get, "#{base}/instance/reload/WS-AIVA").to_return(json_reply({}))

      connector.reload_instance

      expect(request).to have_been_requested
    end

    it "levanta quando o provedor recusa" do
      stub_request(:get, "#{base}/instance/reload/WS-AIVA").to_return(status: 500, body: "boom")

      expect { connector.reload_instance }.to raise_error(/Failed to send message/)
    end
  end

  describe "#logout_instance" do
    let(:url) { "#{base}/instance/logout/WS-AIVA" }

    [ 200, 201, 401, 404 ].each do |code|
      it "aceita #{code} e fecha o conector" do
        stub_request(:delete, url).to_return(status: code, body: "")

        connector.logout_instance

        expect(connector.reload).to be_closed
      end
    end

    it "levanta e não fecha em erro do provedor" do
      stub_request(:delete, url).to_return(status: 500, body: "boom")

      expect { connector.logout_instance }.to raise_error(/Failed to send message/)
      expect(connector.reload).to be_active
    end
  end

  describe "#fetch_current_information" do
    let(:url) { "#{base}/instance/fetchInstances" }

    it "lê o perfil da instância na lista" do
      stub_request(:get, url).to_return(json_reply([
        { instance: { instanceName: "OUTRA", owner: "1@s.whatsapp.net", profileName: "Outra" } },
        { instance: { instanceName: "WS-AIVA", owner: "5511999999999@s.whatsapp.net", profilePictureUrl: "http://x/pic.jpg", profileName: "Bob" } }
      ]))

      connector.fetch_current_information(ignore_migration: true)

      expect(connector).to have_attributes(number_id: "5511999999999", profile_picture_url: "http://x/pic.jpg", profile_name: "Bob")
    end

    it "não muda nada quando a instância não está na lista" do
      stub_request(:get, url).to_return(json_reply([]))

      expect { connector.fetch_current_information(ignore_migration: true) }.not_to(change { connector.number_id })
    end

    it "não derruba quem chamou quando o provedor responde erro" do
      stub_request(:get, url).to_return(json_reply({ error: "não autorizado" }, status: 401))

      expect { connector.fetch_current_information(ignore_migration: true) }.not_to raise_error
      expect(connector.number_id).to eq("5531971810932")
    end

    it "aguenta instância ainda sem dono" do
      stub_request(:get, url).to_return(json_reply([ { instance: { instanceName: "WS-AIVA", profileName: "Bob" } } ]))

      connector.fetch_current_information(ignore_migration: true)

      expect(connector).to have_attributes(number_id: nil, profile_name: "Bob")
    end

    it "migra as conversas antes, salvo quando mandam ignorar" do
      stub_request(:get, url).to_return(json_reply([]))
      old = create(:connector_whatsapp_web, :aiva, organization: organization, status: :closed, number_id: connector.number_id)
      chat = create(:chat, connector: old)

      connector.fetch_current_information(ignore_migration: true)
      expect(chat.reload.connector_id).to eq(old.id)

      connector.fetch_current_information
      expect(chat.reload.connector_id).to eq(connector.id)
    end
  end

  describe "o que a AIVA não tem" do
    it "reação é só da Evolution" do
      expect { connector.send_reaction("55119", "ALVO", true, "👍") }.to raise_error(NoMethodError)
    end

    it "não confere número: devolve os dígitos sem chamar nada" do
      expect(connector.verifies_whatsapp_numbers?).to be(false)
      expect(connector.resolve_whatsapp_number("+55 48 98831-4715")).to eq("5548988314715")
      expect(a_request(:any, /aiva\.test/)).not_to have_been_made
    end
  end
end
