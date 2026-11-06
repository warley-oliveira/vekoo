require "rails_helper"

# As defesas da API pública do widget. Os limites por minuto só valem em teste com
# WIDGET_THROTTLE_TESTS; o cache de teste é de memória, então os contadores são de verdade.
RSpec.describe "Widget::V1 segurança", type: :request do
  include ActiveSupport::Testing::TimeHelpers

  after { travel_back }

  let(:connector) { create(:connector_web_widget, pre_chat_fields: "name") }
  let(:pk) { connector.public_token }

  def bearer(token)
    { "Authorization" => "Bearer #{token}" }
  end

  def jwt_headers(visitor_id = "visitor-security")
    bearer(connector.issue_visitor_jwt(visitor_id))
  end

  describe "sessão do visitante" do
    def call_with(verb, path, body, headers)
      public_send(verb, path, params: body, headers: headers, as: (:json if body))
    end

    # Todo endpoint que exige a sessão do visitante.
    [
      [ :post, "/widget/v1/messages", { content: "olá" } ],
      [ :get, "/widget/v1/messages", nil ],
      [ :post, "/widget/v1/visitor", { name: "Maria" } ],
      [ :get, "/widget/v1/visitor", nil ],
      [ :put, "/widget/v1/context", { context: { page: { title: "Home" } } } ]
    ].each do |verb, path, body|
      describe "#{verb.upcase} #{path}" do
        it "responde 401 sem token, no formato de erro da API" do
          call_with(verb, path, body, {})

          expect(response).to have_http_status(:unauthorized)
          expect(json.dig("error", "code")).to eq("unauthorized")
        end

        it "responde 401 com token que não é JWT" do
          call_with(verb, path, body, bearer("garbage"))

          expect(response).to have_http_status(:unauthorized)
        end

        it "responde 401 com a sessão da plataforma no lugar do JWT" do
          call_with(verb, path, body, auth_headers(create(:account)))

          expect(response).to have_http_status(:unauthorized)
        end

        it "responde 401 com o token fora do esquema Bearer" do
          call_with(verb, path, body, { "Authorization" => connector.issue_visitor_jwt("visitor-security") })

          expect(response).to have_http_status(:unauthorized)
        end

        it "responde 401 com JWT vencido" do
          call_with(verb, path, body, bearer(connector.issue_visitor_jwt("visitor-security", ttl: -1.second)))

          expect(response).to have_http_status(:unauthorized)
        end

        it "responde 401 com JWT assinado por outro conector" do
          other = create(:connector_web_widget)
          foreign = JWT.encode({ visitor_id: "visitor-security", connector_id: connector.id.to_s, exp: 1.hour.from_now.to_i }, other.signing_secret, "HS256")

          call_with(verb, path, body, bearer(foreign))

          expect(response).to have_http_status(:unauthorized)
        end

        it "responde 401 com JWT sem assinatura (alg none)" do
          unsigned = JWT.encode({ visitor_id: "visitor-security", connector_id: connector.id.to_s, exp: 1.hour.from_now.to_i }, nil, "none")

          call_with(verb, path, body, bearer(unsigned))

          expect(response).to have_http_status(:unauthorized)
        end

        it "responde 401 com JWT cujo conteúdo não é um mapa" do
          call_with(verb, path, body, bearer(JWT.encode([ "qualquer", "coisa" ], connector.signing_secret, "HS256")))

          expect(response).to have_http_status(:unauthorized)
        end

        it "responde 401 com operador do Mongo no lugar do id do conector" do
          injected = JWT.encode({ visitor_id: "visitor-security", connector_id: { "$foo" => 1 }, exp: 1.hour.from_now.to_i }, "qualquer", "HS256")

          call_with(verb, path, body, bearer(injected))

          expect(response).to have_http_status(:unauthorized)
        end

        it "responde 401 com visitante fora do formato dentro do JWT" do
          bogus = JWT.encode({ visitor_id: "../etc/passwd", connector_id: connector.id.to_s, exp: 1.hour.from_now.to_i }, connector.signing_secret, "HS256")

          call_with(verb, path, body, bearer(bogus))

          expect(response).to have_http_status(:unauthorized)
        end

        it "responde 401 com o conector desligado" do
          headers = jwt_headers
          connector.deactivate

          call_with(verb, path, body, headers)

          expect(response).to have_http_status(:unauthorized)
        end

        it "responde 401 depois de regenerar as credenciais do conector" do
          headers = jwt_headers
          connector.regenerate_credentials!

          call_with(verb, path, body, headers)

          expect(response).to have_http_status(:unauthorized)
        end

        it "responde 403 com origem fora da lista do conector" do
          connector.update!(allowed_origins: [ "https://shop.example.com" ])

          call_with(verb, path, body, jwt_headers.merge("Origin" => "https://evil.com"))

          expect(response).to have_http_status(:forbidden)
          expect(json.dig("error", "code")).to eq("originNotAllowed")
        end
      end
    end

    it "aceita origem da lista" do
      connector.update!(allowed_origins: [ "https://shop.example.com" ])

      get "/widget/v1/visitor", headers: jwt_headers.merge("Origin" => "https://shop.example.com")

      expect(response).to have_http_status(:ok)
    end
  end

  describe "limites por minuto" do
    around do |example|
      ENV["WIDGET_THROTTLE_TESTS"] = "1"
      example.run
    ensure
      ENV.delete("WIDGET_THROTTLE_TESTS")
    end

    def expect_rate_limited
      expect(response).to have_http_status(:too_many_requests)
      expect(json.dig("error", "code")).to eq("rateLimited")
      expect(json.dig("error", "details", "retryAfter")).to eq(60)
    end

    describe "POST /widget/v1/session por IP" do
      def start_session(ip: "203.0.113.1")
        post "/widget/v1/session", params: { pk: pk, visitorId: "visitor-burst" }, headers: { "REMOTE_ADDR" => ip }, as: :json
      end

      it "responde 429 depois de 30 pedidos" do
        30.times do
          start_session
          expect(response).to have_http_status(:ok)
        end

        start_session

        expect_rate_limited
      end

      it "conta cada IP separado" do
        31.times { start_session }

        start_session(ip: "203.0.113.2")

        expect(response).to have_http_status(:ok)
      end
    end

    it "responde 429 depois de 200 sessões por token público, mesmo vindo de muitos IPs" do
      7.times do |i|
        30.times do
          post "/widget/v1/session", params: { pk: pk, visitorId: "visitor-burst" }, headers: { "REMOTE_ADDR" => "203.0.113.#{i + 10}" }, as: :json
        end
      end

      expect_rate_limited
      expect(json.dig("error", "details", "retryAfter")).to eq(60)
    end

    it "responde 429 depois de 60 leituras de config por IP" do
      60.times do
        get "/widget/v1/config", params: { pk: pk }
        expect(response).to have_http_status(:ok)
      end

      get "/widget/v1/config", params: { pk: pk }

      expect_rate_limited
    end

    it "responde 429 depois de 120 chamadas por IP, em qualquer endpoint" do
      2.times do |i|
        60.times { get "/widget/v1/messages", headers: jwt_headers("visitor-global-#{i}") }
      end
      expect(response).to have_http_status(:ok)

      get "/widget/v1/messages", headers: jwt_headers("visitor-global-3")

      expect_rate_limited
    end

    it "responde 429 depois de 60 chamadas de mensagens por visitante" do
      60.times do
        get "/widget/v1/messages", headers: jwt_headers
        expect(response).to have_http_status(:ok)
      end

      get "/widget/v1/messages", headers: jwt_headers

      expect_rate_limited
    end

    it "não corta outro visitante quando um estoura o limite de mensagens" do
      61.times { get "/widget/v1/messages", headers: jwt_headers }

      get "/widget/v1/messages", headers: jwt_headers("visitor-tranquilo")

      expect(response).to have_http_status(:ok)
    end

    it "responde 429 depois de 30 atualizações de contexto por visitante" do
      30.times do
        put "/widget/v1/context", params: { context: { page: { title: "Home" } } }, headers: jwt_headers, as: :json
        expect(response).to have_http_status(:accepted)
      end

      put "/widget/v1/context", params: { context: { page: { title: "Home" } } }, headers: jwt_headers, as: :json

      expect_rate_limited
    end

    it "responde 429 depois de 30 chamadas de visitante por IP" do
      30.times do
        get "/widget/v1/visitor", headers: jwt_headers
        expect(response).to have_http_status(:ok)
      end

      get "/widget/v1/visitor", headers: jwt_headers

      expect_rate_limited
    end

    it "conta a tentativa com token inválido no limite por IP" do
      120.times { get "/widget/v1/messages", headers: bearer("garbage") }

      get "/widget/v1/messages", headers: bearer("garbage")

      expect_rate_limited
    end

    it "libera de novo no minuto seguinte" do
      31.times { post "/widget/v1/session", params: { pk: pk, visitorId: "visitor-burst" }, as: :json }
      expect(response).to have_http_status(:too_many_requests)

      travel 61.seconds

      post "/widget/v1/session", params: { pk: pk, visitorId: "visitor-burst" }, as: :json

      expect(response).to have_http_status(:ok)
    end

    it "não vale sem a chave de teste, para o resto das specs não dependerem do relógio" do
      with_env("WIDGET_THROTTLE_TESTS" => nil) do
        31.times { post "/widget/v1/session", params: { pk: pk, visitorId: "visitor-burst" }, as: :json }

        expect(response).to have_http_status(:ok)
      end
    end
  end

  describe "campos grandes" do
    it "corta o nome no limite" do
      post "/widget/v1/visitor", params: { name: "A" * 200 }, headers: jwt_headers, as: :json

      expect(response).to have_http_status(:ok)
      chat = Chat.where(connector_id: connector.id, external_id: "visitor-security").take
      expect(chat.user_name.length).to eq(WidgetThrottling::MAX_NAME_LENGTH)
    end

    it "corta o telefone no limite" do
      post "/widget/v1/visitor", params: { name: "Maria", phone: "1" * 200 }, headers: jwt_headers, as: :json

      chat = Chat.where(connector_id: connector.id, external_id: "visitor-security").take
      expect(chat.custom_attributes["phone"].length).to eq(WidgetThrottling::MAX_PHONE_LENGTH)
    end
  end

  describe "cotas diárias" do
    before { allow(Flows::InboundDispatcher).to receive(:call) }

    def send_message(content, headers: jwt_headers("visitor-cap-1"))
      post "/widget/v1/messages", params: { content: content }, headers: headers, as: :json
    end

    describe "mensagens" do
      before { connector.update!(daily_message_cap: 2, rate_limit_per_min: 100) }

      it "responde 429 ao atingir a cota" do
        2.times do |i|
          send_message("msg #{i}")
          expect(response).to have_http_status(:created)
        end

        send_message("acima da cota")

        expect(response).to have_http_status(:too_many_requests)
        expect(json.dig("error", "code")).to eq("dailyQuotaExceeded")
      end

      it "vale para o conector inteiro, somando os visitantes" do
        send_message("a", headers: jwt_headers("visitor-cap-1"))
        send_message("b", headers: jwt_headers("visitor-cap-2"))

        send_message("c", headers: jwt_headers("visitor-cap-3"))

        expect(response).to have_http_status(:too_many_requests)
      end

      it "não atrapalha outro conector" do
        2.times { |i| send_message("msg #{i}") }

        other = create(:connector_web_widget, daily_message_cap: 2)
        post "/widget/v1/messages", params: { content: "oi" }, headers: bearer(other.issue_visitor_jwt("visitor-cap-1")), as: :json

        expect(response).to have_http_status(:created)
      end

      it "não corta a leitura do histórico" do
        3.times { |i| send_message("msg #{i}") }

        get "/widget/v1/messages", headers: jwt_headers("visitor-cap-1")

        expect(response).to have_http_status(:ok)
      end

      it "libera no dia seguinte" do
        3.times { |i| send_message("msg #{i}") }
        expect(response).to have_http_status(:too_many_requests)

        travel 1.day + 1.minute

        send_message("novo dia")

        expect(response).to have_http_status(:created)
      end
    end

    it "não limita mensagens com cota zero" do
      connector.update!(daily_message_cap: 0, rate_limit_per_min: 100)

      5.times do |i|
        send_message("msg #{i}")
        expect(response).to have_http_status(:created)
      end
    end

    describe "visitantes" do
      before { connector.update!(daily_visitor_cap: 1) }

      it "responde 429 para visitante novo pelo formulário" do
        post "/widget/v1/visitor", params: { name: "Maria" }, headers: jwt_headers("visitor-cap-A"), as: :json
        expect(response).to have_http_status(:ok)

        post "/widget/v1/visitor", params: { name: "Joana" }, headers: jwt_headers("visitor-cap-B"), as: :json

        expect(response).to have_http_status(:too_many_requests)
        expect(json.dig("error", "code")).to eq("visitorQuotaExceeded")
        expect(Chat.where(connector_id: connector.id).count).to eq(1)
      end

      it "responde 429 para visitante novo pela primeira mensagem" do
        send_message("oi", headers: jwt_headers("visitor-cap-A"))
        expect(response).to have_http_status(:created)

        send_message("oi", headers: jwt_headers("visitor-cap-B"))

        expect(response).to have_http_status(:too_many_requests)
        expect(json.dig("error", "code")).to eq("visitorQuotaExceeded")
        expect(Chat.where(connector_id: connector.id).count).to eq(1)
      end

      it "não conta atualização do mesmo visitante" do
        post "/widget/v1/visitor", params: { name: "Maria" }, headers: jwt_headers("visitor-cap-A"), as: :json
        post "/widget/v1/visitor", params: { name: "Maria S." }, headers: jwt_headers("visitor-cap-A"), as: :json

        expect(response).to have_http_status(:ok)
      end

      it "deixa o visitante que já tem conversa continuar falando" do
        post "/widget/v1/visitor", params: { name: "Maria" }, headers: jwt_headers("visitor-cap-A"), as: :json

        send_message("oi", headers: jwt_headers("visitor-cap-A"))

        expect(response).to have_http_status(:created)
      end

      it "libera no dia seguinte" do
        send_message("oi", headers: jwt_headers("visitor-cap-A"))

        travel 1.day + 1.minute

        send_message("oi", headers: jwt_headers("visitor-cap-B"))

        expect(response).to have_http_status(:created)
      end
    end

    it "não limita visitantes com cota zero" do
      connector.update!(daily_visitor_cap: 0)

      3.times do |i|
        post "/widget/v1/visitor", params: { name: "Maria" }, headers: jwt_headers("visitor-cap-#{i}a"), as: :json
        expect(response).to have_http_status(:ok)
      end
    end
  end
end
