require "rails_helper"

RSpec.describe MetaApiClient do
  subject(:client) { described_class.new(token: "tok", endpoint_id: "page-1") }

  let(:messages_url) { "#{described_class::FACEBOOK_GRAPH_URL}/page-1/messages" }

  describe "#send_text" do
    it "envia pelo Bearer e devolve a resposta" do
      stub = stub_request(:post, messages_url)
        .with(
          headers: { "Authorization" => "Bearer tok" },
          body: { recipient: { id: "psid" }, messaging_type: "RESPONSE", message: { text: "oi" } }.to_json
        )
        .to_return(status: 200, body: { message_id: "mid.1" }.to_json, headers: { "Content-Type" => "application/json" })

      response = client.send_text("psid", "oi")

      expect(stub).to have_been_requested
      expect(response.parsed_response["message_id"]).to eq("mid.1")
    end

    it "não levanta quando a Meta recusa: quem chama decide pelo status" do
      stub_request(:post, messages_url)
        .to_return(status: 400, body: { error: { message: "nope" } }.to_json, headers: { "Content-Type" => "application/json" })

      expect(client.send_text("psid", "oi")).not_to be_success
    end
  end

  describe "#send_media" do
    it "manda o anexo reaproveitável pela URL" do
      stub = stub_request(:post, messages_url)
        .with(body: hash_including("message" => { "attachment" => { "type" => "image", "payload" => { "url" => "https://x/y.jpg", "is_reusable" => true } } }))
        .to_return(status: 200, body: "{}", headers: { "Content-Type" => "application/json" })

      client.send_media("psid", "image", "https://x/y.jpg")

      expect(stub).to have_been_requested
    end
  end

  describe "#download_media" do
    it "grava o corpo em arquivo temporário e devolve o caminho" do
      stub_request(:get, "https://cdn.exemplo.com/foto.jpg").to_return(status: 200, body: "bytes")

      path = client.download_media("https://cdn.exemplo.com/foto.jpg")

      expect(File.binread(path)).to eq("bytes")
    ensure
      File.delete(path) if path && File.exist?(path)
    end

    it "devolve nil em erro HTTP" do
      stub_request(:get, "https://cdn.exemplo.com/foto.jpg").to_return(status: 404, body: "")

      expect(client.download_media("https://cdn.exemplo.com/foto.jpg")).to be_nil
    end
  end

  describe MetaApiClient::Graph do
    it "pega a primeira página da conta" do
      stub_request(:get, "#{described_class::FACEBOOK_GRAPH_URL}/me/accounts")
        .with(query: { access_token: "user" })
        .to_return(status: 200, body: { data: [ { id: "p1", name: "Loja" }, { id: "p2" } ] }.to_json, headers: { "Content-Type" => "application/json" })

      expect(described_class.fetch_page_info("user")).to eq("id" => "p1", "name" => "Loja")
    end

    it "resolve a conta do Instagram ligada à página" do
      stub_request(:get, "#{described_class::FACEBOOK_GRAPH_URL}/p1")
        .with(query: { fields: "instagram_business_account", access_token: "tok" })
        .to_return(status: 200, body: { instagram_business_account: { id: "ig1" } }.to_json, headers: { "Content-Type" => "application/json" })

      expect(described_class.fetch_instagram_account_for_page("p1", "tok")).to eq("ig1")
    end

    it "pede user_id no /me: é o id que os webhooks usam" do
      stub = stub_request(:get, "#{described_class::INSTAGRAM_GRAPH_URL}/me")
        .with(query: hash_including("fields" => a_string_including("user_id")))
        .to_return(status: 200, body: { user_id: "17841" }.to_json, headers: { "Content-Type" => "application/json" })

      expect(described_class.fetch_instagram_me("tok")).to eq("user_id" => "17841")
      expect(stub).to have_been_requested
    end

    it "traduz erro de inscrição de webhook" do
      stub_request(:post, "#{described_class::FACEBOOK_GRAPH_URL}/p1/subscribed_apps")
        .with(query: hash_including("access_token" => "tok"))
        .to_return(status: 400, body: { error: { message: "sem permissão" } }.to_json, headers: { "Content-Type" => "application/json" })

      expect(described_class.subscribe_page_webhooks("p1", "tok")).to eq(success: false, error: "sem permissão")
    end
  end

  describe MetaApiClient::OAuth do
    it "troca o código do Facebook pelo token" do
      stub_request(:post, described_class::FACEBOOK_OAUTH_URL)
        .to_return(status: 200, body: { access_token: "page-token" }.to_json, headers: { "Content-Type" => "application/json" })

      expect(described_class.exchange_facebook_code(code: "c", app_id: "a", app_secret: "s"))
        .to eq(success: true, access_token: "page-token")
    end

    it "limpa o sufixo #_ do código e troca pelo token de longa duração, mantendo o user_id da Meta" do
      short = stub_request(:post, described_class::INSTAGRAM_OAUTH_URL)
        .with(body: hash_including("code" => "abc"))
        .to_return(status: 200, body: { access_token: "short", user_id: 42 }.to_json, headers: { "Content-Type" => "application/json" })
      stub_request(:get, "#{described_class::INSTAGRAM_GRAPH_URL}/access_token")
        .with(query: hash_including("grant_type" => "ig_exchange_token", "access_token" => "short"))
        .to_return(status: 200, body: { access_token: "long", expires_in: 3600 }.to_json, headers: { "Content-Type" => "application/json" })

      result = described_class.exchange_instagram_code(code: "abc#_", redirect_uri: "https://r", app_id: "a", app_secret: "s")

      expect(short).to have_been_requested
      expect(result).to include(success: true, access_token: "long", user_id: "42")
      expect(result[:expires_at]).to be_within(5.seconds).of(1.hour.from_now)
    end

    it "renova o token do Instagram" do
      stub_request(:get, "#{described_class::INSTAGRAM_GRAPH_URL}/refresh_access_token")
        .with(query: { grant_type: "ig_refresh_token", access_token: "old" })
        .to_return(status: 200, body: { access_token: "new", expires_in: 60 }.to_json, headers: { "Content-Type" => "application/json" })

      expect(described_class.refresh_instagram_token("old")).to include(success: true, access_token: "new")
    end
  end
end
