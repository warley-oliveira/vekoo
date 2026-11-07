require "rails_helper"

RSpec.describe Connector::LeadChat do
  before { stub_every_host_as_public }

  include ConnectorHelpers

  let(:organization) { create(:organization) }
  let(:connector) { create(:connector_lead_chat, organization: organization, access_token: "lead-token", phone_number_id: 5531) }
  let(:api) { LeadChatApi::Config::API_BASE_URL }
  let(:chat) { create(:chat, connector: connector, external_fields: { "session_id" => "S1" }) }
  let(:session_url) { "#{api}/chat/v1/session/S1/message/sync" }

  around { |example| with_env("BACKEND_URL" => "https://api.vekoo.test") { example.run } }

  it "gera o token de verificação do webhook ao nascer" do
    expect(connector.verification_token).to match(/\A[a-z0-9]{32}\z/)
  end

  describe "tokens em repouso" do
    it "guarda só o texto cifrado no Mongo" do
      raw = stored_document(connector)

      expect(raw.to_json).not_to include("lead-token")
      expect(raw.keys).to include("access_token_ciphertext")
      expect(raw.keys).not_to include("access_token")
    end

    it "devolve o valor original ao ler do banco" do
      expect(Connector::Base.find(connector.id).access_token).to eq("lead-token")
    end

    it "não escreve a chave no log, nem em erro" do
      stub_request(:post, "#{api}/core/v1/webhook/subscription").to_return(status: 401, body: { error: { code: 401, message: "chave inválida" } }.to_json)
      stub_request(:post, session_url).to_return(status: 200, body: { id: "L1" }.to_json)

      log = captured_log do
        connector.activate
        connector.send_text_message("x", "oi", chat)
      end

      expect(log).to include("chave inválida")
      expect(log).not_to include("lead-token")
    end
  end

  describe "#instance_name" do
    it "usa o número do canal" do
      expect(described_class.new(phone_number_id: 5531).instance_name).to eq("LeadChat 5531")
    end

    it "cai no id do conector" do
      bare = described_class.new

      expect(bare.instance_name).to eq("LeadChat #{bare.id}")
    end
  end

  describe "#webhook_url" do
    it "aponta para o evento de entrada deste conector" do
      expect(connector.webhook_url).to eq("https://api.vekoo.test/inbound/lead-chat/#{connector.id}/event?token=#{connector.inbound_token}")
    end

    it "é uma rota que existe" do
      expect(Rails.application.routes.recognize_path(URI(connector.webhook_url).path, method: :post)).to include(controller: "inbound/lead_chat", action: "event")
    end
  end

  describe "#activate" do
    let(:connector) { create(:connector_lead_chat, organization: organization, access_token: "lead-token", status: :inactive) }
    let(:subscription_url) { "#{api}/core/v1/webhook/subscription" }

    it "assina os dois tópicos, guarda o id da assinatura e fica ativo" do
      request = stub_request(:post, subscription_url)
        .with(
          headers: { "Authorization" => "Bearer lead-token" },
          body: { name: "Vekoo", url: connector.webhook_url, topics: %w[MESSAGE_RECEIVED MESSAGE_SENT] }.to_json
        )
        .to_return(status: 200, body: { id: "SUB-1" }.to_json)

      connector.activate

      expect(request).to have_been_requested
      expect(connector.reload).to have_attributes(external_subscription_id: "SUB-1", status_cd: "active")
    end

    it "fica failed quando o LeadChat recusa" do
      stub_request(:post, subscription_url).to_return(status: 401, body: { error: { code: 401, message: "chave inválida" } }.to_json)

      connector.activate

      expect(connector.reload).to have_attributes(status_cd: "failed", external_subscription_id: nil)
    end

    it "fica failed quando o LeadChat não responde, sem levantar" do
      stub_request(:post, subscription_url).to_raise(Faraday::TimeoutError)

      expect { connector.activate }.not_to raise_error

      expect(connector.reload).to have_attributes(status_cd: "failed", external_subscription_id: nil)
    end
  end

  describe "#send_text_message" do
    it "manda para a sessão da conversa e devolve o id como texto" do
      request = stub_request(:post, session_url)
        .with(headers: { "Authorization" => "Bearer lead-token" }, body: { text: "oi" }.to_json)
        .to_return(status: 200, body: { id: "L1" }.to_json)

      expect(connector.send_text_message("ignorado", "oi", chat)).to eq("L1")
      expect(request).to have_been_requested
    end

    it "converte id numérico em texto" do
      stub_request(:post, session_url).to_return(status: 200, body: { id: 123 }.to_json)

      expect(connector.send_text_message("x", "oi", chat)).to eq("123")
    end

    it "devolve nil quando a resposta não traz id" do
      stub_request(:post, session_url).to_return(status: 200, body: {}.to_json)

      expect(connector.send_text_message("x", "oi", chat)).to be_nil
    end

    it "devolve nil em timeout: o envio de 2 segundos não derruba quem chamou" do
      stub_request(:post, session_url).to_raise(Faraday::TimeoutError)

      expect(connector.send_text_message("x", "oi", chat)).to be_nil
    end

    it "devolve nil sem conversa: sem ela não há sessão para onde mandar" do
      expect(connector.send_text_message("x", "oi")).to be_nil
      expect(a_request(:post, /message\/sync/)).not_to have_been_made
    end
  end

  describe "#send_media_message" do
    it "manda a URL do arquivo para a sessão" do
      request = stub_request(:post, session_url)
        .with(body: { fileUrl: "https://cdn.exemplo.com/foto.jpg" }.to_json)
        .to_return(status: 200, body: { id: "L2" }.to_json)

      response = connector.send_media_message("x", media_dto, chat)

      expect(request).to have_been_requested
      expect(Connectors::ExternalId.from(response)).to eq("L2")
    end

    it "não chama nada sem URL ou sem DTO" do
      expect(connector.send_media_message("x", media_dto(url: nil), chat)).to be_nil
      expect(connector.send_media_message("x", nil, chat)).to be_nil
      expect(a_request(:post, /message\/sync/)).not_to have_been_made
    end
  end

  describe "#send_audio_message_by_url" do
    it "manda o caminho guardado como URL absoluta" do
      request = stub_request(:post, session_url)
        .with(body: { fileUrl: "https://api.vekoo.test/rails/active_storage/blobs/proxy/abc/a.ogg" }.to_json)
        .to_return(status: 200, body: { id: "L3" }.to_json)

      response = connector.send_audio_message_by_url("x", "/rails/active_storage/blobs/proxy/abc/a.ogg", chat)

      expect(request).to have_been_requested
      expect(Connectors::ExternalId.from(response)).to eq("L3")
    end

    it "não chama nada sem URL" do
      expect(connector.send_audio_message_by_url("x", "", chat)).to be_nil
      expect(a_request(:post, /message\/sync/)).not_to have_been_made
    end
  end

  describe "o que o LeadChat não tem" do
    it "leitura, presença e reload não fazem nada" do
      expect(connector.mark_read_message("x", "y")).to be(true)
      expect(connector.send_presence("x", "composing")).to be(true)
      expect(connector.reload_instance).to be(true)
    end

    it "template não existe aqui" do
      expect { connector.send_template_message("x", "y") }.to raise_error("Not implemented")
    end
  end

  describe "#retrieve_audio_message" do
    it "baixa para um arquivo temporário e devolve o caminho" do
      stub_request(:get, "https://arquivos.leadchat.app/a.mp3").to_return(status: 200, body: "MP3")

      path = connector.retrieve_audio_message("https://arquivos.leadchat.app/a.mp3")

      expect(File.binread(path)).to eq("MP3")
      expect(path.to_s).to end_with(".mp3")
    ensure
      remove_file(path)
    end

    it "levanta em vez de guardar a página de erro como se fosse o áudio" do
      stub_request(:get, "https://arquivos.leadchat.app/a.mp3").to_return(status: 404, body: "<html>não achei</html>")

      expect { connector.retrieve_audio_message("https://arquivos.leadchat.app/a.mp3") }.to raise_error(/LeadChat audio download failed \(HTTP 404\)/)
    end
  end

  describe "#logout_instance" do
    let(:delete_url) { "#{api}/core/v1/webhook/subscription/SUB-1" }

    it "cancela a assinatura e fecha" do
      connector.update!(external_subscription_id: "SUB-1")
      request = stub_request(:delete, delete_url).to_return(status: 200, body: {}.to_json)

      connector.logout_instance

      expect(request).to have_been_requested
      expect(connector.reload).to have_attributes(status_cd: "closed", external_subscription_id: nil)
    end

    it "só fecha quando não há assinatura" do
      connector.logout_instance

      expect(connector.reload).to be_closed
      expect(a_request(:delete, /webhook\/subscription/)).not_to have_been_made
    end

    it "levanta e não fecha quando o LeadChat recusa o cancelamento" do
      connector.update!(external_subscription_id: "SUB-1")
      stub_request(:delete, delete_url).to_return(status: 500, body: "boom")

      expect { connector.logout_instance }.to raise_error(LeadChatApi::Error, /500/)
      expect(connector.reload).to have_attributes(status_cd: "active", external_subscription_id: "SUB-1")
    end
  end
end
