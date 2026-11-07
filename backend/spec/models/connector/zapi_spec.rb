require "rails_helper"

# A Z-API com instância própria: o cliente cola o id e o token dele. O provider `zapi` do
# WhatsApp Web, com instância criada por nós, está em whatsapp_web/providers/zapi_spec.rb.
RSpec.describe Connector::Zapi do
  before { stub_every_host_as_public }

  include ConnectorHelpers

  let(:organization) { create(:organization) }
  let(:connector) { create(:connector_zapi, organization: organization, instance_id: "ZINST", token: "ZTOKEN", account_token: "CONTA") }
  let(:base) { "https://api.z-api.io/instances/ZINST/token/ZTOKEN" }

  before { allow(connector).to receive(:sleep) }

  around { |example| with_env("BACKEND_URL" => "https://api.vekoo.test") { example.run } }

  describe "validações" do
    it "exige o id da instância e o token" do
      invalid = described_class.new(organization_id: organization.id)

      expect(invalid).not_to be_valid
      expect(invalid.errors.attribute_names).to include(:instance_id, :token)
    end
  end

  describe "tokens em repouso" do
    it "guarda só o texto cifrado no Mongo" do
      raw = stored_document(connector)

      expect(raw.to_json).not_to include("ZTOKEN", "CONTA")
      expect(raw.keys).to include("token_ciphertext", "account_token_ciphertext")
      expect(raw.keys).not_to include("token", "account_token")
    end

    it "devolve o valor original ao ler do banco" do
      expect(Connector::Base.find(connector.id)).to have_attributes(token: "ZTOKEN", account_token: "CONTA")
    end

    it "não escreve o token no log, mesmo com ele na URL de toda chamada" do
      stub_request(:post, "#{base}/send-text").to_return(status: 500, body: "boom")
      stub_request(:post, "#{base}/send-image").to_timeout
      stub_request(:put, %r{/update-webhook-}).to_return(status: 500, body: "boom")

      log = captured_log do
        expect { connector.send_text_message("55119", "oi") }.to raise_error(described_class::ZApiError)
        connector.send_image_message("55119", "https://x/y.jpg")
        connector.setup_webhooks!
      end

      expect(log).to include("Failed to send text message")
      expect(log).not_to include("ZTOKEN", "CONTA")
    end

    it "a mensagem da exceção também não leva o token" do
      stub_request(:post, "#{base}/send-text").to_return(status: 500, body: "boom")

      expect { connector.send_text_message("55119", "oi") }.to raise_error { |error| expect(error.message).not_to include("ZTOKEN") }
    end
  end

  describe "#instance_name" do
    it "prefere o nome do perfil, depois o id da instância" do
      expect(described_class.new(profile_name: "Padaria", instance_id: "Z1").instance_name).to eq("Padaria")
      expect(described_class.new(instance_id: "Z1").instance_name).to eq("Z1")
    end

    it "cai no id do conector sem nada" do
      bare = described_class.new

      expect(bare.instance_name).to eq(bare.id.to_s)
    end
  end

  describe "#number_formated" do
    it "formata o celular" do
      expect(described_class.new(phone_number: "5531971810932").number_formated).to eq("+55 (31) 97181-0932")
    end

    it "devolve nil sem número" do
      expect(described_class.new.number_formated).to be_nil
    end
  end

  describe "#activate" do
    let(:connector) { create(:connector_zapi, organization: organization, instance_id: "ZINST", token: "ZTOKEN", status: :inactive) }

    def webhook(endpoint, path)
      a_request(:put, "#{base}/#{endpoint}").with(body: { value: "https://api.vekoo.test/inbound/zapi/#{connector.id}/#{path}" }.to_json)
    end

    it "aponta os cinco webhooks para /inbound/zapi e fica pendente" do
      stub_request(:put, %r{/update-webhook-}).to_return(json_reply({ value: true }))

      connector.activate

      expect(webhook("update-webhook-received", "on-message-received")).to have_been_made
      expect(webhook("update-webhook-received-delivery", "on-message-received")).to have_been_made
      expect(webhook("update-webhook-send", "on-message-send")).to have_been_made
      expect(webhook("update-webhook-disconnected", "on-whatsapp-disconnected")).to have_been_made
      expect(webhook("update-webhook-connected", "on-whatsapp-connected")).to have_been_made
      expect(connector.reload).to be_pending
    end

    it "cada webhook aponta para uma rota que existe" do
      %i[zapi_message_received zapi_message_send zapi_disconnected zapi_connected].each do |route|
        path = URI(connector.inbound_url(route, connector.id)).path

        expect(Rails.application.routes.recognize_path(path, method: :post)).to include(controller: "inbound/zapi", connector_id: connector.id.to_s)
      end
    end

    it "fica pendente mesmo se um webhook falhar: a falha só vai para o log" do
      stub_request(:put, %r{/update-webhook-}).to_return(status: 500, body: "boom")

      connector.activate

      expect(connector.reload).to be_pending
    end
  end

  describe "#deactivate e #logout_instance" do
    it "fica inativo, sem chamar a Z-API" do
      connector.deactivate
      expect(connector.reload).to be_inactive

      connector.update!(status: :pending)
      connector.logout_instance
      expect(connector.reload).to be_inactive
    end
  end

  describe "ao virar ativo" do
    let(:connector) { create(:connector_zapi, organization: organization, instance_id: "ZINST", token: "ZTOKEN", status: :pending, phone_number: nil, profile_name: nil) }

    it "lê telefone, nome e foto na Z-API" do
      stub_request(:get, "#{base}/device").to_return(json_reply({ phone: "5531971810932", displayName: "Padaria" }))
      stub_request(:get, "#{base}/profile-picture").to_return(json_reply({ link: "https://x/foto.jpg" }))

      connector.update!(status: :active)

      expect(connector.reload).to have_attributes(phone_number: "5531971810932", profile_name: "Padaria", profile_picture_url: "https://x/foto.jpg")
    end

    it "não consulta em outras trocas de status" do
      connector.update!(status: :failed)

      expect(a_request(:get, "#{base}/device")).not_to have_been_made
    end

    it "quem já sabe que conectou fica ativo mesmo se a Z-API não devolver o perfil agora" do
      stub_request(:get, "#{base}/device").to_timeout
      connector.tolerate_profile_failure = true

      connector.update!(status: :active)

      expect(connector.reload.status).to eq(:active)
    end

    it "sem isso, a falha sobe e nada muda" do
      stub_request(:get, "#{base}/device").to_timeout

      expect { connector.update!(status: :active) }.to raise_error(StandardError)

      expect(connector.reload.status).to eq(:pending)
    end
  end

  describe "#send_text_message" do
    let(:url) { "#{base}/send-text" }

    it "manda só os dígitos do telefone e devolve o id" do
      request = stub_request(:post, url)
        .with(headers: { "Client-Token" => "CONTA" }, body: { phone: "5531971810932", message: "oi" }.to_json)
        .to_return(json_reply({ messageId: "Z1" }))

      expect(connector.send_text_message("+55 (31) 97181-0932", "oi")).to eq("Z1")
      expect(request).to have_been_requested
    end

    it "manda atraso e citação quando pedidos" do
      request = stub_request(:post, url)
        .with(body: { phone: "55119", message: "oi", delayMessage: 3, delayTyping: 2, messageId: "PAI" }.to_json)
        .to_return(json_reply({ messageId: "Z1" }))

      connector.send_text_message("55119", "oi", nil, delay: 3, delay_typing: 2, reply_to_external_id: "PAI")

      expect(request).to have_been_requested
    end

    it "não manda Client-Token sem o token da conta" do
      plain = create(:connector_zapi, organization: organization, instance_id: "ZINST", token: "ZTOKEN")
      request = stub_request(:post, url).with { |req| !req.headers.key?("Client-Token") }.to_return(json_reply({ messageId: "Z1" }))

      plain.send_text_message("55119", "oi")

      expect(request).to have_been_requested
    end

    it "devolve nil quando a resposta não traz id" do
      stub_request(:post, url).to_return(json_reply({}))

      expect(connector.send_text_message("55119", "oi")).to be_nil
    end

    it "devolve nil em 2xx sem JSON, sem reenviar" do
      request = stub_request(:post, url).to_return(status: 200, body: "ok", headers: { "Content-Type" => "text/plain" })

      expect(connector.send_text_message("55119", "oi")).to be_nil
      expect(request).to have_been_made.once
    end

    it "desconectado registra o erro, não chama a Z-API e devolve nil: nunca o objeto de erro" do
      connector.update!(status: :closed)

      expect(connector.send_text_message("55119", "oi")).to be_nil

      expect(connector.errors[:not_connected]).to include("não conectado")
      expect(a_request(:post, url)).not_to have_been_made
    end

    it "tenta de novo e devolve o id quando a Z-API volta" do
      stub_request(:post, url).to_return({ status: 500, body: "boom" }, { status: 500, body: "boom" }, json_reply({ messageId: "Z2" }))

      expect(connector.send_text_message("55119", "oi")).to eq("Z2")
      expect(a_request(:post, url)).to have_been_made.times(3)
    end

    it "desiste depois de 3 tentativas e levanta" do
      request = stub_request(:post, url).to_return(status: 500, body: "boom")

      expect { connector.send_text_message("55119", "oi") }.to raise_error(described_class::ZApiError, /HTTP 500/)
      expect(request).to have_been_made.times(3)
    end

    it "uma falha resolvida não gasta as tentativas do próximo envio" do
      stub_request(:post, url).to_return(
        { status: 500, body: "boom" }, { status: 500, body: "boom" }, json_reply({ messageId: "Z2" }),
        { status: 500, body: "boom" }, { status: 500, body: "boom" }, json_reply({ messageId: "Z3" })
      )

      expect(connector.send_text_message("55119", "oi")).to eq("Z2")
      expect(connector.send_text_message("55119", "oi")).to eq("Z3")
    end
  end

  describe "#send_image_message" do
    let(:url) { "#{base}/send-image" }

    it "manda imagem e legenda e devolve o id" do
      request = stub_request(:post, url)
        .with(body: { phone: "55119", image: "https://x/y.jpg", viewOnce: false, caption: "Olha" }.to_json)
        .to_return(json_reply({ messageId: "I1" }))

      expect(connector.send_image_message("55119", "https://x/y.jpg", caption: "Olha")).to eq("I1")
      expect(request).to have_been_requested
    end

    it "manda visualização única" do
      stub_request(:post, url).to_return(json_reply({ messageId: "I1" }))

      connector.send_image_message("55119", "https://x/y.jpg", view_once: true)

      expect(a_request(:post, url).with(body: hash_including("viewOnce" => true))).to have_been_made
    end

    it "devolve nil em falha, sem levantar" do
      stub_request(:post, url).to_return(status: 500, body: "boom")

      expect(connector.send_image_message("55119", "https://x/y.jpg")).to be_nil
    end

    it "desconectado devolve nil, sem chamar a Z-API" do
      connector.update!(status: :closed)

      expect(connector.send_image_message("55119", "https://x/y.jpg")).to be_nil
      expect(connector.errors[:not_connected]).to be_present
      expect(a_request(:post, url)).not_to have_been_made
    end
  end

  describe "#send_video_message" do
    let(:url) { "#{base}/send-video" }

    it "manda vídeo e legenda e devolve o id" do
      request = stub_request(:post, url)
        .with(body: { phone: "55119", video: "https://x/y.mp4", viewOnce: false, caption: "Olha" }.to_json)
        .to_return(json_reply({ messageId: "V1" }))

      expect(connector.send_video_message("55119", "https://x/y.mp4", caption: "Olha")).to eq("V1")
      expect(request).to have_been_requested
    end

    it "devolve nil em falha" do
      stub_request(:post, url).to_timeout

      expect(connector.send_video_message("55119", "https://x/y.mp4")).to be_nil
    end

    it "desconectado devolve nil" do
      connector.update!(status: :closed)

      expect(connector.send_video_message("55119", "https://x/y.mp4")).to be_nil
    end
  end

  describe "#send_document_message" do
    it "usa a extensão do nome do arquivo no caminho" do
      request = stub_request(:post, "#{base}/send-document/xlsx")
        .with(body: { phone: "55119", document: "https://x/y", fileName: "tabela.xlsx" }.to_json)
        .to_return(json_reply({ messageId: "D1" }))

      expect(connector.send_document_message("55119", "https://x/y", file_name: "tabela.xlsx")).to eq("D1")
      expect(request).to have_been_requested
    end

    it "cai na extensão da URL" do
      request = stub_request(:post, "#{base}/send-document/docx").to_return(json_reply({ messageId: "D1" }))

      connector.send_document_message("55119", "https://x/contrato.docx")

      expect(request).to have_been_requested
    end

    it "assume pdf sem extensão nenhuma" do
      request = stub_request(:post, "#{base}/send-document/pdf").to_return(json_reply({ messageId: "D1" }))

      connector.send_document_message("55119", "https://x/sem-extensao")

      expect(request).to have_been_requested
    end

    it "assume pdf com URL que não abre" do
      request = stub_request(:post, "#{base}/send-document/pdf").to_return(json_reply({ messageId: "D1" }))

      connector.send_document_message("55119", "https://x/com espaço")

      expect(request).to have_been_requested
    end

    it "devolve nil em falha" do
      stub_request(:post, "#{base}/send-document/pdf").to_return(status: 500, body: "boom")

      expect(connector.send_document_message("55119", "https://x/a.pdf")).to be_nil
    end

    it "desconectado devolve nil" do
      connector.update!(status: :closed)

      expect(connector.send_document_message("55119", "https://x/a.pdf")).to be_nil
    end
  end

  describe "#send_audio_message" do
    let(:url) { "#{base}/send-audio" }

    it "manda como mensagem de voz e devolve o id" do
      request = stub_request(:post, url)
        .with(body: { phone: "55119", audio: "https://x/a.ogg", viewOnce: false, waveform: true }.to_json)
        .to_return(json_reply({ messageId: "A1" }))

      expect(connector.send_audio_message("55119", "https://x/a.ogg")).to eq("A1")
      expect(request).to have_been_requested
    end

    it "devolve nil em falha" do
      stub_request(:post, url).to_return(status: 500, body: "boom")

      expect(connector.send_audio_message("55119", "https://x/a.ogg")).to be_nil
    end

    it "desconectado devolve nil" do
      connector.update!(status: :closed)

      expect(connector.send_audio_message("55119", "https://x/a.ogg")).to be_nil
    end
  end

  describe "contrato comum dos conectores" do
    it "#send_media_message escolhe pelo tipo e devolve o id" do
      stub_request(:post, "#{base}/send-image").with(body: hash_including("caption" => "Olha")).to_return(json_reply({ messageId: "I1" }))
      stub_request(:post, "#{base}/send-video").to_return(json_reply({ messageId: "V1" }))
      stub_request(:post, "#{base}/send-document/pdf").with(body: hash_including("fileName" => "a.pdf")).to_return(json_reply({ messageId: "D1" }))

      expect(connector.send_media_message("55119", media_dto("image", nil, caption: "Olha"))).to eq("I1")
      expect(connector.send_media_message("55119", media_dto("video", nil))).to eq("V1")
      expect(connector.send_media_message("55119", media_dto("document", "a.pdf"))).to eq("D1")
      expect(connector.send_media_message("55119", media_dto("file", "a.pdf"))).to eq("D1")
    end

    it "#send_media_message trata tipo desconhecido como imagem" do
      request = stub_request(:post, "#{base}/send-image").to_return(json_reply({ messageId: "I1" }))

      connector.send_media_message("55119", media_dto(nil, nil))

      expect(request).to have_been_requested
    end

    it "#send_audio_message_by_url torna absoluto o caminho guardado" do
      stub_request(:post, "#{base}/send-audio").to_return(json_reply({ messageId: "A1" }))

      expect(connector.send_audio_message_by_url("55119", "/rails/active_storage/blobs/proxy/abc/a.ogg")).to eq("A1")

      expect(a_request(:post, "#{base}/send-audio").with(body: hash_including("audio" => "https://api.vekoo.test/rails/active_storage/blobs/proxy/abc/a.ogg"))).to have_been_made
    end

    it "#mark_read_message marca como lida" do
      request = stub_request(:post, "#{base}/read-message").with(body: { phone: "55119", messageId: "M1" }.to_json).to_return(status: 204, body: "")

      expect(connector.mark_read_message("55119", "M1")).to be(true)
      expect(request).to have_been_requested
    end

    it "#mark_read_message devolve false em falha" do
      stub_request(:post, "#{base}/read-message").to_return(status: 500, body: "boom")

      expect(connector.mark_read_message("55119", "M1")).to be(false)
    end

    it "#send_presence atualiza a presença" do
      request = stub_request(:put, "#{base}/chat/updatePresence?number=55119")
        .with(body: { presence: "composing", delay: 1200 }.to_json)
        .to_return(json_reply({}))

      expect(connector.send_presence("55119", "composing")).to be(true)
      expect(request).to have_been_requested
    end

    it "#send_presence devolve false sem chamar a Z-API para presença que não existe" do
      expect(connector.send_presence("55119", "dançando")).to be(false)
      expect(a_request(:put, /updatePresence/)).not_to have_been_made
    end

    it "#send_presence devolve false em falha de rede" do
      stub_request(:put, /updatePresence/).to_timeout

      expect(connector.send_presence("55119", "composing")).to be(false)
    end

    it "#zapi_provider? é verdadeiro: a tela e o ConnectorsChannel usam isso" do
      expect(connector.zapi_provider?).to be(true)
    end

    it "#zapi_get_qr_code_image lê o QR code" do
      stub_request(:get, "#{base}/qr-code/image").to_return(json_reply({ value: "b64" }))

      expect(connector.zapi_get_qr_code_image).to eq("value" => "b64")
    end

    it "instância própria não tem assinatura, conversa para migrar nem reload" do
      expect(connector.sign_zapi_instance).to be_nil
      expect(connector.migrate_chats).to be_nil
      expect(connector.reload_instance).to be(true)
    end
  end

  describe "mídia recebida" do
    let(:media_url) { "https://z-api.exemplo.com/midia.bin" }

    it "#retrieve_media devolve os bytes" do
      stub_request(:get, media_url).to_return(status: 200, body: "BYTES")

      expect(connector.retrieve_media(media_url)).to eq("BYTES")
    end

    it "#retrieve_media devolve nil em erro HTTP ou de rede" do
      stub_request(:get, media_url).to_return({ status: 404, body: "" })
      expect(connector.retrieve_media(media_url)).to be_nil

      stub_request(:get, media_url).to_timeout
      expect(connector.retrieve_media(media_url)).to be_nil
    end

    it "#download_media grava em arquivo temporário e devolve o caminho" do
      stub_request(:get, media_url).to_return(status: 200, body: "BYTES")

      path = connector.download_media(media_url)

      expect(File.binread(path)).to eq("BYTES")
    ensure
      remove_file(path)
    end

    it "#download_media devolve nil sem conteúdo" do
      stub_request(:get, media_url).to_return(status: 404, body: "")

      expect(connector.download_media(media_url)).to be_nil
    end
  end
end
