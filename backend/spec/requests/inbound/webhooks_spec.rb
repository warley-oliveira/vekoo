require "rails_helper"

# Os controladores de webhook: só validam o conector, respondem 2xx e enfileiram. O caminho
# inteiro até o dispatcher está em end_to_end_spec.rb; os detalhes de cada canal, em
# spec/services/inbound/.
#
# Não há sessão nem permissão aqui: quem chama é o provedor, e o que se valida é o conector da
# URL (ou o token do desafio da Meta). Por isso nenhum destes endpoints responde 401 ou 403.
RSpec.describe "Controladores de webhook", type: :request do
  include ActiveJob::TestHelper
  include InboundHelpers

  let(:organization) { create(:organization) }
  let(:body) { { qualquer: "coisa", lista: [ 1, 2 ], acentuação: "João" } }

  before { allow(Flows::InboundDispatcher).to receive(:call) }

  # O corpo vai cru para o job: `{}`, parâmetro de rota ou wrapper não podem entrar nele.
  def expect_enqueued(*arguments)
    expect(Inbound::ProcessWebhookJob).to have_been_enqueued.with(arguments.first, body.to_json, *arguments.drop(1)).on_queue("critical")
  end

  describe "POST /inbound/whatsapp-cloud/:id" do
    let(:connector) { create(:connector_whatsapp_cloud, organization: organization) }
    let(:path) { "/inbound/whatsapp-cloud/#{connector.id}" }

    it "responde 200 e enfileira o corpo cru, sem sessão" do
      post path, params: body, as: :json

      expect(response).to have_http_status(:ok)
      expect(response.body).to be_empty
      expect_enqueued("whatsapp_cloud", connector.id.to_s)
    end

    it "não processa nada na thread da requisição" do
      expect(Chats::Locator).not_to receive(:find_or_create)

      post path, params: body, as: :json
    end

    it "responde 200 mesmo com payload vazio" do
      post path, params: {}, as: :json

      expect(response).to have_http_status(:ok)
    end

    # O argumento do job vira JSON no Sidekiq, que recusa o que não for UTF-8 válido.
    describe "encoding do corpo" do
      def enqueued_body
        ActiveJob::Base.queue_adapter.enqueued_jobs.last[:args].second
      end

      it "corpo com acento e emoji chega ao job em UTF-8" do
        post path, params: { nome: "João 🌸" }, as: :json

        expect(enqueued_body.encoding).to eq(Encoding::UTF_8)
        expect(JSON.parse(JSON.parse(JSON.generate([ enqueued_body ])).first)).to eq("nome" => "João 🌸")
      end

      it "byte inválido não vira 500: o job recebe o corpo limpo" do
        post path, params: "{\"nome\":\"Jo\xE3o\"}".b, headers: { "CONTENT_TYPE" => "text/plain" }

        expect(response).to have_http_status(:ok)
        expect(enqueued_body).to be_valid_encoding
        expect { JSON.generate([ enqueued_body ]) }.not_to raise_error
        expect(JSON.parse(enqueued_body)["nome"]).to start_with("Jo")
      end

      it "o corpo do request não muda de encoding por causa disso" do
        post path, params: { nome: "João" }, as: :json

        expect(request.raw_post.encoding).to eq(Encoding::BINARY)
      end
    end

    # Como em produção: a página de detalhes do ambiente de teste relê os parâmetros e quebra.
    it "JSON quebrado responde 400, nunca 5xx, sem enfileirar" do
      env_config = Rails.application.env_config
      detailed = env_config["action_dispatch.show_detailed_exceptions"]

      begin
        env_config["action_dispatch.show_detailed_exceptions"] = false
        post path, params: "{quebrado", headers: { "CONTENT_TYPE" => "application/json" }
      ensure
        env_config["action_dispatch.show_detailed_exceptions"] = detailed
      end

      expect(response).to have_http_status(:bad_request)
      expect(Inbound::ProcessWebhookJob).not_to have_been_enqueued
    end

    it "responde 404 para conector que não existe, sem enfileirar" do
      post "/inbound/whatsapp-cloud/#{BSON::ObjectId.new}", params: body, as: :json

      expect(response).to have_http_status(:not_found)
      expect(json.dig("error", "code")).to eq("notFound")
      expect(Inbound::ProcessWebhookJob).not_to have_been_enqueued
    end

    it "responde 404 para conector de outro tipo" do
      other = create(:connector_whatsapp_web, organization: organization)

      post "/inbound/whatsapp-cloud/#{other.id}", params: body, as: :json

      expect(response).to have_http_status(:not_found)
    end

    # O webhook nunca devolve 5xx: se devolvesse, a Meta reentregaria para sempre.
    it "nunca responde erro quando o processamento explode" do
      allow(Chats::Locator).to receive(:find_or_create).and_raise(StandardError, "boom")
      payload = {
        entry: [ { id: connector.waba_id.to_s, changes: [ { value: {
          metadata: { phone_number_id: connector.phone_number_id.to_s },
          messages: [ { id: "wamid.1", from: "5531971810932", type: "text", text: { body: "Olá" } } ]
        } } ] } ]
      }

      perform_enqueued_jobs(only: Inbound::ProcessWebhookJob) { post path, params: payload, as: :json }

      expect(response).to have_http_status(:ok)
      expect(Flows::InboundDispatcher).not_to have_received(:call)
    end

    describe "verificação da Meta" do
      def verify(token, connector_id: connector.id, verb: :get)
        public_send(verb, "/inbound/whatsapp-cloud/#{connector_id}?#{{ 'hub.mode' => 'subscribe', 'hub.verify_token' => token, 'hub.challenge' => 'challenge-123' }.to_query}")
      end

      it "devolve o desafio cru com o token certo" do
        verify(connector.verification_token)

        expect(response).to have_http_status(:ok)
        expect(response.body).to eq("challenge-123")
      end

      it "recusa com 400 quando o token não bate" do
        verify("errado")

        expect(response).to have_http_status(:bad_request)
        expect(response.body).not_to include("challenge-123")
      end

      it "recusa com 400 sem token nenhum" do
        verify("")

        expect(response).to have_http_status(:bad_request)
      end

      it "não aceita o token de outro conector" do
        verify(create(:connector_whatsapp_cloud, organization: organization).verification_token)

        expect(response).to have_http_status(:bad_request)
      end

      it "responde 404 para conector que não existe" do
        verify("qualquer", connector_id: BSON::ObjectId.new)

        expect(response).to have_http_status(:not_found)
      end

      it "não enfileira" do
        verify(connector.verification_token)

        expect(Inbound::ProcessWebhookJob).not_to have_been_enqueued
      end
    end
  end

  describe "GET e POST /inbound/meta-messaging" do
    let(:path) { "/inbound/meta-messaging" }

    it "responde 200 e enfileira, sem conector: quem diz é a entrada" do
      post path, params: body, as: :json

      expect(response).to have_http_status(:ok)
      expect_enqueued("meta_messaging", nil)
    end

    describe "verificação da Meta" do
      def verify(token)
        get path, params: { "hub.mode" => "subscribe", "hub.verify_token" => token, "hub.challenge" => "777" }
      end

      it "devolve o desafio com o token da plataforma" do
        stub_env("META_MESSAGING_VERIFY_TOKEN" => "segredo")

        verify("segredo")

        expect(response).to have_http_status(:ok)
        expect(response.body).to eq("777")
      end

      it "recusa com 400 quando o token não bate" do
        stub_env("META_MESSAGING_VERIFY_TOKEN" => "segredo")

        verify("errado")

        expect(response).to have_http_status(:bad_request)
      end

      it "sem token configurado, recusa até o pedido com token vazio" do
        stub_env("META_MESSAGING_VERIFY_TOKEN" => nil)

        verify("")

        expect(response).to have_http_status(:bad_request)
      end
    end
  end

  describe "POST /inbound/evolution/:codename" do
    let(:connector) { create(:connector_whatsapp_web, organization: organization) }
    let(:codename) { "IWA-#{connector.id}" }

    it "responde 200 e enfileira pelo nome da instância" do
      post inbound_path(connector, :evolution, codename), params: body, as: :json

      expect(response).to have_http_status(:ok)
      expect_enqueued("evolution", codename)
    end

    it "aceita instância que está com o provedor AIVA" do
      aiva = create(:connector_whatsapp_web, :aiva, organization: organization)

      post inbound_path(aiva, :evolution, "IWA-#{aiva.id}"), params: body, as: :json

      expect(response).to have_http_status(:ok)
    end

    {
      "sem o prefixo" => ->(connector) { connector.id.to_s },
      "com outro prefixo" => ->(connector) { "IZA-#{connector.id}" },
      "que não existe" => ->(_connector) { "IWA-#{BSON::ObjectId.new}" },
      "com id inválido" => ->(_connector) { "IWA-nao-e-um-id" }
    }.each do |case_name, codename_for|
      it "responde 404 para instância #{case_name}" do
        post "/inbound/evolution/#{codename_for.call(connector)}", params: body, as: :json

        expect(response).to have_http_status(:not_found)
        expect(Inbound::ProcessWebhookJob).not_to have_been_enqueued
      end
    end

    it "responde 404 para conector de outro tipo com o prefixo certo" do
      cloud = create(:connector_whatsapp_cloud, organization: organization)

      post "/inbound/evolution/IWA-#{cloud.id}", params: body, as: :json

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "POST /inbound/lead-chat/:id/event" do
    let(:connector) { create(:connector_lead_chat, organization: organization) }

    it "responde 200 e enfileira" do
      post inbound_path(connector, :lead_chat_event, connector.id), params: body, as: :json

      expect(response).to have_http_status(:ok)
      expect_enqueued("lead_chat", connector.id.to_s)
    end

    it "responde 404 para conector que não existe" do
      post "/inbound/lead-chat/#{BSON::ObjectId.new}/event", params: body, as: :json

      expect(response).to have_http_status(:not_found)
    end

    it "responde 404 para conector de outro tipo" do
      post "/inbound/lead-chat/#{create(:connector_whatsapp_cloud, organization: organization).id}/event", params: body, as: :json

      expect(response).to have_http_status(:not_found)
    end
  end

  # A Z-API saiu: webhook antigo configurado no painel dela cai na rota que não existe.
  it "responde 404 nas rotas antigas da Z-API, sem enfileirar nada" do
    connector = create(:connector_whatsapp_web, organization: organization)

    post "/inbound/zapi/#{connector.id}/on-message-received?token=#{connector.inbound_token}", params: body, as: :json

    expect(response).to have_http_status(:not_found)
    expect(Inbound::ProcessWebhookJob).not_to have_been_enqueued
  end

  it "não exige sessão, e sessão de outra organização não muda nada" do
    connector = create(:connector_lead_chat, organization: organization)
    outsider = create(:account, organization: create(:organization))

    post inbound_path(connector, :lead_chat_event, connector.id), params: body, headers: auth_headers(outsider), as: :json

    expect(response).to have_http_status(:ok)
  end
end
