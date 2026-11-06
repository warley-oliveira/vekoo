require "rails_helper"

RSpec.describe Connector::InstagramDirect do
  include ConnectorHelpers

  let(:organization) { create(:organization) }
  let(:instagram_graph) { "https://graph.instagram.com/v22.0" }
  let(:facebook_graph) { "https://graph.facebook.com/v22.0" }
  let(:account_id) { "17841999999999999" }

  # A resposta do /me: `id` é por aplicativo; `user_id` é o id profissional, o mesmo que vem
  # nos webhooks.
  let(:full_profile) do
    {
      id: "id-do-app",
      user_id: account_id,
      username: "loja.da.ana",
      name: "Loja da Ana",
      profile_picture_url: "https://cdn.exemplo.com/avatar.jpg",
      biography: "Doces artesanais em Belo Horizonte.",
      followers_count: 12_345,
      follows_count: 678,
      media_count: 90,
      website: "https://lojadaana.com.br",
      account_type: "BUSINESS"
    }
  end

  def build_connector(attributes = {})
    described_class.new({
      organization_id: organization.id,
      status: :active,
      auth_provider: "instagram_login",
      instagram_user_access_token: "tok-abc",
      instagram_account_id: account_id
    }.merge(attributes))
  end

  def create_connector(attributes = {})
    build_connector(attributes).tap(&:save!)
  end

  def stub_me(body = full_profile, status: 200)
    stub_request(:get, "#{instagram_graph}/me").with(query: hash_including("access_token" => "tok-abc")).to_return(json_reply(body, status: status))
  end

  describe "campos de perfil" do
    it "guarda tudo que a tela de conta mostra" do
      connector = create_connector(biography: "bio", followers_count: 1, follows_count: 2, media_count: 3, website: "https://x.io", account_type: "CREATOR")

      expect(connector.reload).to have_attributes(biography: "bio", followers_count: 1, follows_count: 2, media_count: 3, website: "https://x.io", account_type: "CREATOR")
    end
  end

  describe "#instance_name" do
    it "prefere o @usuário" do
      expect(build_connector(instagram_username: "loja.da.ana", account_name: "Loja da Ana").instance_name).to eq("@loja.da.ana")
    end

    it "cai no nome da conta" do
      expect(build_connector(account_name: "Loja da Ana").instance_name).to eq("Loja da Ana")
    end

    it "depois no nome da página" do
      expect(build_connector(page_name: "Página da Ana").instance_name).to eq("Página da Ana")
    end

    it "por fim num rótulo estável com o id" do
      connector = build_connector

      expect(connector.instance_name).to eq("Instagram #{connector.id}")
    end
  end

  describe "#activate_via_instagram" do
    let(:connector) { create_connector(status: :inactive, auth_provider: nil, instagram_user_access_token: nil, instagram_account_id: nil) }
    let(:redirect_uri) { "https://app.vekoo.test/connectors/callback" }

    around do |example|
      with_env("INSTAGRAM_APP_ID" => "IG-APP", "INSTAGRAM_APP_SECRET" => "IG-SEGREDO") { example.run }
    end

    def stub_oauth
      stub_request(:post, "https://api.instagram.com/oauth/access_token").to_return(json_reply({ access_token: "curto", user_id: 42 }))
      stub_request(:get, "#{instagram_graph}/access_token")
        .with(query: hash_including("grant_type" => "ig_exchange_token", "access_token" => "curto", "client_secret" => "IG-SEGREDO"))
        .to_return(json_reply({ access_token: "tok-abc", expires_in: 5_184_000 }))
    end

    def stub_subscription(reply = json_reply({ success: true }))
      stub_request(:post, "#{instagram_graph}/me/subscribed_apps").with(query: hash_including({})).to_return(reply)
    end

    it "troca o código, guarda o token longo, lê a conta e fica ativo" do
      stub_oauth
      stub_me
      subscription = stub_subscription

      connector.activate_via_instagram(code: "CODIGO#_", redirect_uri: redirect_uri)

      connector.reload
      expect(connector).to have_attributes(
        status_cd: "active", auth_provider: "instagram_login", instagram_user_access_token: "tok-abc",
        instagram_username: "loja.da.ana", account_name: "Loja da Ana", followers_count: 12_345
      )
      expect(connector.instagram_token_expires_at).to be_within(1.minute).of(5_184_000.seconds.from_now)
      expect(subscription).to have_been_requested
    end

    it "guarda o user_id do /me: é o id que os webhooks trazem" do
      stub_oauth
      stub_me
      stub_subscription

      connector.activate_via_instagram(code: "CODIGO", redirect_uri: redirect_uri)

      expect(connector.reload.instagram_account_id).to eq(account_id)
    end

    it "assina as mensagens no Instagram, não no Facebook" do
      stub_oauth
      stub_me
      stub_subscription

      connector.activate_via_instagram(code: "CODIGO", redirect_uri: redirect_uri)

      expect(a_request(:post, "#{instagram_graph}/me/subscribed_apps").with(query: { subscribed_fields: "messages", access_token: "tok-abc" })).to have_been_made
    end

    it "fica failed com a mensagem quando a troca do código falha" do
      stub_request(:post, "https://api.instagram.com/oauth/access_token").to_return(json_reply({ error_message: "código expirado" }, status: 400))

      connector.activate_via_instagram(code: "CODIGO", redirect_uri: redirect_uri)

      expect(connector.reload).to have_attributes(status_cd: "failed", error_message: "código expirado")
      expect(a_request(:post, "#{instagram_graph}/me/subscribed_apps").with(query: hash_including({}))).not_to have_been_made
    end

    it "fica failed quando a rede cai no meio" do
      stub_request(:post, "https://api.instagram.com/oauth/access_token").to_timeout

      connector.activate_via_instagram(code: "CODIGO", redirect_uri: redirect_uri)

      expect(connector.reload).to be_failed
      expect(connector.reload.error_message).to be_present
    end

    it "segue ativo se a assinatura do webhook falhar: a pessoa vê o canal e pode tentar de novo" do
      stub_oauth
      stub_me
      stub_subscription(json_reply({ error: { message: "sem permissão" } }, status: 403))

      connector.activate_via_instagram(code: "CODIGO", redirect_uri: redirect_uri)

      expect(connector.reload).to be_active
    end

    it "não escreve token nem segredo no log" do
      stub_oauth
      stub_me
      stub_subscription(json_reply({ error: { message: "sem permissão" } }, status: 403))

      log = captured_log { connector.activate_via_instagram(code: "CODIGO", redirect_uri: redirect_uri) }

      expect(log).to include("Short-lived token obtained")
      expect(log).not_to include("curto", "tok-abc", "IG-SEGREDO")
    end

    it "#activate com código usa este caminho" do
      stub_oauth
      stub_me
      stub_subscription
      connector.update!(auth_provider: "instagram_login")

      connector.activate("CODIGO")

      expect(connector.reload).to be_active
    end
  end

  describe "#activate" do
    it "não faz nada no login pelo Facebook" do
      connector = create_connector(status: :inactive, auth_provider: "facebook_login")

      connector.activate("CODIGO")

      expect(connector.reload).to be_inactive
    end

    it "não faz nada sem código" do
      connector = create_connector(status: :inactive)

      connector.activate

      expect(connector.reload).to be_inactive
    end
  end

  describe "#activate_via_facebook" do
    let(:connector) { create_connector(status: :inactive, auth_provider: nil, instagram_user_access_token: nil, instagram_account_id: nil) }

    def stub_linked_account(reply = json_reply({ instagram_business_account: { id: account_id } }))
      stub_request(:get, "#{facebook_graph}/PAGINA").with(query: hash_including("fields" => "instagram_business_account", "access_token" => "tok-pagina")).to_return(reply)
    end

    def stub_profile(reply = json_reply(full_profile))
      stub_request(:get, "#{facebook_graph}/#{account_id}").with(query: hash_including("access_token" => "tok-pagina")).to_return(reply)
    end

    def stub_subscription(reply = json_reply({ success: true }))
      stub_request(:post, "#{facebook_graph}/me/subscribed_apps").with(query: hash_including("access_token" => "tok-pagina")).to_return(reply)
    end

    it "resolve a conta ligada à página, lê o perfil e fica ativo" do
      stub_linked_account
      stub_profile
      subscription = stub_subscription

      connector.activate_via_facebook(fb_page_id: "PAGINA", fb_page_token: "tok-pagina")

      expect(connector.reload).to have_attributes(
        status_cd: "active", auth_provider: "facebook_login", page_id: "PAGINA", page_access_token: "tok-pagina",
        instagram_account_id: account_id, instagram_username: "loja.da.ana", biography: "Doces artesanais em Belo Horizonte."
      )
      expect(subscription).to have_been_requested
    end

    it "fica failed quando a página não tem conta do Instagram" do
      stub_linked_account(json_reply({}))

      connector.activate_via_facebook(fb_page_id: "PAGINA", fb_page_token: "tok-pagina")

      expect(connector.reload).to have_attributes(status_cd: "failed", error_message: "No Instagram Business Account linked to this Facebook Page")
    end

    it "segue ativo sem perfil: ele só enriquece a tela" do
      stub_linked_account
      stub_profile(json_reply({ error: { message: "x" } }, status: 400))
      stub_subscription

      connector.activate_via_facebook(fb_page_id: "PAGINA", fb_page_token: "tok-pagina")

      expect(connector.reload).to have_attributes(status_cd: "active", instagram_username: nil)
    end

    it "fica failed quando a rede cai" do
      stub_request(:get, "#{facebook_graph}/PAGINA").with(query: hash_including({})).to_timeout

      connector.activate_via_facebook(fb_page_id: "PAGINA", fb_page_token: "tok-pagina")

      expect(connector.reload).to be_failed
    end
  end

  describe "#refresh_profile!" do
    context "no login pelo Instagram" do
      it "lê o /me e grava todos os campos" do
        connector = create_connector(instagram_account_id: nil)
        stub_me

        connector.refresh_profile!

        expect(connector.reload).to have_attributes(
          instagram_account_id: account_id,
          instagram_username: "loja.da.ana",
          account_name: "Loja da Ana",
          profile_picture_url: "https://cdn.exemplo.com/avatar.jpg",
          biography: "Doces artesanais em Belo Horizonte.",
          followers_count: 12_345,
          follows_count: 678,
          media_count: 90,
          website: "https://lojadaana.com.br",
          account_type: "BUSINESS"
        )
      end

      it "cai no perfil pelo id quando o /me não traz user_id" do
        connector = create_connector
        stub_me({ error: { message: "x" } }, status: 400)
        stub_request(:get, "#{instagram_graph}/#{account_id}").with(query: hash_including("access_token" => "tok-abc")).to_return(json_reply(full_profile))

        connector.refresh_profile!

        expect(connector.reload).to have_attributes(followers_count: 12_345, account_type: "BUSINESS", instagram_account_id: account_id)
      end

      it "levanta sem token" do
        connector = create_connector(instagram_user_access_token: nil)

        expect { connector.refresh_profile! }.to raise_error(/No Instagram user access token/)
      end

      it "devolve o próprio conector" do
        connector = create_connector
        stub_me

        expect(connector.refresh_profile!).to eq(connector)
      end
    end

    context "no login pelo Facebook" do
      let(:connector) { create_connector(auth_provider: "facebook_login", page_access_token: "tok-pagina", instagram_user_access_token: nil) }

      it "lê o perfil com o token da página" do
        stub_request(:get, "#{facebook_graph}/#{account_id}").with(query: hash_including("access_token" => "tok-pagina")).to_return(json_reply(full_profile))

        connector.refresh_profile!

        expect(connector.reload).to have_attributes(followers_count: 12_345, biography: "Doces artesanais em Belo Horizonte.")
      end

      it "levanta quando a Graph API não devolve nada" do
        stub_request(:get, "#{facebook_graph}/#{account_id}").with(query: hash_including({})).to_return(json_reply({ error: { message: "x" } }, status: 400))

        expect { connector.refresh_profile! }.to raise_error(/Failed to fetch Instagram profile/)
      end

      it "levanta sem token da página" do
        connector.page_access_token = nil

        expect { connector.refresh_profile! }.to raise_error(/No page access token/)
      end
    end

    it "levanta com auth_provider que não existe" do
      expect { build_connector(auth_provider: "outro").refresh_profile! }.to raise_error(/Unsupported auth_provider/)
    end
  end

  describe "#subscribe_to_webhooks" do
    let(:connector) { create_connector }
    let(:url) { "#{instagram_graph}/me/subscribed_apps" }

    it "assina e informa o sucesso" do
      stub_request(:post, url).with(query: { subscribed_fields: "messages", access_token: "tok-abc" }).to_return(json_reply({ success: true }))

      expect(connector.subscribe_to_webhooks).to eq(success: true)
    end

    it "aceita outros campos" do
      request = stub_request(:post, url).with(query: hash_including("subscribed_fields" => "comments")).to_return(json_reply({ success: true }))

      connector.subscribe_to_webhooks(fields: "comments")

      expect(request).to have_been_requested
    end

    it "devolve o erro da Meta" do
      stub_request(:post, url).with(query: hash_including({})).to_return(json_reply({ error: { message: "sem permissão" } }, status: 403))

      expect(connector.subscribe_to_webhooks).to eq(success: false, error: "sem permissão")
    end

    it "2xx sem success é falha" do
      stub_request(:post, url).with(query: hash_including({})).to_return(json_reply({ success: false }))

      expect(connector.subscribe_to_webhooks[:success]).to be(false)
    end

    it "levanta sem token" do
      connector.instagram_user_access_token = nil

      expect { connector.subscribe_to_webhooks }.to raise_error(/No access token available/)
    end
  end

  describe "#deactivate" do
    context "no login pelo Instagram" do
      let(:connector) { create_connector(instagram_token_expires_at: 1.day.from_now) }
      let!(:unsubscribe) { stub_request(:delete, "#{instagram_graph}/me/subscribed_apps").with(query: { access_token: "tok-abc" }).to_return(json_reply({ success: true })) }
      let!(:revoke) { stub_request(:delete, "#{instagram_graph}/me/permissions").with(query: { access_token: "tok-abc" }).to_return(json_reply({ success: true })) }

      it "cancela o webhook, revoga as permissões, apaga os tokens e fica inativo" do
        connector.deactivate

        expect(unsubscribe).to have_been_requested
        expect(revoke).to have_been_requested
        expect(connector.reload).to have_attributes(status_cd: "inactive", instagram_user_access_token: nil, page_access_token: nil, instagram_token_expires_at: nil)
      end

      it "apaga os tokens e fica inativo mesmo com a Meta recusando" do
        stub_request(:delete, "#{instagram_graph}/me/subscribed_apps").with(query: hash_including({})).to_return(json_reply({ error: { message: "limite" } }, status: 429))
        stub_request(:delete, "#{instagram_graph}/me/permissions").with(query: hash_including({})).to_return(json_reply({ error: { message: "expirado" } }, status: 401))

        connector.deactivate

        expect(connector.reload).to have_attributes(status_cd: "inactive", instagram_user_access_token: nil)
      end

      it "não guarda o token em lugar nenhum do documento depois" do
        connector.deactivate

        raw = stored_document(connector)
        expect(raw["instagram_user_access_token_ciphertext"]).to be_nil
        expect(raw["page_access_token_ciphertext"]).to be_nil
      end
    end

    context "no login pelo Facebook" do
      let(:connector) { create_connector(auth_provider: "facebook_login", page_id: "PAGINA", page_access_token: "tok-pagina", instagram_user_access_token: nil) }

      it "cancela o webhook da página e apaga os tokens, sem revogar permissões" do
        unsubscribe = stub_request(:delete, "#{facebook_graph}/PAGINA/subscribed_apps").with(query: { access_token: "tok-pagina" }).to_return(json_reply({ success: true }))

        connector.deactivate

        expect(unsubscribe).to have_been_requested
        expect(a_request(:delete, "#{instagram_graph}/me/permissions")).not_to have_been_made
        expect(connector.reload).to have_attributes(status_cd: "inactive", page_access_token: nil)
      end

      it "fica inativo mesmo com a Meta recusando" do
        stub_request(:delete, "#{facebook_graph}/PAGINA/subscribed_apps").with(query: hash_including({})).to_return(json_reply({ error: { message: "x" } }, status: 400))

        connector.deactivate

        expect(connector.reload).to be_inactive
      end

      it "não chama a Meta sem o id da página" do
        connector.update!(page_id: nil)

        connector.deactivate

        expect(connector.reload).to be_inactive
      end
    end

    it "sem token, não chama a Meta e só fica inativo" do
      connector = create_connector(instagram_user_access_token: nil)

      connector.deactivate

      expect(connector.reload).to be_inactive
    end
  end
end
