require "rails_helper"

RSpec.describe Connectors::Creator do
  let(:organization) { create(:organization) }

  def create_connector(**params)
    described_class.call(organization: organization, params: ActionController::Parameters.new(params))
  end

  describe "tipo" do
    it "levanta UnknownType com tipo desconhecido, sem criar nada" do
      expect { create_connector(connector_type: "telegram") }.to raise_error(described_class::UnknownType)
      expect(Connector::Base.where(organization_id: organization.id).count).to eq(0)
    end

    it "levanta UnknownType sem tipo" do
      expect { create_connector }.to raise_error(described_class::UnknownType)
    end
  end

  describe "whatsapp_cloud" do
    let(:params) { { connector_type: "whatsapp_cloud", phone_number_id: "123", waba_id: "456", business_id: "789", access_token: "token-colado" } }

    before { stub_cloud_activation(phone_number_id: 123, waba_id: 456) }

    it "cria na organização e ativa com o que a Meta devolve" do
      connector = create_connector(**params).connector

      expect(connector).to be_a(Connector::WhatsappCloud).and be_persisted
      expect(connector).to have_attributes(
        organization_id: organization.id,
        status: :active,
        phone_number_id: 123,
        waba_id: 456,
        business_id: 789,
        access_token: "token-colado",
        verified_name: "Clínica Vida",
        display_phone_number: "+55 31 3333-0000",
        quality_rating: "GREEN",
        fb_status: "CONNECTED"
      )
    end

    it "guarda os números da WABA e os detalhes de cada um" do
      connector = create_connector(**params).connector.reload

      expect(connector.phone_number_list.map { |phone| phone["id"] }).to eq([ "123" ])
      expect(connector.phone_number_details.dig("123", "about")).to eq("Atendimento em Belo Horizonte")
    end

    it "assina o app nos webhooks da WABA" do
      create_connector(**params)

      expect(a_request(:post, %r{graph\.facebook\.com/v24\.0/456/subscribed_apps})).to have_been_made
    end

    it "gera o token de verificação do webhook" do
      expect(create_connector(**params).connector.verification_token).to be_present
    end

    it "não traz Instagram junto" do
      expect(create_connector(**params).instagram).to be_nil
    end

    it "troca o código do OAuth por token, quando vem" do
      oauth = stub_cloud_oauth(access_token: "token-do-oauth")

      connector = create_connector(**params.except(:access_token), code: "codigo-1").connector

      expect(oauth).to have_been_requested
      expect(connector.reload.user_access_token).to eq("token-do-oauth")
      expect(connector.retrieve_current_token).to eq("token-do-oauth")
    end

    it "fica failed com o motivo quando a Meta recusa o número" do
      stub_cloud_phone_number_error(123, message: "Número não encontrado")

      connector = create_connector(**params).connector

      expect(connector).to be_persisted
      expect(connector).to have_attributes(status: :failed, error_message: "Número não encontrado")
    end

    it "registra o número pendente e relê a lista" do
      pending_number = cloud_phone_payload(123, status: "PENDING")
      connected_number = cloud_phone_payload(123, status: "CONNECTED")
      stub_request(:get, %r{v19\.0/456/phone_numbers\?}).to_return(
        provider_json({ data: [ pending_number ] }),
        provider_json({ data: [ connected_number ] })
      )
      register = stub_request(:post, "#{ConnectorProviderStubs::GRAPH_SDK}/123/register").to_return(provider_json({ success: true }))

      connector = create_connector(**params).connector.reload

      expect(register).to have_been_requested
      expect(connector.phone_number_list.first["status"]).to eq("CONNECTED")
    end
  end

  describe "whatsapp_web" do
    before { stub_evolution_create }

    it "cria na Evolution por padrão e fica pendente, esperando o QR Code" do
      connector = create_connector(connector_type: "whatsapp_web").connector

      expect(connector).to be_a(Connector::WhatsappWeb).and be_persisted
      expect(connector).to have_attributes(
        provider_api: "evolution_api",
        status: :pending,
        instance_name: "IWA-#{connector.id}",
        instance_api_key: "chave-da-instancia",
        base_url: Connector::WhatsappWeb.default_base_url("evolution_api")
      )
    end

    it "manda o webhook de entrada na criação da instância" do
      connector = create_connector(connector_type: "whatsapp_web").connector

      expect(a_request(:post, evolution_url("/instance/create")).with { |request|
        body = JSON.parse(request.body)
        body.dig("webhook", "url") == connector.inbound_url(:evolution, "IWA-#{connector.id}") &&
          body["instanceName"] == "IWA-#{connector.id}" &&
          !body.key?("number")
      }).to have_been_made
    end

    it "pede o código de pareamento quando vem o telefone" do
      create_connector(connector_type: "whatsapp_web", phone_number_pairing: "5531971810932")

      expect(a_request(:post, evolution_url("/instance/create")).with { |request|
        JSON.parse(request.body)["number"] == "5531971810932"
      }).to have_been_made
    end

    it "guarda o QR Code para a tela e transmite no stream do conector" do
      connector = create_connector(connector_type: "whatsapp_web").connector

      expect(Rails.cache.read("qrcode.base64.#{connector.id}")).to eq("QR-EM-BASE64")

      broadcasts = ActionCable.server.pubsub.broadcasts(connector.stream_name).map { |message| JSON.parse(message) }
      expect(broadcasts).to include(a_hash_including("status" => "qr_updated", "base64" => "QR-EM-BASE64"))
    end

    it "aceita o formato antigo da chave da instância" do
      stub_request(:post, evolution_url("/instance/create"))
        .to_return(provider_json({ hash: { apikey: "chave-antiga" }, qrcode: { base64: "QR" } }, status: 201))

      expect(create_connector(connector_type: "whatsapp_web").connector.instance_api_key).to eq("chave-antiga")
    end

    it "roda o plano padrão da tela de escolha (aiva_api) sobre a Evolution" do
      connector = create_connector(connector_type: "whatsapp_web", provider_api: "aiva_api").connector

      expect(connector.provider_api).to eq("evolution_api")
      expect(a_request(:post, evolution_url("/instance/create"))).to have_been_made
    end

    it "respeita a escolha explícita da Evolution" do
      connector = create_connector(connector_type: "whatsapp_web", provider_api: "evolution_api").connector

      expect(connector.provider_api).to eq("evolution_api")
    end

    it "recusa provider desconhecido, sem criar nem chamar ninguém" do
      expect { create_connector(connector_type: "whatsapp_web", provider_api: "provedor_novo") }.to raise_error(Mongoid::Errors::Validations)
      expect(Connector::WhatsappWeb.where(organization_id: organization.id).count).to eq(0)
    end

    it "propaga a falha da Evolution, sem marcar como pendente" do
      stub_request(:post, evolution_url("/instance/create")).to_return(provider_json({ message: "erro" }, status: 500))

      expect { create_connector(connector_type: "whatsapp_web") }.to raise_error(/Failed to create instance/)
      expect(Connector::WhatsappWeb.where(organization_id: organization.id).take.status).to eq(:inactive)
    end

    context "com a flag zapi na organização" do
      before { organization.update!(features: { "zapi" => true }) }

      it "usa a Z-API quando a tela não escolheu" do
        stub_zapi_on_demand

        connector = with_env("ZAPI_ACCOUNT_TOKEN" => "conta-integradora") do
          create_connector(connector_type: "whatsapp_web").connector
        end

        expect(connector.provider_api).to eq("zapi")
      end

      # A escolha da tela manda: a flag só vale para quem não escolheu.
      it "não passa por cima da escolha explícita" do
        connector = create_connector(connector_type: "whatsapp_web", provider_api: "aiva_api").connector

        expect(connector.provider_api).to eq("evolution_api")
      end
    end

    describe "provider zapi" do
      around { |example| with_env("ZAPI_ACCOUNT_TOKEN" => "conta-integradora") { example.run } }

      it "cria a instância sob demanda, com os webhooks de entrada, e fica pendente" do
        stub_zapi_on_demand(instance_id: "INST-NOVA", token: "TOKEN-NOVO")

        connector = create_connector(connector_type: "whatsapp_web", provider_api: "zapi").connector

        expect(connector).to have_attributes(
          provider_api: "zapi",
          status: :pending,
          zapi_instance_id: "INST-NOVA",
          zapi_token: "TOKEN-NOVO"
        )
        expect(a_request(:post, "#{ConnectorProviderStubs::ZAPI}/instances/integrator/on-demand").with { |request|
          body = JSON.parse(request.body)
          body["receivedCallbackUrl"] == connector.inbound_url(:zapi_message_received, connector.id) &&
            body["deliveryCallbackUrl"] == connector.inbound_url(:zapi_message_send, connector.id) &&
            body["disconnectedCallbackUrl"] == connector.inbound_url(:zapi_disconnected, connector.id) &&
            body["connectedCallbackUrl"] == connector.inbound_url(:zapi_connected, connector.id)
        }).to have_been_made
      end

      it "liga o aviso das mensagens enviadas pelo próprio aparelho" do
        stub = stub_zapi_on_demand(instance_id: "INST-NOVA", token: "TOKEN-NOVO")

        create_connector(connector_type: "whatsapp_web", provider_api: "zapi")

        expect(stub).to have_been_requested
      end

      it "propaga a falha da Z-API" do
        stub_request(:post, "#{ConnectorProviderStubs::ZAPI}/instances/integrator/on-demand")
          .to_return(provider_json({ error: "sem saldo" }, status: 402))

        expect { create_connector(connector_type: "whatsapp_web", provider_api: "zapi") }.to raise_error(ZapiClient::Error)
      end
    end

    it "precisa da conta integradora para o provider zapi" do
      with_env("ZAPI_ACCOUNT_TOKEN" => nil) do
        expect { create_connector(connector_type: "whatsapp_web", provider_api: "zapi") }
          .to raise_error(ZapiClient::Error, /account token is required/)
      end
    end
  end

  describe "zapi" do
    let(:params) { { connector_type: "zapi", instance_id: "ZINST", token: "ZTOKEN", account_token: "ZCLIENT" } }

    before { stub_zapi_webhooks("ZINST", "ZTOKEN") }

    it "cria, configura os webhooks e fica pendente" do
      connector = create_connector(**params).connector

      expect(connector).to be_a(Connector::Zapi).and be_persisted
      expect(connector).to have_attributes(status: :pending, instance_id: "ZINST", token: "ZTOKEN", account_token: "ZCLIENT")

      %w[update-webhook-received update-webhook-received-delivery update-webhook-send update-webhook-disconnected update-webhook-connected].each do |endpoint|
        expect(a_request(:put, "#{ConnectorProviderStubs::ZAPI}/instances/ZINST/token/ZTOKEN/#{endpoint}")
          .with(headers: { "Client-Token" => "ZCLIENT" })).to have_been_made
      end
    end

    it "aponta os webhooks para a entrada deste backend" do
      connector = create_connector(**params).connector

      expect(a_request(:put, "#{ConnectorProviderStubs::ZAPI}/instances/ZINST/token/ZTOKEN/update-webhook-connected")
        .with(body: { value: connector.inbound_url(:zapi_connected, connector.id) }.to_json)).to have_been_made
    end

    it "não trava se um webhook falhar" do
      stub_request(:put, "#{ConnectorProviderStubs::ZAPI}/instances/ZINST/token/ZTOKEN/update-webhook-send")
        .to_return(provider_json({ error: "x" }, status: 500))

      expect(create_connector(**params).connector.status).to eq(:pending)
    end

    it "exige a instância" do
      expect { create_connector(**params.except(:instance_id)) }.to raise_error(Mongoid::Errors::Validations)
      expect(Connector::Zapi.where(organization_id: organization.id).count).to eq(0)
    end

    it "exige o token" do
      expect { create_connector(**params.except(:token)) }.to raise_error(Mongoid::Errors::Validations)
    end
  end

  describe "lead_chat" do
    let(:params) { { connector_type: "lead_chat", phone_number_id: "5531", access_token: "lead-token" } }

    it "cria, assina o webhook e fica ativo" do
      stub_lead_chat_subscription(id: "sub-1")

      connector = create_connector(**params).connector

      expect(connector).to be_a(Connector::LeadChat).and be_persisted
      expect(connector).to have_attributes(status: :active, phone_number_id: 5531, external_subscription_id: "sub-1", access_token: "lead-token")
      expect(connector.verification_token).to be_present
      expect(a_request(:post, ConnectorProviderStubs::LEAD_CHAT_SUBSCRIPTIONS)
        .with(headers: { "Authorization" => "Bearer lead-token" }, body: hash_including("url" => connector.webhook_url))).to have_been_made
    end

    it "fica failed quando a LeadChat recusa" do
      stub_lead_chat_subscription_error

      connector = create_connector(**params).connector

      expect(connector).to be_persisted
      expect(connector.status).to eq(:failed)
    end
  end

  describe "meta_channels" do
    let(:params) { { connector_type: "meta_channels", code: "codigo-1" } }

    context "com conta do Instagram ligada à página" do
      before { stub_meta_channels(page_id: "9900", instagram_id: "1784") }

      it "cria o Messenger ativo, com os dados da página" do
        messenger = create_connector(**params).connector

        expect(messenger).to be_a(Connector::FacebookMessenger).and be_persisted
        expect(messenger).to have_attributes(
          status: :active,
          auth_provider: "facebook_login",
          page_id: "9900",
          page_name: "Loja da Ana",
          page_access_token: "page-token-da-meta",
          profile_picture_url: "https://cdn.exemplo.com/pagina.jpg"
        )
      end

      it "cria também o Instagram ativo, com o perfil" do
        instagram = create_connector(**params).instagram

        expect(instagram).to be_a(Connector::InstagramDirect).and be_persisted
        expect(instagram).to have_attributes(
          status: :active,
          auth_provider: "facebook_login",
          page_id: "9900",
          instagram_account_id: "1784",
          instagram_username: "lojadaana",
          followers_count: 1200,
          organization_id: organization.id
        )
      end

      it "liga um ao outro" do
        result = create_connector(**params)

        expect(result.instagram.linked_messenger_connector_id).to eq(result.connector.id.to_s)
        expect(result.connector.reload.linked_instagram_connector_id).to eq(result.instagram.id.to_s)
      end
    end

    it "cria só o Messenger quando a página não tem Instagram" do
      stub_meta_channels(page_id: "9900", instagram_id: nil)

      result = create_connector(**params)

      expect(result.connector.status).to eq(:active)
      expect(result.instagram).to be_nil
      expect(Connector::InstagramDirect.where(organization_id: organization.id).count).to eq(0)
    end

    it "fica failed quando a troca do código falha, sem procurar Instagram" do
      stub_request(:post, "#{ConnectorProviderStubs::GRAPH_FACEBOOK}/oauth/access_token").to_return(meta_error("Código expirado"))

      result = create_connector(**params)

      expect(result.connector).to have_attributes(status: :failed, error_message: "Código expirado")
      expect(result.instagram).to be_nil
    end

    it "fica failed quando a conta não tem página" do
      stub_facebook_oauth
      stub_facebook_pages([])

      expect(create_connector(**params).connector).to have_attributes(status: :failed, error_message: "No Facebook Pages found for this account")
    end

    it "fica failed quando não consegue assinar os webhooks da página" do
      stub_facebook_oauth
      stub_facebook_pages([ { id: "9900", name: "Loja da Ana", access_token: "page-token" } ])
      stub_page_picture("9900")
      stub_page_subscription("9900", success: false)

      connector = create_connector(**params).connector

      expect(connector.status).to eq(:failed)
      expect(connector.error_message).to include("Webhook subscription failed")
    end

    it "não devolve o Instagram que falhou ao ativar" do
      stub_meta_channels(page_id: "9900", instagram_id: "1784")
      # A segunda consulta, feita já pelo Instagram, não acha mais a conta.
      stub_request(:get, "#{ConnectorProviderStubs::GRAPH_FACEBOOK}/9900")
        .with(query: hash_including(fields: "instagram_business_account"))
        .to_return(provider_json({ instagram_business_account: { id: "1784" } }), provider_json({ id: "9900" }))

      result = create_connector(**params)

      expect(result.instagram).to be_nil
      failed = Connector::InstagramDirect.where(organization_id: organization.id).take
      expect(failed).to have_attributes(status: :failed, error_message: "No Instagram Business Account linked to this Facebook Page")
    end
  end

  describe "instagram_direct" do
    let(:params) { { connector_type: "instagram_direct", code: "codigo-1#_", redirect_uri: "https://app.vekoo.app/callback" } }

    it "troca o código, guarda o token longo e assina os webhooks" do
      stub_instagram_login

      connector = create_connector(**params).connector

      expect(connector).to be_a(Connector::InstagramDirect).and be_persisted
      expect(connector).to have_attributes(
        status: :active,
        auth_provider: "instagram_login",
        instagram_user_access_token: "ig-longo"
      )
      expect(connector.instagram_token_expires_at).to be_within(1.minute).of(60.days.from_now)
      expect(a_request(:post, "#{ConnectorProviderStubs::GRAPH_INSTAGRAM}/me/subscribed_apps").with(query: hash_including("subscribed_fields" => "messages"))).to have_been_made
    end

    # O `user_id` do /me é o id profissional, o mesmo que chega nos webhooks: é por ele que
    # a mensagem recebida acha o conector.
    it "guarda o id da conta profissional que vem em user_id" do
      stub_instagram_login

      expect(create_connector(**params).connector.instagram_account_id).to eq("178414")
    end

    it "guarda o perfil" do
      stub_instagram_login

      expect(create_connector(**params).connector).to have_attributes(
        instagram_username: "lojadaana",
        account_name: "Loja da Ana",
        biography: "Roupas feitas à mão",
        followers_count: 1200,
        follows_count: 300,
        media_count: 87,
        website: "https://lojadaana.com.br",
        account_type: "BUSINESS"
      )
    end

    it "tira o sufixo que o Instagram põe no código e manda o redirect_uri" do
      stub_instagram_login

      create_connector(**params)

      expect(a_request(:post, "https://api.instagram.com/oauth/access_token").with { |request|
        form = Rack::Utils.parse_nested_query(request.body)
        form["code"] == "codigo-1" && form["redirect_uri"] == "https://app.vekoo.app/callback"
      }).to have_been_made
    end

    it "fica failed com o motivo quando a troca do código falha" do
      stub_request(:post, "https://api.instagram.com/oauth/access_token")
        .to_return(provider_json({ error_message: "Código expirado" }, status: 400))

      connector = create_connector(**params).connector

      expect(connector).to be_persisted
      expect(connector).to have_attributes(status: :failed, error_message: "Código expirado")
    end

    it "fica failed quando a rede cai no meio" do
      stub_instagram_oauth
      stub_request(:get, "#{ConnectorProviderStubs::GRAPH_INSTAGRAM}/me").with(query: hash_including({})).to_timeout

      connector = create_connector(**params).connector

      expect(connector.status).to eq(:failed)
      expect(connector.error_message).to be_present
    end

    it "não cria Instagram ligado" do
      stub_instagram_login

      expect(create_connector(**params).instagram).to be_nil
    end
  end

  describe "web_widget" do
    it "nasce desligado, com credenciais, sem chamar ninguém" do
      connector = create_connector(connector_type: "web_widget").connector

      expect(connector).to be_a(Connector::WebWidget).and be_persisted
      expect(connector.status).to eq(:inactive)
      expect(connector.public_token).to start_with("pk_widget_")
      expect(connector.signing_secret).to be_present
    end
  end
end
