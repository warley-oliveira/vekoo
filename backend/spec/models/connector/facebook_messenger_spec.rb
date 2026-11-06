require "rails_helper"

# Só o que é do Messenger. O envio e os tokens, que ele divide com o Instagram, estão em
# spec/models/concerns/meta_messaging_concern_spec.rb.
RSpec.describe Connector::FacebookMessenger do
  include ConnectorHelpers

  let(:organization) { create(:organization) }
  let(:connector) { described_class.create!(organization_id: organization.id) }
  let(:graph) { "https://graph.facebook.com/v22.0" }

  it "nasce no login pelo Facebook" do
    expect(described_class.new.auth_provider).to eq("facebook_login")
  end

  it "não troca um auth_provider já definido" do
    expect(described_class.new(auth_provider: "instagram_login").auth_provider).to eq("instagram_login")
  end

  it "gera o token de verificação do webhook ao nascer" do
    expect(connector.verification_token).to match(/\A[a-z0-9]{32}\z/)
  end

  describe "#instance_name" do
    it "usa o nome da página" do
      expect(described_class.new(page_name: "Loja da Ana").instance_name).to eq("Loja da Ana")
    end

    it "cai no id sem nome" do
      bare = described_class.new

      expect(bare.instance_name).to eq(bare.id.to_s)
    end
  end

  describe "#activate" do
    let(:oauth_url) { MetaApiClient::OAuth::FACEBOOK_OAUTH_URL }
    let(:pages_url) { "#{graph}/me/accounts" }
    let(:picture_url) { "#{graph}/PAGINA/picture" }
    let(:subscription_url) { "#{graph}/PAGINA/subscribed_apps" }

    around { |example| with_env("META_APP_ID" => "APP", "META_APP_SECRET" => "SEGREDO") { example.run } }

    def stub_oauth
      stub_request(:post, oauth_url)
        .with(body: { client_id: "APP", client_secret: "SEGREDO", code: "CODIGO", grant_type: "authorization_code" }.to_json)
        .to_return(json_reply({ access_token: "tok-usuario" }))
    end

    def stub_pages(*pages)
      stub_request(:get, pages_url).with(query: { access_token: "tok-usuario" }).to_return(json_reply({ data: pages }))
    end

    def stub_picture(reply = json_reply({ data: { url: "https://x/pagina.jpg" } }))
      stub_request(:get, picture_url).with(query: { redirect: "false", type: "large" }).to_return(reply)
    end

    def stub_subscription(reply = json_reply({ success: true }))
      stub_request(:post, subscription_url).with(query: hash_including("access_token" => "tok-pagina")).to_return(reply)
    end

    let(:page) { { id: "PAGINA", name: "Loja da Ana", access_token: "tok-pagina" } }

    it "troca o código, escolhe a página, assina o webhook e fica ativo" do
      stub_oauth
      stub_pages(page, { id: "OUTRA", name: "Outra", access_token: "tok-outra" })
      stub_picture
      stub_subscription

      connector.activate("CODIGO")

      expect(connector.reload).to have_attributes(
        status_cd: "active", page_id: "PAGINA", page_name: "Loja da Ana", page_access_token: "tok-pagina",
        profile_picture_url: "https://x/pagina.jpg", error_message: nil
      )
    end

    it "assina os eventos de mensagem" do
      stub_oauth
      stub_pages(page)
      stub_picture
      stub_subscription

      connector.activate("CODIGO")

      expect(a_request(:post, subscription_url).with(query: hash_including(
        "subscribed_fields" => "messages,messaging_postbacks,message_deliveries,message_reads"
      ))).to have_been_made
    end

    it "segue sem foto: ela não é essencial" do
      stub_oauth
      stub_pages(page)
      stub_picture(json_reply({ error: { message: "x" } }, status: 400))
      stub_subscription

      connector.activate("CODIGO")

      expect(connector.reload).to have_attributes(status_cd: "active", profile_picture_url: nil)
    end

    it "fica failed com a mensagem da Meta quando a troca do código falha" do
      stub_request(:post, oauth_url).to_return(json_reply({ error: { message: "código expirado" } }, status: 400))

      connector.activate("CODIGO")

      expect(connector.reload).to have_attributes(status_cd: "failed", error_message: "código expirado")
      expect(a_request(:get, pages_url).with(query: hash_including({}))).not_to have_been_made
    end

    it "fica failed quando a conta não tem página" do
      stub_oauth
      stub_pages

      connector.activate("CODIGO")

      expect(connector.reload).to have_attributes(status_cd: "failed", error_message: "No Facebook Pages found for this account")
    end

    it "fica failed com o motivo quando a assinatura do webhook falha" do
      stub_oauth
      stub_pages(page)
      stub_picture
      stub_subscription(json_reply({ error: { message: "sem permissão" } }, status: 403))

      connector.activate("CODIGO")

      expect(connector.reload).to have_attributes(status_cd: "failed", error_message: "Webhook subscription failed: sem permissão")
    end

    it "fica failed quando a rede cai no meio, sem levantar" do
      stub_oauth
      stub_request(:get, pages_url).with(query: hash_including({})).to_timeout

      expect { connector.activate("CODIGO") }.not_to raise_error

      expect(connector.reload).to be_failed
      expect(connector.reload.error_message).to be_present
    end

    it "não escreve token nem segredo no log" do
      stub_oauth
      stub_pages(page)
      stub_picture
      stub_subscription(json_reply({ error: { message: "sem permissão" } }, status: 403))

      log = captured_log { connector.activate("CODIGO") }

      expect(log).not_to include("tok-usuario", "tok-pagina", "SEGREDO")
    end
  end

  describe "#deactivate" do
    it "fica inativo" do
      connector.update!(status: :active)

      connector.deactivate

      expect(connector.reload).to be_inactive
    end
  end
end
