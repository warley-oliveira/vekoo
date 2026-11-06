require "rails_helper"

RSpec.describe "Widget::V1::Sessions", type: :request do
  let(:connector) { create(:connector_web_widget) }
  let(:pk) { connector.public_token }

  describe "POST /widget/v1/session" do
    it "devolve o JWT do visitante e a aparência" do
      post "/widget/v1/session", params: { pk: pk, visitorId: "visitor-1" }, as: :json

      expect(response).to have_http_status(:ok)
      expect(json["visitorId"]).to eq("visitor-1")

      decoded = connector.decode_visitor_jwt(json["visitorJwt"])
      expect(decoded["visitor_id"]).to eq("visitor-1")
      expect(decoded["connector_id"]).to eq(connector.id.to_s)

      expect(json["config"]).to include(
        "primaryColor" => connector.primary_color,
        "position" => connector.position,
        "welcomeMessage" => connector.welcome_message,
        "botDisplayName" => connector.bot_display_name,
        "preChatFields" => connector.pre_chat_fields
      )
    end

    it "emite o JWT com validade de 24 horas" do
      post "/widget/v1/session", params: { pk: pk, visitorId: "visitor-1" }, as: :json

      exp = connector.decode_visitor_jwt(json["visitorJwt"])["exp"]
      expect(Time.at(exp)).to be_within(1.minute).of(24.hours.from_now)
    end

    it "não vaza o segredo de assinatura nem a configuração interna" do
      post "/widget/v1/session", params: { pk: pk, visitorId: "visitor-1" }, as: :json

      expect(response.body).not_to include(connector.signing_secret)
      expect(json["config"].keys).not_to include("signingSecret", "allowedOrigins", "rateLimitPerMin", "dailyMessageCap", "publicToken")
    end

    it "recusa token público desconhecido com 401" do
      post "/widget/v1/session", params: { pk: "pk_widget_unknown_xyz", visitorId: "visitor-spec-1" }, as: :json

      expect(response).to have_http_status(:unauthorized)
      expect(json.dig("error", "code")).to eq("unauthorized")
    end

    it "recusa token público malformado com 401" do
      post "/widget/v1/session", params: { pk: "not-a-pk", visitorId: "visitor-spec-1" }, as: :json

      expect(response).to have_http_status(:unauthorized)
    end

    it "não aceita mapa no lugar do token público" do
      post "/widget/v1/session", params: { pk: { "$ne" => "" }, visitorId: "visitor-spec-1" }, as: :json

      expect(response).to have_http_status(:unauthorized)
    end

    it "responde 400 sem visitante" do
      post "/widget/v1/session", params: { pk: pk }, as: :json

      expect(response).to have_http_status(:bad_request)
      expect(json["error"]).to include("code" => "invalidVisitorId", "field" => "visitorId")
    end

    it "responde 400 com visitante fora do formato" do
      post "/widget/v1/session", params: { pk: pk, visitorId: "../etc/passwd" }, as: :json

      expect(response).to have_http_status(:bad_request)
    end

    it "responde 400 com visitante curto demais" do
      post "/widget/v1/session", params: { pk: pk, visitorId: "a" * 7 }, as: :json

      expect(response).to have_http_status(:bad_request)
    end

    it "responde 400 com visitante longo demais" do
      post "/widget/v1/session", params: { pk: pk, visitorId: "a" * 65 }, as: :json

      expect(response).to have_http_status(:bad_request)
    end

    it "aceita os tamanhos no limite" do
      [ 8, 64 ].each do |size|
        post "/widget/v1/session", params: { pk: pk, visitorId: "a" * size }, as: :json

        expect(response).to have_http_status(:ok)
      end
    end

    it "aceita o uuid que o widget gera" do
      post "/widget/v1/session", params: { pk: pk, visitorId: SecureRandom.uuid }, as: :json

      expect(response).to have_http_status(:ok)
    end

    it "confere o visitante antes do token, sem dizer se o token existe" do
      post "/widget/v1/session", params: { pk: "pk_widget_unknown_xyz", visitorId: "x" }, as: :json

      expect(response).to have_http_status(:bad_request)
    end

    it "responde 401 com token público curto demais" do
      post "/widget/v1/session", params: { pk: "pk_widget_abc", visitorId: "visitor-spec-1" }, as: :json

      expect(response).to have_http_status(:unauthorized)
    end

    it "responde 403 com o conector pausado" do
      connector.set(status_cd: "paused")

      post "/widget/v1/session", params: { pk: pk, visitorId: "visitor-spec-1" }, as: :json

      expect(response).to have_http_status(:forbidden)
    end

    it "responde 403 com o conector desligado" do
      connector.deactivate

      post "/widget/v1/session", params: { pk: pk, visitorId: "visitor-spec-1" }, as: :json

      expect(response).to have_http_status(:forbidden)
      expect(json.dig("error", "code")).to eq("connectorInactive")
    end

    context "com lista de origens" do
      before { connector.update!(allowed_origins: [ "https://shop.example.com" ]) }

      it "responde 403 para origem de fora" do
        post "/widget/v1/session",
             params: { pk: pk, visitorId: "visitor-spec-1" },
             headers: { "Origin" => "https://evil.com" }, as: :json

        expect(response).to have_http_status(:forbidden)
        expect(json.dig("error", "code")).to eq("originNotAllowed")
      end

      it "responde 403 sem origem" do
        post "/widget/v1/session", params: { pk: pk, visitorId: "visitor-spec-1" }, as: :json

        expect(response).to have_http_status(:forbidden)
      end

      it "aceita origem da lista" do
        post "/widget/v1/session",
             params: { pk: pk, visitorId: "visitor-spec-1" },
             headers: { "Origin" => "https://shop.example.com" }, as: :json

        expect(response).to have_http_status(:ok)
      end
    end
  end

  describe "GET /widget/v1/config" do
    it "devolve a aparência sem emitir JWT" do
      get "/widget/v1/config", params: { pk: pk }

      expect(response).to have_http_status(:ok)
      expect(json["config"].keys).to include("primaryColor", "position", "welcomeMessage", "customCss")
      expect(json).not_to have_key("visitorJwt")
    end

    it "não vaza o segredo de assinatura" do
      get "/widget/v1/config", params: { pk: pk }

      expect(response.body).not_to include(connector.signing_secret)
    end

    it "recusa token público desconhecido com 401" do
      get "/widget/v1/config", params: { pk: "pk_widget_unknown" }

      expect(response).to have_http_status(:unauthorized)
    end

    it "recusa sem token público" do
      get "/widget/v1/config"

      expect(response).to have_http_status(:unauthorized)
    end

    it "responde 403 com o conector desligado" do
      connector.deactivate

      get "/widget/v1/config", params: { pk: pk }

      expect(response).to have_http_status(:forbidden)
      expect(json.dig("error", "code")).to eq("connectorInactive")
    end

    it "responde 403 para origem de fora" do
      connector.update!(allowed_origins: [ "https://shop.example.com" ])

      get "/widget/v1/config", params: { pk: pk }, headers: { "Origin" => "https://evil.com" }

      expect(response).to have_http_status(:forbidden)
      expect(json.dig("error", "code")).to eq("originNotAllowed")
    end
  end

  describe "idioma" do
    it "responde o erro no idioma pedido" do
      post "/widget/v1/session", params: { pk: pk }, headers: { "Accept-Language" => "en" }, as: :json

      expect(json.dig("error", "message")).to eq(I18n.t("errors.invalid_visitor_id", locale: :en))
    end
  end

  describe "CORS" do
    # O widget roda no site do cliente: a API dele aceita qualquer origem, e quem filtra é o
    # conector (allowed_origins), não a camada de CORS.
    it "libera o preflight de qualquer origem" do
      options "/widget/v1/session",
              headers: {
                "Origin" => "https://loja-do-cliente.com",
                "Access-Control-Request-Method" => "POST",
                "Access-Control-Request-Headers" => "content-type"
              }

      expect(response.headers["Access-Control-Allow-Origin"]).to eq("*")
      expect(response.headers["Access-Control-Allow-Methods"]).to include("POST")
    end

    it "não libera o resto da API para uma origem de fora" do
      options "/connectors",
              headers: {
                "Origin" => "https://loja-do-cliente.com",
                "Access-Control-Request-Method" => "GET"
              }

      expect(response.headers["Access-Control-Allow-Origin"]).to be_nil
    end
  end
end
