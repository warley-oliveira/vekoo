require "rails_helper"

RSpec.describe Connector::WhatsappWeb::Providers::Zapi do
  before { stub_every_host_as_public }

  include ConnectorHelpers

  let(:organization) { create(:organization, name: "Loja da Ana") }
  let(:connector) { create(:connector_whatsapp_web, :zapi, organization: organization, instance_name: "WS-ZAPI") }
  let(:base) { "https://api.z-api.io/instances/INST123/token/TOKABC" }

  around { |example| with_env("BACKEND_URL" => "https://api.vekoo.test") { example.run } }

  describe "#send_text_message" do
    let(:url) { "#{base}/send-text" }

    it "manda telefone e texto e devolve o id" do
      request = stub_request(:post, url)
        .with(body: { phone: "5511999999999", message: "oi" }.to_json)
        .to_return(json_reply({ messageId: "OUT-1" }))

      expect(connector.send_text_message("5511999999999", "oi")).to eq("OUT-1")
      expect(request).to have_been_requested
    end

    it "manda a citação em messageId" do
      request = stub_request(:post, url)
        .with(body: { phone: "5511999999999", message: "respondendo", messageId: "WAID-PAI" }.to_json)
        .to_return(json_reply({ messageId: "OUT-1" }))

      connector.send_text_message("5511999999999", "respondendo", nil, reply_to_external_id: "WAID-PAI")

      expect(request).to have_been_requested
    end

    it "não manda messageId sem citação" do
      request = stub_request(:post, url).with { |req| !JSON.parse(req.body).key?("messageId") }.to_return(json_reply({ messageId: "OUT-1" }))

      connector.send_text_message("5511999999999", "oi")

      expect(request).to have_been_requested
    end

    it "tira o sufixo do JID" do
      stub_request(:post, url).to_return(json_reply({ messageId: "OUT-1" }))

      connector.send_text_message("5511999999999@s.whatsapp.net", "oi")

      expect(a_request(:post, url).with(body: hash_including("phone" => "5511999999999"))).to have_been_made
    end

    it "marca como @lid o id longo que não é telefone brasileiro" do
      stub_request(:post, url).to_return(json_reply({ messageId: "OUT-1" }))

      connector.send_text_message("123456789012345", "oi")

      expect(a_request(:post, url).with(body: hash_including("phone" => "123456789012345@lid"))).to have_been_made
    end

    it "deixa como está o que já é @lid" do
      stub_request(:post, url).to_return(json_reply({ messageId: "OUT-1" }))

      connector.send_text_message("123456789012345@lid", "oi")

      expect(a_request(:post, url).with(body: hash_including("phone" => "123456789012345@lid"))).to have_been_made
    end

    it "devolve nil quando a resposta não traz id" do
      stub_request(:post, url).to_return(json_reply({}))

      expect(connector.send_text_message("55119", "oi")).to be_nil
    end

    it "devolve nil quando a resposta não é JSON, sem levantar" do
      stub_request(:post, url).to_return(status: 200, body: "ok", headers: { "Content-Type" => "text/plain" })

      expect(connector.send_text_message("55119", "oi")).to be_nil
    end

    it "não repete: a falha sobe como ZapiClient::Error na primeira tentativa" do
      request = stub_request(:post, url).to_return(status: 500, body: "boom")

      expect { connector.send_text_message("55119", "oi") }.to raise_error(ZapiClient::Error, /500/)
      expect(request).to have_been_made.once
    end

    it "não envia desconectado" do
      closed = create(:connector_whatsapp_web, :zapi, organization: organization, status: :closed)

      expect(closed.send_text_message("55119", "oi")).to be_nil
      expect(closed.errors[:not_connected]).to be_present
      expect(a_request(:post, url)).not_to have_been_made
    end
  end

  describe "#send_media_message" do
    let(:media_url) { "https://cdn.exemplo.com/arquivo.jpg" }

    it "imagem vai por send-image, com legenda" do
      request = stub_request(:post, "#{base}/send-image")
        .with(body: { phone: "5511999999999", image: media_url, viewOnce: false, caption: "Olha" }.to_json)
        .to_return(json_reply({ messageId: "IMG1" }))

      response = connector.send_media_message("5511999999999", media_dto("image", "arquivo.jpg", caption: "Olha", url: media_url))

      expect(request).to have_been_requested
      expect(Connectors::ExternalId.from(response)).to eq("IMG1")
    end

    it "vídeo vai por send-video" do
      request = stub_request(:post, "#{base}/send-video")
        .with(body: { phone: "5511999999999", video: media_url, viewOnce: false, caption: "Olha" }.to_json)
        .to_return(json_reply({ messageId: "VID1" }))

      connector.send_media_message("5511999999999", media_dto("video", "arquivo.mp4", caption: "Olha", url: media_url))

      expect(request).to have_been_requested
    end

    %w[document file].each do |type|
      it "#{type} vai por send-document, pela extensão do nome" do
        request = stub_request(:post, "#{base}/send-document/pdf")
          .with(body: { phone: "5511999999999", document: media_url, fileName: "tabela.pdf" }.to_json)
          .to_return(json_reply({ messageId: "DOC1" }))

        connector.send_media_message("5511999999999", media_dto(type, "tabela.pdf", url: media_url))

        expect(request).to have_been_requested
      end
    end

    it "tipo desconhecido vai como imagem" do
      request = stub_request(:post, "#{base}/send-image").to_return(json_reply({ messageId: "IMG2" }))

      connector.send_media_message("55119", media_dto("sticker", nil, url: media_url))

      expect(request).to have_been_requested
    end

    it "sem tipo vai como imagem" do
      request = stub_request(:post, "#{base}/send-image").to_return(json_reply({ messageId: "IMG3" }))

      connector.send_media_message("55119", media_dto(nil, nil, url: media_url))

      expect(request).to have_been_requested
    end

    it "legenda em branco não vai" do
      request = stub_request(:post, "#{base}/send-image").with { |req| !JSON.parse(req.body).key?("caption") }.to_return(json_reply({}))

      connector.send_media_message("55119", media_dto("image", nil, caption: "", url: media_url))

      expect(request).to have_been_requested
    end

    it "a falha sobe como ZapiClient::Error" do
      stub_request(:post, "#{base}/send-image").to_return(status: 500, body: "boom")

      expect { connector.send_media_message("55119", media_dto("image", nil, url: media_url)) }.to raise_error(ZapiClient::Error)
    end
  end

  describe "#send_audio_message_by_url" do
    it "manda como mensagem de voz" do
      request = stub_request(:post, "#{base}/send-audio")
        .with(body: { phone: "5511999999999", audio: "https://x/audio.ogg", viewOnce: false, waveform: true }.to_json)
        .to_return(json_reply({ messageId: "AUD1" }))

      response = connector.send_audio_message_by_url("5511999999999", "https://x/audio.ogg", nil)

      expect(request).to have_been_requested
      expect(Connectors::ExternalId.from(response)).to eq("AUD1")
    end

    it "a falha sobe como ZapiClient::Error" do
      stub_request(:post, "#{base}/send-audio").to_return(status: 500, body: "boom")

      expect { connector.send_audio_message_by_url("55119", "https://x/audio.ogg") }.to raise_error(ZapiClient::Error)
    end
  end

  describe "#mark_read_message" do
    it "marca com o telefone limpo" do
      request = stub_request(:post, "#{base}/read-message")
        .with(body: { phone: "5511999999999", messageId: "MID-1" }.to_json)
        .to_return(status: 204, body: "")

      expect(connector.mark_read_message("5511999999999@s.whatsapp.net", "MID-1")).to be(true)
      expect(request).to have_been_requested
    end

    it "devolve false em vez de levantar: confirmação de leitura é melhor esforço" do
      stub_request(:post, "#{base}/read-message").to_return(status: 500, body: "boom")

      expect(connector.mark_read_message("55119", "MID-1")).to be(false)
    end
  end

  describe "#send_presence" do
    it "atualiza a presença com o telefone limpo" do
      request = stub_request(:put, "#{base}/chat/updatePresence?number=5511999999999")
        .with(body: { presence: "composing", delay: 1200 }.to_json)
        .to_return(json_reply({}))

      expect(connector.send_presence("5511999999999@s.whatsapp.net", "composing")).to be(true)
      expect(request).to have_been_requested
    end

    it "devolve false em vez de levantar quando a Z-API recusa" do
      stub_request(:put, /updatePresence/).to_return(status: 500, body: "boom")

      expect(connector.send_presence("55119", "composing")).to be(false)
    end

    it "devolve false para presença que não existe, sem chamar a Z-API" do
      expect(connector.send_presence("55119", "dancing")).to be(false)
      expect(a_request(:put, /updatePresence/)).not_to have_been_made
    end
  end

  describe "#retriever_media_message" do
    let(:media_url) { "https://z-api.exemplo.com/media.bin" }

    before { stub_request(:get, media_url).to_return(status: 200, body: "BINARIO") }

    {
      "audio" => { "audio" => { "audioUrl" => "https://z-api.exemplo.com/media.bin" } },
      "imagem" => { "image" => { "imageUrl" => "https://z-api.exemplo.com/media.bin" } },
      "vídeo" => { "video" => { "videoUrl" => "https://z-api.exemplo.com/media.bin" } },
      "documento" => { "document" => { "documentUrl" => "https://z-api.exemplo.com/media.bin" } },
      "chaves em símbolo" => { audio: { audioUrl: "https://z-api.exemplo.com/media.bin" } }
    }.each do |name, payload|
      it "acha a URL de #{name} no payload do webhook e devolve base64" do
        expect(connector.retriever_media_message("MID-1", :audio, true, payload)).to eq(Base64.strict_encode64("BINARIO"))
      end
    end

    it "grava em arquivo quando não pedem base64" do
      path = connector.retriever_media_message("MID-1", :image, false, { "image" => { "imageUrl" => media_url } })

      expect(File.binread(path)).to eq("BINARIO")
      expect(path.to_s).to end_with(".jpg")
    ensure
      remove_file(path)
    end

    it "devolve nil sem URL no payload" do
      expect(connector.retriever_media_message("MID-1", :audio, false, {})).to be_nil
    end

    it "devolve nil sem payload" do
      expect(connector.retriever_media_message("MID-1", :audio, false, nil)).to be_nil
    end

    it "devolve nil quando o download falha" do
      stub_request(:get, media_url).to_return(status: 404, body: "")

      expect(connector.retriever_media_message("MID-1", :audio, true, { "audio" => { "audioUrl" => media_url } })).to be_nil
    end

    it "a versão completa não tem URL de onde baixar: devolve nil" do
      expect(connector.retriever_media_message_complete("MID-1", {}, :audio, true)).to be_nil
    end
  end

  describe "#activate" do
    let(:connector) { create(:connector_whatsapp_web, :zapi, organization: organization, status: :inactive, zapi_instance_id: nil, zapi_token: nil) }
    let(:on_demand) { "https://api.z-api.io/instances/integrator/on-demand" }

    around { |example| with_env("ZAPI_ACCOUNT_TOKEN" => "CONTA") { example.run } }

    before do
      stub_request(:post, on_demand).to_return(json_reply({ id: "NEW-INST", token: "NEW-TOK" }))
      stub_request(:put, "https://api.z-api.io/instances/NEW-INST/token/NEW-TOK/update-notify-sent-by-me").to_return(json_reply({}))
    end

    it "cria a instância com o nome da organização, liga notifySentByMe e fica pendente" do
      connector.activate

      expect(a_request(:post, on_demand).with(
        headers: { "Authorization" => "Bearer CONTA" },
        body: hash_including("name" => "Loja da Ana - #{connector.id}")
      )).to have_been_made
      expect(a_request(:put, "https://api.z-api.io/instances/NEW-INST/token/NEW-TOK/update-notify-sent-by-me")
        .with(body: { notifySentByMe: true }.to_json)).to have_been_made
      expect(connector.reload).to have_attributes(zapi_instance_id: "NEW-INST", zapi_token: "NEW-TOK", status_cd: "pending")
    end

    it "aponta os callbacks para /inbound/zapi" do
      connector.activate

      prefix = "https://api.vekoo.test/inbound/zapi/#{connector.id}"
      expect(a_request(:post, on_demand).with(body: hash_including(
        "deliveryCallbackUrl" => "#{prefix}/on-message-send?token=#{connector.inbound_token}",
        "receivedCallbackUrl" => "#{prefix}/on-message-received?token=#{connector.inbound_token}",
        "disconnectedCallbackUrl" => "#{prefix}/on-whatsapp-disconnected?token=#{connector.inbound_token}",
        "connectedCallbackUrl" => "#{prefix}/on-whatsapp-connected?token=#{connector.inbound_token}"
      ))).to have_been_made
    end

    it "não cria de novo quando já tem credenciais, só fica pendente" do
      existing = create(:connector_whatsapp_web, :zapi, organization: organization, status: :inactive)

      existing.activate

      expect(a_request(:post, on_demand)).not_to have_been_made
      expect(existing.reload).to be_pending
    end

    it "levanta sem o token da conta" do
      with_env("ZAPI_ACCOUNT_TOKEN" => nil) do
        expect { connector.activate }.to raise_error(ZapiClient::Error, /account token is required/)
      end
      expect(connector.reload).to be_inactive
    end

    it "levanta e não fica pendente quando a criação falha" do
      stub_request(:post, on_demand).to_return(status: 401, body: "x")

      expect { connector.activate }.to raise_error(ZapiClient::Error, /401/)
      expect(connector.reload).to be_inactive
    end
  end

  describe "credenciais no log" do
    around { |example| with_env("ZAPI_ACCOUNT_TOKEN" => "CONTA", "ZAPI_CLIENT_TOKEN" => "CLIENTE") { example.run } }

    it "o token da instância, que vai na URL, não aparece nem em erro" do
      stub_request(:post, "#{base}/send-text").to_return(status: 500, body: "boom")
      stub_request(:post, "#{base}/send-image").to_timeout
      stub_request(:post, "#{base}/read-message").to_return(status: 500, body: "boom")

      log = captured_log do
        expect { connector.send_text_message("55119", "oi") }.to raise_error(ZapiClient::Error)
        expect { connector.send_media_message("55119", media_dto) }.to raise_error(ZapiClient::Error)
        connector.mark_read_message("55119", "M1")
      end

      expect(log).to include("Failed to send text")
      expect(log).not_to include("TOKABC", "CONTA", "CLIENTE")
    end

    it "criar a instância não escreve o token novo" do
      fresh = create(:connector_whatsapp_web, :zapi, organization: organization, zapi_instance_id: nil, zapi_token: nil, status: :inactive)
      stub_request(:post, "https://api.z-api.io/instances/integrator/on-demand").to_return(json_reply({ id: "NEW-INST", token: "NEW-TOK" }))
      stub_request(:put, "https://api.z-api.io/instances/NEW-INST/token/NEW-TOK/update-notify-sent-by-me").to_return(json_reply({}))

      log = captured_log { fresh.activate }

      expect(log).to include("Instance created successfully")
      expect(log).not_to include("NEW-TOK", "CONTA")
    end

    it "guarda o token novo cifrado" do
      fresh = create(:connector_whatsapp_web, :zapi, organization: organization, zapi_instance_id: nil, zapi_token: nil, status: :inactive)
      stub_request(:post, "https://api.z-api.io/instances/integrator/on-demand").to_return(json_reply({ id: "NEW-INST", token: "NEW-TOK" }))
      stub_request(:put, "https://api.z-api.io/instances/NEW-INST/token/NEW-TOK/update-notify-sent-by-me").to_return(json_reply({}))

      fresh.activate

      expect(stored_document(fresh).to_json).not_to include("NEW-TOK")
    end
  end

  describe "ciclo de vida sem equivalente" do
    it "#setup_webhook! não faz nada: os callbacks vão na criação" do
      expect(connector.setup_webhook!).to be(true)
    end

    it "#reload_instance não faz nada" do
      expect(connector.reload_instance).to be_nil
    end

    it "#fetch_current_information não faz nada" do
      expect(connector.fetch_current_information(ignore_migration: true)).to be_nil
    end
  end

  describe "#logout_instance" do
    it "desconecta e fecha" do
      request = stub_request(:get, "#{base}/disconnect").to_return(json_reply({ value: true }))

      connector.logout_instance

      expect(request).to have_been_requested
      expect(connector.reload).to be_closed
    end

    it "levanta e não fecha quando a Z-API recusa" do
      stub_request(:get, "#{base}/disconnect").to_return(status: 500, body: "boom")

      expect { connector.logout_instance }.to raise_error(ZapiClient::Error)
      expect(connector.reload).to be_active
    end
  end

  describe "o que a Z-API não tem" do
    it "reação é só da Evolution" do
      expect { connector.send_reaction("55119", "ALVO", true, "👍") }.to raise_error(NoMethodError)
    end

    it "não confere número: devolve os dígitos sem chamar nada" do
      expect(connector.verifies_whatsapp_numbers?).to be(false)
      expect(connector.resolve_whatsapp_number("+55 48 98831-4715")).to eq("5548988314715")
    end
  end
end
