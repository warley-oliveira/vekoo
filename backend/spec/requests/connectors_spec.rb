require "rails_helper"

# A rota inteira: sessão de verdade, banco de verdade e provedores por WebMock. Os detalhes de
# cada provedor na criação ficam em spec/services/connectors/creator_spec.rb.
RSpec.describe "Connectors", type: :request do
  let(:organization) { create(:organization) }
  let(:owner) { create(:account, organization: organization) }
  let(:member) { create(:account, organization: organization, role: "member", access_role: create(:access_role, :member, organization: organization)) }
  let(:headers) { auth_headers(owner) }
  let(:zapi) { ConnectorProviderStubs::ZAPI }
  let(:graph_sdk) { ConnectorProviderStubs::GRAPH_SDK }
  let(:graph_facebook) { ConnectorProviderStubs::GRAPH_FACEBOOK }
  let(:graph_instagram) { ConnectorProviderStubs::GRAPH_INSTAGRAM }

  def request_as_json(verb, path, headers: {}, params: nil)
    public_send(verb, path, params: params, headers: headers, as: :json)
  end

  describe "acesso" do
    let(:connector) { create(:connector_whatsapp_cloud, organization: organization) }
    let(:foreign) { create(:connector_whatsapp_cloud, organization: create(:organization)) }

    # Listar e ver valem para qualquer conta da organização: o chat e as campanhas precisam
    # saber os canais. Todo o resto é configuração.
    settings_routes = [
      [ :patch, "" ],
      [ :post, "/activate" ],
      [ :post, "/reload" ],
      [ :post, "/shutdown" ],
      [ :post, "/pause" ],
      [ :post, "/disconnect" ],
      [ :get, "/business-profile" ],
      [ :patch, "/business-profile" ],
      [ :post, "/business-profile/picture" ],
      [ :get, "/phone-numbers" ],
      [ :post, "/phone-numbers/refresh" ],
      [ :get, "/instagram-profile" ]
    ]

    [ [ :get, "" ], *settings_routes ].each do |verb, suffix|
      describe "#{verb.upcase} /connectors/:id#{suffix}" do
        it "responde 401 sem sessão" do
          request_as_json(verb, "/connectors/#{connector.id}#{suffix}")

          expect(response).to have_http_status(:unauthorized)
          expect(json.dig("error", "code")).to eq("unauthorized")
        end

        it "responde 404 para conector de outra organização, sem tocar nele" do
          request_as_json(verb, "/connectors/#{foreign.id}#{suffix}", headers: headers)

          expect(response).to have_http_status(:not_found)
          expect(json.dig("error", "code")).to eq("notFound")
          expect(foreign.reload.status).to eq(:active)
        end

        it "responde 404 para conector que não existe" do
          request_as_json(verb, "/connectors/#{BSON::ObjectId.new}#{suffix}", headers: headers)

          expect(response).to have_http_status(:not_found)
        end

        it "responde 404 para id malformado" do
          request_as_json(verb, "/connectors/nao-e-um-id#{suffix}", headers: headers)

          expect(response).to have_http_status(:not_found)
        end
      end
    end

    settings_routes.each do |verb, suffix|
      it "#{verb.upcase} /connectors/:id#{suffix} responde 403 sem core_settings, sem tocar no conector" do
        request_as_json(verb, "/connectors/#{connector.id}#{suffix}", headers: auth_headers(member))

        expect(response).to have_http_status(:forbidden)
        expect(json.dig("error", "code")).to eq("forbidden")
        expect(connector.reload.status).to eq(:active)
      end
    end

    it "GET /connectors responde 401 sem sessão" do
      get "/connectors"

      expect(response).to have_http_status(:unauthorized)
    end

    it "POST /connectors responde 401 sem sessão" do
      post "/connectors", params: { connectorType: "web_widget" }, as: :json

      expect(response).to have_http_status(:unauthorized)
    end

    it "POST /connectors responde 403 sem core_settings, sem criar nada" do
      post "/connectors", params: { connectorType: "web_widget" }, headers: auth_headers(member), as: :json

      expect(response).to have_http_status(:forbidden)
      expect(Connector::Base.where(organization_id: organization.id).count).to eq(0)
    end

    it "conta sem grupo de permissões vale como membro" do
      account = create(:account, organization: organization, role: "member", access_role: nil)

      post "/connectors/#{connector.id}/pause", headers: auth_headers(account), as: :json

      expect(response).to have_http_status(:forbidden)
    end

    it "libera quem não é dono mas tem core_settings no grupo" do
      manager = create(:account, organization: organization, role: "member", access_role: create(:access_role, organization: organization))

      post "/connectors/#{connector.id}/pause", headers: auth_headers(manager), as: :json

      expect(response).to have_http_status(:ok)
      expect(connector.reload.status).to eq(:paused)
    end
  end

  describe "GET /connectors" do
    it "lista os canais da organização, do mais antigo para o mais novo" do
      older = create(:connector_whatsapp_web, organization: organization, created_at: 2.days.ago)
      newer = create(:connector_web_widget, organization: organization, created_at: 1.day.ago)
      create(:connector_zapi, organization: create(:organization))

      get "/connectors", headers: headers

      expect(response).to have_http_status(:ok)
      expect(json["connectors"].map { |connector| connector["id"] }).to eq([ older.id.to_s, newer.id.to_s ])
      expect(json["connectors"].map { |connector| connector["type"] }).to eq(%w[whatsapp_web web_widget])
    end

    it "vale para qualquer conta da organização" do
      create(:connector_web_widget, organization: organization)

      get "/connectors", headers: auth_headers(member)

      expect(response).to have_http_status(:ok)
      expect(json["connectors"].size).to eq(1)
    end

    it "pagina, trazendo até 100 por padrão" do
      3.times { create(:connector_web_widget, organization: organization) }

      get "/connectors", params: { perPage: 2, page: 2 }, headers: headers

      expect(json["connectors"].size).to eq(1)
      expect(json["meta"]).to include("page" => 2, "perPage" => 2, "total" => 3, "totalPages" => 2, "hasMore" => false)

      get "/connectors", headers: headers

      expect(json["meta"]).to include("perPage" => 100)
    end

    it "não passa de 100 por página" do
      get "/connectors", params: { perPage: 1000 }, headers: headers

      expect(json["meta"]).to include("perPage" => 100)
    end

    it "fica vazio sem canais" do
      get "/connectors", headers: headers

      expect(json["connectors"]).to eq([])
      expect(json["meta"]).to include("total" => 0)
    end
  end

  describe "GET /connectors/:id" do
    let(:connector) { create(:connector_whatsapp_web, organization: organization) }

    it "devolve o conector, sem extras" do
      get "/connectors/#{connector.id}", headers: headers

      expect(response).to have_http_status(:ok)
      expect(json["connector"]).to include("id" => connector.id.to_s, "type" => "whatsapp_web", "status" => "active", "active" => true)
      expect(json["extras"]).to eq({})
    end

    it "vale para qualquer conta da organização" do
      get "/connectors/#{connector.id}", headers: auth_headers(member)

      expect(response).to have_http_status(:ok)
    end

    it "traz o QR Code enquanto ele está guardado" do
      Rails.cache.write("qrcode.base64.#{connector.id}", "QR-EM-BASE64")

      get "/connectors/#{connector.id}", headers: headers

      expect(json["extras"]).to eq("qrCode" => "QR-EM-BASE64")
    end

    it "traz também o código de pareamento guardado" do
      Rails.cache.write("qrcode.base64.#{connector.id}", "QR-EM-BASE64")
      Rails.cache.write("pair_code.#{connector.id}", "WZYK8QTM")

      get "/connectors/#{connector.id}", headers: headers

      expect(json["extras"]).to eq("qrCode" => "QR-EM-BASE64", "pairCode" => "WZYK8QTM")
    end

    it "não entrega o código de pareamento a quem só atende" do
      Rails.cache.write("pair_code.#{connector.id}", "WZYK8QTM")

      get "/connectors/#{connector.id}", headers: auth_headers(member)

      expect(json["extras"]).to eq({})
    end
  end

  describe "POST /connectors" do
    def create_connector(**params)
      post "/connectors", params: params, headers: headers, as: :json
    end

    describe "tipo" do
      it "responde 422 com tipo inválido, sem criar nada" do
        create_connector(connectorType: "telegram")

        expect(response).to have_http_status(:unprocessable_content)
        expect(json["error"]).to include("code" => "invalidConnectorType", "field" => "connectorType")
        expect(Connector::Base.where(organization_id: organization.id).count).to eq(0)
      end

      it "responde 422 sem tipo" do
        create_connector

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "code")).to eq("invalidConnectorType")
      end

      it "manda a mensagem de erro no idioma pedido" do
        post "/connectors", params: { connectorType: "telegram" }, headers: headers.merge("Accept-Language" => "en"), as: :json

        expect(json.dig("error", "message")).to eq(I18n.t("errors.invalid_connector_type", locale: :en))
      end
    end

    describe "whatsapp_cloud" do
      before { stub_cloud_activation(phone_number_id: 123, waba_id: 456) }

      it "cria, ativa e devolve o que a pessoa cola no painel da Meta" do
        create_connector(connectorType: "whatsapp_cloud", phoneNumberId: 123, wabaId: 456, businessId: 789, accessToken: "token-colado")

        expect(response).to have_http_status(:created)

        connector = Connector::WhatsappCloud.where(organization_id: organization.id).take
        expect(json["instagramConnector"]).to be_nil
        expect(json["connector"]).to include(
          "id" => connector.id.to_s,
          "type" => "whatsapp_cloud",
          "status" => "active",
          "phoneNumberId" => "123",
          "wabaId" => "456",
          "businessId" => "789",
          "profileName" => "Clínica Vida",
          "displayPhoneNumber" => "+55 31 3333-0000",
          "verificationToken" => connector.verification_token,
          "webhookUrl" => "#{Media::Storage.backend_url}/inbound/whatsapp-cloud/#{connector.id}"
        )
      end

      it "não devolve o token" do
        create_connector(connectorType: "whatsapp_cloud", phoneNumberId: 123, wabaId: 456, accessToken: "token-colado")

        expect(response.body).not_to include("token-colado")
      end

      it "aceita o código do OAuth no lugar do token" do
        stub_cloud_oauth(access_token: "token-do-oauth")

        create_connector(connectorType: "whatsapp_cloud", phoneNumberId: 123, wabaId: 456, code: "codigo-1")

        expect(response).to have_http_status(:created)
        expect(response.body).not_to include("token-do-oauth")
        expect(Connector::WhatsappCloud.where(organization_id: organization.id).take.user_access_token).to eq("token-do-oauth")
      end

      it "responde 201 com o conector failed quando falta o número, e a Meta recusa" do
        stub_request(:get, %r{\A#{Regexp.escape(graph_sdk)}/\?fields=}).to_return(meta_error("Unsupported get request"))

        create_connector(connectorType: "whatsapp_cloud", wabaId: 456, accessToken: "token-colado")

        expect(response).to have_http_status(:created)
        expect(json["connector"]).to include("status" => "failed", "errorMessage" => "Unsupported get request")
      end

      it "responde 201 com o conector failed e o motivo quando a Meta recusa o número" do
        stub_cloud_phone_number_error(123, message: "Número não encontrado")

        create_connector(connectorType: "whatsapp_cloud", phoneNumberId: 123, wabaId: 456, accessToken: "token-colado")

        expect(response).to have_http_status(:created)
        expect(json["connector"]).to include("status" => "failed", "active" => false, "errorMessage" => "Número não encontrado")
      end
    end

    describe "whatsapp_web" do
      before { stub_evolution_create }

      it "cria na Evolution e deixa o QR Code para a tela buscar" do
        create_connector(connectorType: "whatsapp_web")

        expect(response).to have_http_status(:created)
        expect(json["connector"]).to include("type" => "whatsapp_web", "status" => "pending", "providerApi" => "evolution_api", "reactionsSupported" => true)
        expect(response.body).not_to include("chave-da-instancia")

        get "/connectors/#{json.dig('connector', 'id')}", headers: headers

        expect(json["extras"]).to eq("qrCode" => "QR-EM-BASE64")
      end

      it "aceita o plano padrão da tela (aiva_api), que roda sobre a Evolution" do
        create_connector(connectorType: "whatsapp_web", providerApi: "aiva_api")

        expect(response).to have_http_status(:created)
        expect(json.dig("connector", "providerApi")).to eq("evolution_api")
      end

      it "aceita o telefone de pareamento em camelCase" do
        create_connector(connectorType: "whatsapp_web", phoneNumberPairing: "5531971810932")

        expect(a_request(:post, evolution_url("/instance/create")).with { |request| JSON.parse(request.body)["number"] == "5531971810932" }).to have_been_made
      end

      it "aceita a Z-API como provider" do
        stub_zapi_on_demand

        with_env("ZAPI_ACCOUNT_TOKEN" => "conta-integradora") do
          create_connector(connectorType: "whatsapp_web", providerApi: "zapi")
        end

        expect(response).to have_http_status(:created)
        expect(json["connector"]).to include("providerApi" => "zapi", "status" => "pending", "deleteForEveryoneSupported" => true, "reactionsSupported" => false)
        expect(response.body).not_to include("TOKEN-NOVO", "conta-integradora")
      end

      it "usa a Z-API quando a organização tem a flag e a tela não escolheu" do
        organization.update!(features: { "zapi" => true })
        stub_zapi_on_demand

        with_env("ZAPI_ACCOUNT_TOKEN" => "conta-integradora") do
          create_connector(connectorType: "whatsapp_web")
        end

        expect(response).to have_http_status(:created)
        expect(json.dig("connector", "providerApi")).to eq("zapi")
      end

      it "a escolha da tela vale mais que a flag da organização" do
        organization.update!(features: { "zapi" => true })

        create_connector(connectorType: "whatsapp_web", providerApi: "aiva_api")

        expect(response).to have_http_status(:created)
        expect(json.dig("connector", "providerApi")).to eq("evolution_api")
      end

      # Sem conector órfão a cada tentativa: fica um só, `failed`, e tentar de novo é `activate`.
      it "cria como failed, sem detalhes do provedor, quando a Evolution falha" do
        stub_request(:post, evolution_url("/instance/create")).to_return(provider_json({ message: "segredo interno" }, status: 500))

        create_connector(connectorType: "whatsapp_web")

        expect(response).to have_http_status(:created)
        expect(json["connector"]).to include("status" => "failed", "active" => false)
        expect(json.dig("connector", "errorMessage")).to include("Failed to create instance")
        expect(response.body).not_to include("segredo interno")
        expect(Connector::WhatsappWeb.where(organization_id: organization.id).count).to eq(1)
      end

      it "cria como failed quando falta a conta integradora da Z-API" do
        with_env("ZAPI_ACCOUNT_TOKEN" => nil) do
          create_connector(connectorType: "whatsapp_web", providerApi: "zapi")
        end

        expect(response).to have_http_status(:created)
        expect(json["connector"]).to include("status" => "failed")
        expect(json.dig("connector", "errorMessage")).to include("account token is required")
      end

      it "responde 422 com provider desconhecido, sem criar nem chamar ninguém" do
        create_connector(connectorType: "whatsapp_web", providerApi: "provedor_novo")

        expect(response).to have_http_status(:unprocessable_content)
        expect(json["error"]).to include("code" => "unprocessable", "field" => "providerApi")
        expect(Connector::WhatsappWeb.where(organization_id: organization.id).count).to eq(0)
      end
    end

    describe "zapi" do
      it "cria e fica pendente" do
        stub_zapi_webhooks("ZINST", "ZTOKEN")

        create_connector(connectorType: "zapi", instanceId: "ZINST", token: "ZTOKEN", accountToken: "ZCLIENT")

        expect(response).to have_http_status(:created)
        expect(json["connector"]).to include("type" => "zapi", "status" => "pending", "instanceId" => "ZINST")
        expect(response.body).not_to include("ZTOKEN", "ZCLIENT")
      end

      it "responde 422 de validação sem a instância" do
        create_connector(connectorType: "zapi", token: "ZTOKEN")

        expect(response).to have_http_status(:unprocessable_content)
        expect(json["error"]).to include("code" => "unprocessable", "field" => "instanceId")
        expect(json.dig("error", "details", "instanceId")).to be_present
        expect(Connector::Zapi.where(organization_id: organization.id).count).to eq(0)
      end

      it "responde 422 de validação sem o token" do
        create_connector(connectorType: "zapi", instanceId: "ZINST")

        expect(response).to have_http_status(:unprocessable_content)
        expect(json["error"]).to include("code" => "unprocessable", "field" => "token")
      end
    end

    describe "lead_chat" do
      it "cria ativo e devolve o webhook" do
        stub_lead_chat_subscription

        create_connector(connectorType: "lead_chat", phoneNumberId: 5531, accessToken: "lead-token")

        expect(response).to have_http_status(:created)

        connector = Connector::LeadChat.where(organization_id: organization.id).take
        expect(json["connector"]).to include(
          "type" => "lead_chat",
          "status" => "active",
          "phoneNumberId" => "5531",
          "webhookUrl" => "#{Media::Storage.backend_url}/inbound/lead-chat/#{connector.id}/event?token=#{connector.inbound_token}",
          "verificationToken" => connector.verification_token
        )
        expect(response.body).not_to include("lead-token")
      end

      it "responde 201 com o conector failed quando a LeadChat recusa" do
        stub_lead_chat_subscription_error

        create_connector(connectorType: "lead_chat", phoneNumberId: 5531, accessToken: "lead-token")

        expect(response).to have_http_status(:created)
        expect(json.dig("connector", "status")).to eq("failed")
      end
    end

    describe "meta_channels" do
      it "cria o Messenger e o Instagram ligado à página" do
        stub_meta_channels(page_id: "9900", instagram_id: "1784")

        create_connector(connectorType: "meta_channels", code: "codigo-1")

        expect(response).to have_http_status(:created)

        messenger = Connector::FacebookMessenger.where(organization_id: organization.id).take
        instagram = Connector::InstagramDirect.where(organization_id: organization.id).take

        expect(json["connector"]).to include(
          "id" => messenger.id.to_s,
          "type" => "facebook_messenger",
          "status" => "active",
          "pageId" => "9900",
          "profileName" => "Loja da Ana",
          "webhookUrl" => "#{Media::Storage.backend_url}/inbound/meta-messaging",
          "verificationToken" => messenger.verification_token
        )
        expect(json["instagramConnector"]).to include(
          "id" => instagram.id.to_s,
          "type" => "instagram_direct",
          "status" => "active",
          "instagramUsername" => "lojadaana",
          "linkedMessengerConnectorId" => messenger.id.to_s,
          "verificationToken" => instagram.verification_token
        )
        expect(response.body).not_to include("page-token-da-meta", "user-token-do-facebook")
      end

      it "cria só o Messenger quando a página não tem Instagram" do
        stub_meta_channels(page_id: "9900", instagram_id: nil)

        create_connector(connectorType: "meta_channels", code: "codigo-1")

        expect(response).to have_http_status(:created)
        expect(json.dig("connector", "type")).to eq("facebook_messenger")
        expect(json["instagramConnector"]).to be_nil
      end

      it "responde 201 com o Messenger failed e o motivo quando o código não vale" do
        stub_request(:post, "#{graph_facebook}/oauth/access_token").to_return(meta_error("Código expirado"))

        create_connector(connectorType: "meta_channels", code: "codigo-velho")

        expect(response).to have_http_status(:created)
        expect(json["connector"]).to include("status" => "failed", "errorMessage" => "Código expirado")
        expect(json["instagramConnector"]).to be_nil
      end
    end

    describe "instagram_direct" do
      it "cria pelo Instagram Login" do
        stub_instagram_login

        create_connector(connectorType: "instagram_direct", code: "codigo-1", redirectUri: "https://app.vekoo.app/callback")

        expect(response).to have_http_status(:created)

        connector = Connector::InstagramDirect.where(organization_id: organization.id).take
        expect(json["connector"]).to include(
          "type" => "instagram_direct",
          "status" => "active",
          "authProvider" => "instagram_login",
          "instagramAccountId" => "178414",
          "instagramUsername" => "lojadaana",
          "name" => "@lojadaana",
          "webhookUrl" => "#{Media::Storage.backend_url}/inbound/meta-messaging",
          "verificationToken" => connector.verification_token
        )
        expect(json["instagramConnector"]).to be_nil
        expect(response.body).not_to include("ig-longo", "ig-curto")
      end

      it "manda o redirect_uri que veio em camelCase" do
        stub_instagram_login

        create_connector(connectorType: "instagram_direct", code: "codigo-1", redirectUri: "https://app.vekoo.app/callback")

        expect(a_request(:post, "https://api.instagram.com/oauth/access_token").with { |request|
          Rack::Utils.parse_nested_query(request.body)["redirect_uri"] == "https://app.vekoo.app/callback"
        }).to have_been_made
      end

      it "responde 201 com o conector failed quando a troca do código falha" do
        stub_request(:post, "https://api.instagram.com/oauth/access_token").to_return(provider_json({ error_message: "Código expirado" }, status: 400))

        create_connector(connectorType: "instagram_direct", code: "codigo-velho", redirectUri: "https://app.vekoo.app/callback")

        expect(response).to have_http_status(:created)
        expect(json["connector"]).to include("status" => "failed", "errorMessage" => "Código expirado")
      end
    end

    describe "web_widget" do
      it "cria desligado, sem o token público nem o snippet, que são da tela do widget" do
        create_connector(connectorType: "web_widget")

        expect(response).to have_http_status(:created)
        expect(json["connector"]).to include("type" => "web_widget", "status" => "inactive", "active" => false)

        connector = Connector::WebWidget.where(organization_id: organization.id).take
        expect(response.body).not_to include(connector.signing_secret, connector.public_token)
      end
    end

    it "cria na organização da sessão, ignorando a que vier no corpo" do
      other = create(:organization)

      create_connector(connectorType: "web_widget", organizationId: other.id)

      expect(Connector::WebWidget.where(organization_id: organization.id).count).to eq(1)
      expect(Connector::WebWidget.where(organization_id: other.id).count).to eq(0)
    end
  end

  describe "PATCH /connectors/:id" do
    let(:connector) { create(:connector_whatsapp_web, organization: organization) }

    it "muda o envio do nome do atendente" do
      patch "/connectors/#{connector.id}", params: { sendCollaboratorName: true }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json.dig("connector", "sendCollaboratorName")).to be(true)
      expect(connector.reload.send_collaborator_name).to be(true)
    end

    it "ignora o resto" do
      patch "/connectors/#{connector.id}", params: { status: "failed", organizationId: "outra", apiKey: "x" }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      connector.reload
      expect(connector.status).to eq(:active)
      expect(connector.organization_id).to eq(organization.id)
      expect(connector.api_key).to eq("chave-evolution")
    end

    it "responde 422 quando o conector guardado não passa na validação" do
      zapi_connector = create(:connector_zapi, organization: organization)
      zapi_connector.set(instance_id: nil)

      patch "/connectors/#{zapi_connector.id}", params: { sendCollaboratorName: true }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]).to include("code" => "unprocessable", "field" => "instanceId")
    end
  end

  describe "ciclo de vida" do
    let(:alerts) { spy("OrganizationAlertService") }

    before { stub_const("OrganizationAlertService", alerts) }

    def act(connector, action, **params)
      post "/connectors/#{connector.id}/#{action}", params: params, headers: headers, as: :json
    end

    describe "POST /connectors/:id/activate" do
      context "com o número do código de pareamento" do
        let(:connector) { create(:connector_whatsapp_web, organization: organization, status: :closed) }

        before do
          stub_request(:post, "http://evolution.test/instance/create").to_return(provider_json({ hash: "chave", qrcode: { base64: "QR" } }, status: 201))
        end

        it "pede o código para este número ao reconectar" do
          act(connector, :activate, phoneNumberPairing: "5531971810932")

          expect(response).to have_http_status(:ok)
          expect(connector.reload.phone_number_pairing).to eq("5531971810932")
          expect(a_request(:post, "http://evolution.test/instance/create").with(body: hash_including("number" => "5531971810932"))).to have_been_made
        end

        it "volta para o QR code com null" do
          connector.update!(phone_number_pairing: "5531971810932")

          act(connector, :activate, phoneNumberPairing: nil)

          expect(connector.reload.phone_number_pairing).to be_nil
          expect(a_request(:post, "http://evolution.test/instance/create").with { |request| !JSON.parse(request.body).key?("number") }).to have_been_made
        end

        it "sem o campo, mantém o número que já estava guardado" do
          connector.update!(phone_number_pairing: "5531971810932")

          act(connector, :activate)

          expect(connector.reload.phone_number_pairing).to eq("5531971810932")
        end

        it "ignora o campo em canal que não pareia por número" do
          widget = create(:connector_web_widget, organization: organization, status: :inactive)

          act(widget, :activate, phoneNumberPairing: "5531971810932")

          expect(response).to have_http_status(:ok)
          expect(widget.reload).not_to respond_to(:phone_number_pairing)
        end
      end

      it "volta o pausado a ativo, sem chamar o provedor de novo, e avisa a volta" do
        connector = create(:connector_web_widget, organization: organization, status: :paused)

        act(connector, :activate)

        expect(response).to have_http_status(:ok)
        expect(json["connector"]).to include("status" => "active", "active" => true)
        expect(connector.reload.status).to eq(:active)
        expect(alerts).to have_received(:connector_reconnected).with(organization, an_instance_of(Connector::WebWidget))
      end

      it "busca os dados da instância ao reativar um WhatsApp Web pausado" do
        connector = create(:connector_whatsapp_web, organization: organization, status: :paused, number_id: nil)
        stub_request(:get, "http://evolution.test/instance/fetchInstances?instanceName=#{connector.instance_name}").to_return(
          provider_json([ { name: connector.instance_name, ownerJid: "5531971810932@s.whatsapp.net", profileName: "Loja da Ana", profilePicUrl: "https://cdn.exemplo.com/a.jpg" } ])
        )

        act(connector, :activate)

        expect(response).to have_http_status(:ok)
        expect(connector.reload).to have_attributes(status: :active, number_id: "5531971810932", profile_name: "Loja da Ana")
      end

      it "busca os dados do aparelho ao reativar uma Z-API pausada" do
        connector = create(:connector_zapi, organization: organization, status: :paused, instance_id: "ZINST", token: "ZTOKEN")
        stub_zapi_device("ZINST", "ZTOKEN", phone: "5531988887777", name: "Padaria Nova")

        act(connector, :activate)

        expect(response).to have_http_status(:ok)
        expect(connector.reload).to have_attributes(status: :active, phone_number: "5531988887777", profile_name: "Padaria Nova")
      end

      it "responde 422 e não avisa a volta quando o provedor falha ao reativar" do
        connector = create(:connector_zapi, organization: organization, status: :paused, instance_id: "ZINST", token: "ZTOKEN")
        stub_request(:get, "#{zapi}/instances/ZINST/token/ZTOKEN/device").to_return(provider_json({ error: "x" }, status: 500))

        act(connector, :activate)

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "code")).to eq("connectorActionFailed")
        expect(connector.reload.status).to eq(:paused)
        expect(alerts).not_to have_received(:connector_reconnected)
      end

      it "responde 422 e não muda nada quando o conector pausado não passa na validação" do
        connector = create(:connector_zapi, organization: organization, status: :paused)
        connector.set(instance_id: nil)

        act(connector, :activate)

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "code")).to eq("unprocessable")
        expect(connector.reload.status).to eq(:paused)
        expect(alerts).not_to have_received(:connector_reconnected)
      end

      it "liga pelo provedor o que está desligado" do
        connector = create(:connector_web_widget, organization: organization, status: :inactive)

        act(connector, :activate)

        expect(response).to have_http_status(:ok)
        expect(connector.reload.status).to eq(:active)
      end

      it "não avisa a volta do Instagram desligado quando não vem o código para religar" do
        connector = create(:connector_instagram, organization: organization, status: :inactive)

        act(connector, :activate)

        expect(response).to have_http_status(:ok)
        expect(json.dig("connector", "status")).to eq("inactive")
        expect(alerts).not_to have_received(:connector_reconnected)
      end

      it "cria de novo a instância do WhatsApp Web desconectado" do
        connector = create(:connector_whatsapp_web, organization: organization, status: :closed, base_url: evolution_url)
        create_instance = stub_evolution_create

        act(connector, :activate)

        expect(response).to have_http_status(:ok)
        expect(create_instance).to have_been_requested
        expect(json.dig("connector", "status")).to eq("pending")
      end

      it "passa o código da Meta para quem precisa dele" do
        connector = create(:connector_messenger, organization: organization, status: :failed, page_id: "9900")
        stub_meta_channels(page_id: "9900")

        act(connector, :activate, code: "codigo-novo")

        expect(response).to have_http_status(:ok)
        expect(connector.reload.status).to eq(:active)
        expect(a_request(:post, "#{graph_facebook}/oauth/access_token").with { |request| JSON.parse(request.body)["code"] == "codigo-novo" }).to have_been_made
      end

      it "relê o número do WhatsApp Cloud desligado" do
        connector = create(:connector_whatsapp_cloud, organization: organization, status: :inactive, phone_number_id: 123, waba_id: 456)
        stub_cloud_activation(phone_number_id: 123, waba_id: 456)

        act(connector, :activate)

        expect(response).to have_http_status(:ok)
        expect(connector.reload.status).to eq(:active)
      end

      it "liga pelo provedor AIVA, criando a instância, o webhook e a conexão" do
        connector = create(:connector_whatsapp_web, :aiva, organization: organization, status: :inactive)
        create_instance = stub_request(:post, "http://aiva.test/instance/create").to_return(provider_json({ hash: { apikey: "chave" } }, status: 201))
        webhook = stub_request(:post, "http://aiva.test/webhook/set/#{connector.instance_name}").to_return(provider_json({}, status: 201))
        connect = stub_request(:get, "http://aiva.test/instance/connect/#{connector.instance_name}").to_return(provider_json({}))

        act(connector, :activate)

        expect(response).to have_http_status(:ok)
        expect(create_instance).to have_been_requested
        expect(webhook).to have_been_requested
        expect(connect).to have_been_requested
        expect(json.dig("connector", "status")).to eq("pending")
      end

      it "responde com o conector failed e o motivo, sem avisar a volta, quando a Meta recusa sem exceção" do
        connector = create(:connector_whatsapp_cloud, organization: organization, status: :inactive, phone_number_id: 123, waba_id: 456)
        stub_cloud_phone_number_error(123, message: "Número não encontrado")

        act(connector, :activate)

        expect(response).to have_http_status(:ok)
        expect(json["connector"]).to include("status" => "failed", "errorMessage" => "Número não encontrado")
        expect(alerts).not_to have_received(:connector_reconnected)
      end

      it "não chama o provedor se já está ativo, mas resolve os avisos" do
        connector = create(:connector_whatsapp_web, organization: organization)

        act(connector, :activate)

        expect(response).to have_http_status(:ok)
        expect(alerts).to have_received(:connector_reconnected)
      end

      it "responde 422 quando o provedor falha ao ligar" do
        connector = create(:connector_whatsapp_web, organization: organization, status: :closed, base_url: evolution_url)
        stub_request(:post, evolution_url("/instance/create")).to_return(provider_json({ message: "erro" }, status: 500))

        act(connector, :activate)

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "code")).to eq("connectorActionFailed")
        expect(alerts).not_to have_received(:connector_reconnected)
      end

      it "não deixa o serviço de avisos derrubar a ação" do
        allow(alerts).to receive(:connector_reconnected).and_raise("serviço fora")
        connector = create(:connector_web_widget, organization: organization, status: :paused)

        act(connector, :activate)

        expect(response).to have_http_status(:ok)
      end
    end

    describe "POST /connectors/:id/reload" do
      it "reinicia a instância da Evolution" do
        connector = create(:connector_whatsapp_web, organization: organization)
        restart = stub_request(:put, "http://evolution.test/instance/restart/#{connector.instance_name}").to_return(provider_json({ instance: {} }))

        act(connector, :reload)

        expect(response).to have_http_status(:ok)
        expect(restart).to have_been_requested
        expect(json["connector"]).to include("id" => connector.id.to_s, "status" => "active")
      end

      it "reinicia a instância do outro provedor pela rota dele" do
        connector = create(:connector_whatsapp_web, :aiva, organization: organization)
        reload = stub_request(:get, "http://aiva.test/instance/reload/#{connector.instance_name}").to_return(provider_json({}))

        act(connector, :reload)

        expect(response).to have_http_status(:ok)
        expect(reload).to have_been_requested
      end

      it "não faz nada com a instância parada" do
        connector = create(:connector_whatsapp_web, organization: organization, status: :pending)

        act(connector, :reload)

        expect(response).to have_http_status(:ok)
      end

      it "responde 422 quando a Evolution falha" do
        connector = create(:connector_whatsapp_web, organization: organization)
        stub_request(:put, "http://evolution.test/instance/restart/#{connector.instance_name}").to_return(provider_json({ message: "erro" }, status: 500))

        act(connector, :reload)

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "code")).to eq("connectorActionFailed")
      end

      it "responde 422 no canal que não recarrega" do
        act(create(:connector_messenger, organization: organization), :reload)

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "code")).to eq("connectorTypeMismatch")
      end

      it "responde 422 no WhatsApp Cloud, que não implementa" do
        act(create(:connector_whatsapp_cloud, organization: organization), :reload)

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "code")).to eq("connectorActionFailed")
      end

      [ :connector_web_widget, :connector_zapi, :connector_lead_chat ].each do |factory|
        it "não faz nada em #{factory}, que não tem instância para recarregar" do
          act(create(factory, organization: organization), :reload)

          expect(response).to have_http_status(:ok)
          expect(json.dig("connector", "status")).to eq("active")
        end
      end
    end

    describe "POST /connectors/:id/shutdown" do
      it "desliga a instância da Evolution e avisa" do
        connector = create(:connector_whatsapp_web, organization: organization, profile_name: "Loja da Ana")
        logout = stub_request(:delete, "http://evolution.test/instance/logout/#{connector.instance_name}").to_return(provider_json({ status: "SUCCESS" }))

        act(connector, :shutdown)

        expect(response).to have_http_status(:ok)
        expect(logout).to have_been_requested
        expect(json.dig("connector", "status")).to eq("closed")
        expect(connector.reload.status).to eq(:closed)
        expect(alerts).to have_received(:connector_disconnected).with(
          organization, an_instance_of(Connector::WhatsappWeb), message: 'O canal "Loja da Ana" foi desligado manualmente.'
        )
      end

      it "aceita a instância que o provedor já não conhece" do
        connector = create(:connector_whatsapp_web, organization: organization)
        stub_request(:delete, "http://evolution.test/instance/logout/#{connector.instance_name}").to_return(provider_json({}, status: 404))

        act(connector, :shutdown)

        expect(response).to have_http_status(:ok)
        expect(connector.reload.status).to eq(:closed)
      end

      it "desconecta a instância da Z-API pelo provider dela" do
        connector = create(:connector_whatsapp_web, :zapi, organization: organization)
        disconnect = stub_request(:get, "#{zapi}/instances/INST123/token/TOKABC/disconnect").to_return(provider_json({ value: true }))

        act(connector, :shutdown)

        expect(response).to have_http_status(:ok)
        expect(disconnect).to have_been_requested
        expect(connector.reload.status).to eq(:closed)
      end

      it "desliga o conector Z-API" do
        connector = create(:connector_zapi, organization: organization)

        act(connector, :shutdown)

        expect(response).to have_http_status(:ok)
        expect(connector.reload.status).to eq(:inactive)
      end

      it "cancela a assinatura da LeadChat" do
        connector = create(:connector_lead_chat, organization: organization, external_subscription_id: "sub-1")
        cancel = stub_request(:delete, "#{ConnectorProviderStubs::LEAD_CHAT_SUBSCRIPTIONS}/sub-1").to_return(provider_json({ deleted: true }))

        act(connector, :shutdown)

        expect(response).to have_http_status(:ok)
        expect(cancel).to have_been_requested
        expect(connector.reload).to have_attributes(status: :closed, external_subscription_id: nil)
      end

      it "fecha o widget" do
        connector = create(:connector_web_widget, organization: organization)

        act(connector, :shutdown)

        expect(response).to have_http_status(:ok)
        expect(connector.reload.status).to eq(:closed)
      end

      it "manda o aviso no idioma da requisição" do
        connector = create(:connector_web_widget, organization: organization, bot_display_name: "Atendimento")

        post "/connectors/#{connector.id}/shutdown", params: { locale: "en" }, headers: headers, as: :json

        expect(alerts).to have_received(:connector_disconnected).with(
          organization, anything, message: 'Channel "Atendimento" was shut down manually.'
        )
      end

      it "responde 422 e não avisa quando o provedor falha" do
        connector = create(:connector_whatsapp_web, organization: organization)
        stub_request(:delete, "http://evolution.test/instance/logout/#{connector.instance_name}").to_return(provider_json({ message: "erro" }, status: 500))

        act(connector, :shutdown)

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "code")).to eq("connectorActionFailed")
        expect(alerts).not_to have_received(:connector_disconnected)
      end

      it "responde 422 no canal que não desliga" do
        act(create(:connector_messenger, organization: organization), :shutdown)

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "code")).to eq("connectorTypeMismatch")
        expect(alerts).not_to have_received(:connector_disconnected)
      end

      it "responde 422 no WhatsApp Cloud, que não implementa" do
        act(create(:connector_whatsapp_cloud, organization: organization), :shutdown)

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "code")).to eq("connectorActionFailed")
        expect(alerts).not_to have_received(:connector_disconnected)
      end
    end

    describe "POST /connectors/:id/pause" do
      it "pausa, sem avisar" do
        connector = create(:connector_whatsapp_cloud, organization: organization)

        act(connector, :pause)

        expect(response).to have_http_status(:ok)
        expect(json["connector"]).to include("status" => "paused", "active" => false)
        expect(connector.reload.status).to eq(:paused)
        expect(alerts).not_to have_received(:connector_disconnected)
      end

      it "responde 422 e não diz que pausou quando o conector não passa na validação" do
        connector = create(:connector_zapi, organization: organization)
        connector.set(instance_id: nil)

        act(connector, :pause)

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "code")).to eq("unprocessable")
        expect(connector.reload.status).to eq(:active)
      end
    end

    describe "POST /connectors/:id/disconnect" do
      context "com Instagram Login" do
        let(:connector) { create(:connector_instagram, organization: organization, instagram_user_access_token: "ig-token", instagram_token_expires_at: 30.days.from_now) }
        let!(:unsubscribe) { stub_request(:delete, "#{graph_instagram}/me/subscribed_apps").with(query: { access_token: "ig-token" }).to_return(provider_json({ success: true })) }
        let!(:revoke) { stub_request(:delete, "#{graph_instagram}/me/permissions").with(query: { access_token: "ig-token" }).to_return(provider_json({ success: true })) }

        it "cancela na Meta, apaga os tokens e desliga" do
          act(connector, :disconnect)

          expect(response).to have_http_status(:ok)
          expect(unsubscribe).to have_been_requested
          expect(revoke).to have_been_requested
          expect(json["connector"]).to include("status" => "inactive", "instagramUsername" => "lojadaana")

          connector.reload
          expect(connector.status).to eq(:inactive)
          expect(connector.instagram_user_access_token).to be_nil
          expect(connector.page_access_token).to be_nil
          expect(connector.instagram_token_expires_at).to be_nil
        end

        it "avisa a desconexão manual" do
          act(connector, :disconnect)

          expect(alerts).to have_received(:connector_disconnected).with(
            organization, an_instance_of(Connector::InstagramDirect), message: 'O canal "@lojadaana" foi desconectado manualmente.'
          )
        end

        it "segue desconectando se a Meta recusar a revogação" do
          stub_request(:delete, "#{graph_instagram}/me/permissions").with(query: { access_token: "ig-token" }).to_return(meta_error("Token inválido"))

          act(connector, :disconnect)

          expect(response).to have_http_status(:ok)
          expect(connector.reload.instagram_user_access_token).to be_nil
        end

        it "responde 422 e não avisa quando a rede cai, sem expor o motivo" do
          stub_request(:delete, "#{graph_instagram}/me/subscribed_apps").with(query: { access_token: "ig-token" }).to_timeout

          act(connector, :disconnect)

          expect(response).to have_http_status(:unprocessable_content)
          expect(json.dig("error", "code")).to eq("connectorActionFailed")
          expect(connector.reload.status).to eq(:active)
          expect(alerts).not_to have_received(:connector_disconnected)
        end
      end

      it "cancela a assinatura da página no Instagram ligado por Facebook Login" do
        connector = create(:connector_instagram, organization: organization, auth_provider: "facebook_login", page_id: "9900", page_access_token: "page-token")
        unsubscribe = stub_request(:delete, "#{graph_facebook}/9900/subscribed_apps").with(query: { access_token: "page-token" }).to_return(provider_json({ success: true }))

        act(connector, :disconnect)

        expect(response).to have_http_status(:ok)
        expect(unsubscribe).to have_been_requested
        expect(connector.reload).to have_attributes(status: :inactive, page_access_token: nil)
      end

      it "desliga o Messenger" do
        connector = create(:connector_messenger, organization: organization)

        act(connector, :disconnect)

        expect(response).to have_http_status(:ok)
        expect(connector.reload.status).to eq(:inactive)
      end

      it "desliga o conector Z-API" do
        connector = create(:connector_zapi, organization: organization)

        act(connector, :disconnect)

        expect(response).to have_http_status(:ok)
        expect(connector.reload.status).to eq(:inactive)
      end

      it "fecha o widget" do
        connector = create(:connector_web_widget, organization: organization)

        act(connector, :disconnect)

        expect(response).to have_http_status(:ok)
        expect(connector.reload.status).to eq(:closed)
      end

      # `Connector::Base#deactivate` levanta NotImplementedError, que não é StandardError:
      # sem tratamento, o canal sem desconexão derrubaria a requisição com 500.
      [
        [ :connector_whatsapp_cloud, "WhatsApp Cloud" ],
        [ :connector_whatsapp_web, "WhatsApp Web" ],
        [ :connector_lead_chat, "LeadChat" ]
      ].each do |factory, label|
        it "responde 422 no #{label}, que não tem como desconectar, sem avisar" do
          connector = create(factory, organization: organization)

          act(connector, :disconnect)

          expect(response).to have_http_status(:unprocessable_content)
          expect(json.dig("error", "code")).to eq("connectorTypeMismatch")
          expect(connector.reload.status).to eq(:active)
          expect(alerts).not_to have_received(:connector_disconnected)
        end
      end
    end

    it "não falha sem o serviço de avisos" do
      hide_const("OrganizationAlertService")
      connector = create(:connector_web_widget, organization: organization)

      act(connector, :disconnect)

      expect(response).to have_http_status(:ok)
    end
  end

  describe "perfil da WABA" do
    let(:connector) { create(:connector_whatsapp_cloud, organization: organization, phone_number_id: 123, waba_id: 456) }

    describe "GET /connectors/:id/business-profile" do
      it "devolve o perfil do número principal" do
        stub_cloud_business_profile(123)

        get "/connectors/#{connector.id}/business-profile", headers: headers

        expect(response).to have_http_status(:ok)
        expect(json["businessProfile"]).to eq(
          "about" => "Atendimento em Belo Horizonte",
          "address" => "Rua da Bahia, 1000",
          "description" => "Clínica de nutrição",
          "email" => "contato@clinicavida.com.br",
          "profilePictureUrl" => "https://cdn.exemplo.com/perfil.jpg",
          "websites" => [ "https://clinicavida.com.br" ],
          "vertical" => "HEALTH"
        )
      end

      it "aceita outro número da mesma conta" do
        stub_cloud_business_profile(999, about: "Filial")

        get "/connectors/#{connector.id}/business-profile", params: { phoneNumberId: 999 }, headers: headers

        expect(json.dig("businessProfile", "about")).to eq("Filial")
      end

      it "devolve lista vazia de sites quando não há" do
        stub_cloud_business_profile(123, websites: nil)

        get "/connectors/#{connector.id}/business-profile", headers: headers

        expect(json.dig("businessProfile", "websites")).to eq([])
      end

      it "responde 422 quando a Meta recusa" do
        stub_request(:get, %r{#{graph_sdk}/123/whatsapp_business_profile}).to_return(meta_error)

        get "/connectors/#{connector.id}/business-profile", headers: headers

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "code")).to eq("connectorProviderError")
      end

      it "responde 422 quando a rede cai" do
        stub_request(:get, %r{#{graph_sdk}/123/whatsapp_business_profile}).to_timeout

        get "/connectors/#{connector.id}/business-profile", headers: headers

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "code")).to eq("connectorActionFailed")
      end

      it "responde 422 em canal de outro tipo" do
        get "/connectors/#{create(:connector_zapi, organization: organization).id}/business-profile", headers: headers

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "code")).to eq("connectorTypeMismatch")
      end
    end

    describe "PATCH /connectors/:id/business-profile" do
      let(:changes) { { about: "Novo texto", email: "novo@clinicavida.com.br", vertical: "HEALTH", websites: [ "https://novo.com.br" ] } }

      before { stub_cloud_business_profile(123, about: "Novo texto") }

      it "manda à Meta, relê e guarda os detalhes" do
        update = stub_request(:post, "#{graph_sdk}/123/whatsapp_business_profile").to_return(provider_json({ success: true }))

        patch "/connectors/#{connector.id}/business-profile", params: changes, headers: headers, as: :json

        expect(response).to have_http_status(:ok)
        expect(update.with { |request|
          form = Rack::Utils.parse_nested_query(request.body)
          form["about"] == "Novo texto" && form["messaging_product"] == "whatsapp" && form["websites"] == [ "https://novo.com.br" ]
        }).to have_been_requested
        expect(connector.reload.phone_number_details.dig("123", "about")).to eq("Novo texto")
        expect(json.dig("connector", "phoneNumberDetails", "123", "about")).to eq("Novo texto")
      end

      it "não manda campo que não é do perfil" do
        update = stub_request(:post, "#{graph_sdk}/123/whatsapp_business_profile").to_return(provider_json({ success: true }))

        patch "/connectors/#{connector.id}/business-profile", params: { about: "x", messaging: "y", accessToken: "z" }, headers: headers, as: :json

        expect(update.with { |request| !Rack::Utils.parse_nested_query(request.body).key?("accessToken") && !request.body.include?("access_token") }).to have_been_requested
      end

      it "atualiza outro número quando pedido" do
        update = stub_request(:post, "#{graph_sdk}/999/whatsapp_business_profile").to_return(provider_json({ success: true }))
        stub_cloud_business_profile(999, about: "Filial")

        patch "/connectors/#{connector.id}/business-profile", params: changes.merge(phoneNumberId: 999), headers: headers, as: :json

        expect(update).to have_been_requested
        expect(connector.reload.phone_number_details.dig("999", "about")).to eq("Filial")
      end

      it "responde 422 com vertical inválida, sem chamar a Meta" do
        patch "/connectors/#{connector.id}/business-profile", params: { vertical: "PADARIA" }, headers: headers, as: :json

        expect(response).to have_http_status(:unprocessable_content)
        expect(json["error"]).to include("code" => "connectorProviderError", "field" => "vertical")
        expect(json.dig("error", "message")).to include("invalid vertical PADARIA")
      end

      it "responde 422 e não relê o perfil quando a Meta recusa" do
        stub_request(:post, "#{graph_sdk}/123/whatsapp_business_profile").to_return(meta_error("E-mail inválido"))

        patch "/connectors/#{connector.id}/business-profile", params: { email: "x" }, headers: headers, as: :json

        expect(response).to have_http_status(:unprocessable_content)
        expect(json["error"]).to include("code" => "connectorProviderError", "message" => "E-mail inválido")
        expect(connector.reload.phone_number_details).to eq({})
      end

      it "responde 422 quando a rede cai" do
        stub_request(:post, "#{graph_sdk}/123/whatsapp_business_profile").to_timeout

        patch "/connectors/#{connector.id}/business-profile", params: changes, headers: headers, as: :json

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "code")).to eq("connectorActionFailed")
      end

      it "responde 422 em canal de outro tipo" do
        patch "/connectors/#{create(:connector_zapi, organization: organization).id}/business-profile", params: changes, headers: headers, as: :json

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "code")).to eq("connectorTypeMismatch")
      end
    end

    describe "POST /connectors/:id/business-profile/picture" do
      let(:png) { fixture_file_upload("foto.png", "image/png") }

      def upload(file: png, connector_id: connector.id, **params)
        post "/connectors/#{connector_id}/business-profile/picture", params: { file: file, **params }, headers: headers
      end

      it "sobe a imagem na Meta e aplica no perfil" do
        media = stub_request(:post, "#{graph_sdk}/123/media").to_return(provider_json({ id: "media-1" }))
        profile = stub_request(:post, "#{graph_sdk}/123/whatsapp_business_profile").to_return(provider_json({ success: true }))

        upload

        expect(response).to have_http_status(:ok)
        expect(json).to eq("mediaId" => "media-1")
        expect(media).to have_been_requested
        expect(profile.with { |request| Rack::Utils.parse_nested_query(request.body)["profile_picture_handle"] == "media-1" }).to have_been_requested
      end

      it "usa o número pedido" do
        media = stub_request(:post, "#{graph_sdk}/999/media").to_return(provider_json({ id: "media-1" }))
        stub_request(:post, "#{graph_sdk}/999/whatsapp_business_profile").to_return(provider_json({ success: true }))

        upload(phoneNumberId: 999)

        expect(response).to have_http_status(:ok)
        expect(media).to have_been_requested
      end

      it "responde 422 sem arquivo" do
        post "/connectors/#{connector.id}/business-profile/picture", headers: headers

        expect(response).to have_http_status(:unprocessable_content)
        expect(json["error"]).to include("code" => "fileRequired", "field" => "file")
      end

      it "responde 422 com texto no lugar do arquivo" do
        post "/connectors/#{connector.id}/business-profile/picture", params: { file: "nao-e-arquivo" }, headers: headers

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "code")).to eq("fileRequired")
      end

      it "responde 422 com tipo que a Meta não aceita" do
        upload(file: fixture_file_upload("documento.txt", "text/plain"))

        expect(response).to have_http_status(:unprocessable_content)
        expect(json["error"]).to include("code" => "invalidFileType", "field" => "file")
      end

      it "responde 422 quando a Meta recusa a imagem" do
        stub_request(:post, "#{graph_sdk}/123/media").to_return(meta_error("Imagem grande demais"))

        upload

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "code")).to eq("connectorProviderError")
      end

      it "responde 422 quando a Meta aceita a imagem mas recusa aplicar no perfil" do
        stub_request(:post, "#{graph_sdk}/123/media").to_return(provider_json({ id: "media-1" }))
        stub_request(:post, "#{graph_sdk}/123/whatsapp_business_profile").to_return(meta_error("Sem permissão"))

        upload

        expect(response).to have_http_status(:unprocessable_content)
        expect(json["error"]).to include("code" => "connectorProviderError", "message" => "Sem permissão")
      end

      it "responde 422 quando a rede cai" do
        stub_request(:post, "#{graph_sdk}/123/media").to_timeout

        upload

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "code")).to eq("connectorActionFailed")
      end

      it "responde 422 em canal de outro tipo" do
        upload(connector_id: create(:connector_zapi, organization: organization).id)

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "code")).to eq("connectorTypeMismatch")
      end
    end
  end

  describe "números da WABA" do
    let(:connector) do
      create(
        :connector_whatsapp_cloud,
        organization: organization,
        phone_number_id: 123,
        waba_id: 456,
        phone_number_list: [ { "id" => "123", "display_phone_number" => "+55 31 3333-0000" } ]
      )
    end

    describe "GET /connectors/:id/phone-numbers" do
      it "devolve a lista guardada e o número principal, sem chamar a Meta" do
        get "/connectors/#{connector.id}/phone-numbers", headers: headers

        expect(response).to have_http_status(:ok)
        expect(json["phoneNumbers"]).to eq([ { "id" => "123", "displayPhoneNumber" => "+55 31 3333-0000" } ])
        expect(json["primaryPhoneNumberId"]).to eq("123")
      end

      it "responde 422 em canal de outro tipo" do
        get "/connectors/#{create(:connector_zapi, organization: organization).id}/phone-numbers", headers: headers

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "code")).to eq("connectorTypeMismatch")
      end
    end

    describe "POST /connectors/:id/phone-numbers/refresh" do
      it "relê da Meta e guarda" do
        stub_cloud_phone_numbers(456, [ cloud_phone_payload(123), cloud_phone_payload(999, display_phone_number: "+55 31 9999-0000") ])
        stub_cloud_business_profile(123)
        stub_cloud_business_profile(999)

        post "/connectors/#{connector.id}/phone-numbers/refresh", headers: headers, as: :json

        expect(response).to have_http_status(:ok)
        expect(json["phoneNumbers"].map { |phone| phone["id"] }).to eq(%w[123 999])
        expect(json["phoneNumbers"].last).to include("displayPhoneNumber" => "+55 31 9999-0000", "verifiedName" => "Clínica Vida", "qualityRating" => "GREEN")
        expect(json["primaryPhoneNumberId"]).to eq("123")
        expect(connector.reload.phone_number_list.size).to eq(2)
      end

      it "usa o business_id quando não há WABA" do
        connector.set(waba_id: nil, business_id: 789)
        numbers = stub_cloud_phone_numbers(789, [ cloud_phone_payload(123) ])
        stub_cloud_business_profile(123)

        post "/connectors/#{connector.id}/phone-numbers/refresh", headers: headers, as: :json

        expect(response).to have_http_status(:ok)
        expect(numbers).to have_been_requested
      end

      it "continua quando um número não tem perfil" do
        stub_cloud_phone_numbers(456, [ cloud_phone_payload(123) ])
        stub_request(:get, %r{#{graph_sdk}/123/whatsapp_business_profile}).to_return(meta_error)

        post "/connectors/#{connector.id}/phone-numbers/refresh", headers: headers, as: :json

        expect(response).to have_http_status(:ok)
      end

      it "responde 422 e mantém a lista quando a Meta falha" do
        stub_request(:get, %r{#{graph_sdk}/456/phone_numbers}).to_return(meta_error)

        post "/connectors/#{connector.id}/phone-numbers/refresh", headers: headers, as: :json

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "code")).to eq("connectorActionFailed")
        expect(connector.reload.phone_number_list.size).to eq(1)
      end

      it "responde 422 em canal de outro tipo" do
        post "/connectors/#{create(:connector_zapi, organization: organization).id}/phone-numbers/refresh", headers: headers, as: :json

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "code")).to eq("connectorTypeMismatch")
      end
    end
  end

  describe "GET /connectors/:id/instagram-profile" do
    context "com Instagram Login" do
      let(:connector) { create(:connector_instagram, organization: organization, instagram_account_id: "178414", instagram_username: "antigo") }

      it "atualiza e devolve o perfil" do
        stub_instagram_me(user_id: "178414")

        get "/connectors/#{connector.id}/instagram-profile", headers: headers

        expect(response).to have_http_status(:ok)
        expect(json["connector"]).to include(
          "instagramUsername" => "lojadaana",
          "accountName" => "Loja da Ana",
          "biography" => "Roupas feitas à mão",
          "followersCount" => 1200,
          "followsCount" => 300,
          "mediaCount" => 87,
          "website" => "https://lojadaana.com.br",
          "accountType" => "BUSINESS",
          "profileName" => "lojadaana"
        )
        expect(json).not_to have_key("refreshError")
        expect(connector.reload.instagram_username).to eq("lojadaana")
      end

      it "usa o perfil pelo id quando o /me não responde" do
        stub_request(:get, "#{graph_instagram}/me").with(query: hash_including({})).to_return(meta_error)
        stub_request(:get, "#{graph_instagram}/178414").with(query: hash_including({})).to_return(provider_json(instagram_profile_payload(biography: "Pelo id")))

        get "/connectors/#{connector.id}/instagram-profile", headers: headers

        expect(response).to have_http_status(:ok)
        expect(json.dig("connector", "biography")).to eq("Pelo id")
      end

      it "devolve o que está guardado e o motivo quando a Graph API cai" do
        stub_request(:get, "#{graph_instagram}/me").with(query: hash_including({})).to_timeout

        get "/connectors/#{connector.id}/instagram-profile", headers: headers

        expect(response).to have_http_status(:ok)
        expect(json["refreshError"]).to be_present
        expect(json.dig("connector", "instagramUsername")).to eq("antigo")
      end

      it "não vaza o token" do
        stub_instagram_me(user_id: "178414")

        get "/connectors/#{connector.id}/instagram-profile", headers: headers

        expect(response.body).not_to include("ig-token")
      end
    end

    context "com Facebook Login" do
      let(:connector) { create(:connector_instagram, organization: organization, auth_provider: "facebook_login", instagram_account_id: "1784", instagram_username: "antigo", page_access_token: "page-token", instagram_user_access_token: nil) }

      it "atualiza pelo token da página" do
        stub_facebook_instagram_profile("1784")

        get "/connectors/#{connector.id}/instagram-profile", headers: headers

        expect(response).to have_http_status(:ok)
        expect(json.dig("connector", "instagramUsername")).to eq("lojadaana")
      end

      it "devolve o que está guardado e o motivo quando a Graph API falha" do
        stub_request(:get, "#{graph_facebook}/1784").with(query: hash_including({})).to_return(meta_error("Limite atingido"))

        get "/connectors/#{connector.id}/instagram-profile", headers: headers

        expect(response).to have_http_status(:ok)
        expect(json["refreshError"]).to eq("Failed to fetch Instagram profile")
        expect(json.dig("connector", "instagramUsername")).to eq("antigo")
      end

      it "avisa quando não há token da página" do
        connector.page_access_token = nil
        connector.save!

        get "/connectors/#{connector.id}/instagram-profile", headers: headers

        expect(response).to have_http_status(:ok)
        expect(json["refreshError"]).to eq("No page access token available")
      end
    end

    it "responde 422 em canal de outro tipo" do
      get "/connectors/#{create(:connector_messenger, organization: organization).id}/instagram-profile", headers: headers

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("connectorTypeMismatch")
    end
  end

  # `code` é o contrato de máquina; `message` é o que a pessoa lê quando a tela não conhece o
  # código. Sem a chave nos dois idiomas, a mensagem cairia no "não foi possível salvar".
  it "tem mensagem nos dois idiomas para todo código de erro destes controladores" do
    files = %w[
      app/controllers/connectors_controller.rb
      app/controllers/connector_templates_controller.rb
      app/controllers/connector_widgets_controller.rb
      app/controllers/media_downloads_controller.rb
      app/controllers/concerns/widget_throttling.rb
      app/controllers/widget/base_controller.rb
      app/controllers/widget/v1/context_controller.rb
      app/controllers/widget/v1/messages_controller.rb
      app/controllers/widget/v1/sessions_controller.rb
      app/controllers/widget/v1/visitor_controller.rb
    ]
    codes = files.flat_map { |file| Rails.root.join(file).read.scan(/code: ['"](\w+)['"]/).flatten }
    codes += MediaDownloadsController::ERROR_CODES.values

    expect(codes.uniq.size).to be > 20
    missing = codes.uniq.product(%i[pt-BR en]).reject { |code, locale| I18n.exists?("errors.#{code.underscore}", locale) }
    expect(missing).to eq([])
  end

  # O conector guarda credenciais de todo provedor, e a listagem é lida por qualquer conta da
  # organização. Esta é a conferência no corpo cru, para pegar também campo novo.
  describe "credenciais nunca saem no JSON" do
    let(:secret_keys) { /token|secret|api_?key|ciphertext|password/i }

    let!(:connectors) do
      [
        create(:connector_whatsapp_cloud, organization: organization, access_token: "SEGREDO-cloud-1", user_access_token: "SEGREDO-cloud-2"),
        create(:connector_whatsapp_web, organization: organization, api_key: "SEGREDO-web-1", instance_api_key: "SEGREDO-web-2", zapi_token: "SEGREDO-web-3"),
        create(:connector_zapi, organization: organization, token: "SEGREDO-zapi-1", account_token: "SEGREDO-zapi-2"),
        create(:connector_instagram, organization: organization, instagram_user_access_token: "SEGREDO-ig-1", page_access_token: "SEGREDO-ig-2"),
        create(:connector_messenger, organization: organization, page_access_token: "SEGREDO-page-1", instagram_user_access_token: "SEGREDO-page-2"),
        create(:connector_lead_chat, organization: organization, access_token: "SEGREDO-lead-1"),
        create(:connector_web_widget, organization: organization, signing_secret: "SEGREDO-widget-1")
      ]
    end

    def deep_keys(value)
      case value
      when Hash then value.keys + value.values.flat_map { |inner| deep_keys(inner) }
      when Array then value.flat_map { |inner| deep_keys(inner) }
      else []
      end
    end

    def expect_no_secrets
      expect(response.body).not_to include("SEGREDO")
      expect(deep_keys(json).grep(secret_keys)).to eq([])
    end

    it "na listagem, que qualquer conta lê" do
      get "/connectors", headers: auth_headers(member)

      expect(json["connectors"].size).to eq(connectors.size)
      expect_no_secrets
    end

    it "ao ver cada conector" do
      connectors.each do |connector|
        get "/connectors/#{connector.id}", headers: headers

        expect(response).to have_http_status(:ok)
        expect_no_secrets
      end
    end

    it "nas ações que devolvem o conector" do
      connectors.each do |connector|
        post "/connectors/#{connector.id}/pause", headers: headers, as: :json

        expect(response).to have_http_status(:ok)
        expect_no_secrets

        patch "/connectors/#{connector.id}", params: { sendCollaboratorName: true }, headers: headers, as: :json

        expect(response).to have_http_status(:ok)
        expect_no_secrets
      end
    end

    it "não manda nem o token público nem o de verificação na listagem" do
      get "/connectors", headers: headers

      connectors.select { |connector| connector.respond_to?(:verification_token) }.each do |connector|
        expect(response.body).not_to include(connector.verification_token)
      end
      expect(response.body).not_to include(connectors.last.public_token)
    end

    it "ao falhar no provedor, sem repetir a URL com o token" do
      connector = connectors.first
      stub_request(:get, %r{#{graph_sdk}/#{connector.phone_number_id}/whatsapp_business_profile}).to_timeout

      get "/connectors/#{connector.id}/business-profile", headers: headers

      expect(response).to have_http_status(:unprocessable_content)
      expect(response.body).not_to include("SEGREDO")
    end
  end
  describe "QR code em GET /connectors/:id" do
    let(:qr_connector) { create(:connector_whatsapp_web, organization: organization, status: :pending) }

    before { Rails.cache.write("qrcode.base64.#{qr_connector.id}", "data:image/png;base64,QR") }

    it "sai para quem configura" do
      get "/connectors/#{qr_connector.id}", headers: auth_headers(owner)

      expect(json.dig("extras", "qrCode")).to eq("data:image/png;base64,QR")
    end

    it "não sai para quem só atende" do
      member = create(:account, organization: organization, role: "member", access_role: create(:access_role, :member, organization: organization))

      get "/connectors/#{qr_connector.id}", headers: auth_headers(member)

      expect(response).to have_http_status(:ok)
      expect(json["extras"]).to eq({})
    end
  end

  describe "POST /connectors/:id/activate no Instagram" do
    it "manda o redirect_uri junto com o código, para religar depois de desconectar" do
      connector = create(:connector_instagram, organization: organization, status: :inactive, instagram_user_access_token: nil)
      exchange = stub_request(:post, MetaApiClient::OAuth::INSTAGRAM_OAUTH_URL)
                 .with(body: hash_including("code" => "novo-codigo", "redirect_uri" => "https://my.vekoo.app/volta"))
                 .to_return(status: 400, body: { error_message: "recusado" }.to_json, headers: { "Content-Type" => "application/json" })

      post "/connectors/#{connector.id}/activate", params: { code: "novo-codigo", redirectUri: "https://my.vekoo.app/volta" }, headers: auth_headers(owner), as: :json

      expect(exchange).to have_been_requested
    end
  end
end
