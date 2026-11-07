require "rails_helper"

# Cabeçalho que carrega segredo é só de escrita, como o token de um conector e o segredo de assinatura: a tela
# escondia o valor pelo nome, mas ele vinha em claro na resposta, e nos gatilhos para qualquer pessoa com
# `pipelines`. Manda de volta a máscara quem não quis mudar, e aí fica o que estava.
#
# Se o endereço mudar, a máscara não vale: senão bastaria trocar a URL para o segredo ir parar em outro servidor.
RSpec.describe "Cabeçalho com segredo", type: :request do
  let(:organization) { create(:organization) }
  let(:owner) { create(:account, organization: organization, role: "owner") }
  let(:headers) { auth_headers(owner) }
  let(:mask) { "••••••••" }

  describe "ação HTTP de webhook" do
    let(:hook) { create(:hook, organization: organization, status: "test") }
    let!(:action) do
      create(:hook_action_http, hook: hook, config: {
        "url" => "https://api.exemplo.test/pedidos",
        "http_method" => "POST",
        "headers" => [ { "key" => "Authorization", "value" => "Bearer token-real" }, { "key" => "X-Origem", "value" => "vekoo" } ]
      })
    end

    def config_in_response
      json["webhook"]["webhookActions"].find { |entry| entry["id"] == action.id }["config"]
    end

    def update(config)
      patch "/webhooks/#{hook.id}",
        params: { webhook: { webhookActions: [ { id: action.id, type: "HookAction::HttpRequest", config: config } ] } },
        headers: headers, as: :json
    end

    def stored_authorization
      action.reload.config["headers"].find { |header| header["key"] == "Authorization" }["value"]
    end

    it "não sai da API, e o resto dos cabeçalhos sai" do
      get "/webhooks/#{hook.id}", headers: headers, as: :json

      expect(response.body).not_to include("token-real")
      expect(config_in_response["headers"]).to contain_exactly(
        { "key" => "Authorization", "value" => mask }, { "key" => "X-Origem", "value" => "vekoo" }
      )
    end

    it "nem na listagem" do
      get "/webhooks", headers: headers, as: :json

      expect(response.body).not_to include("token-real")
    end

    it "salvar sem mexer mantém o valor" do
      update(url: "https://api.exemplo.test/pedidos", headers: [ { key: "Authorization", value: mask }, { key: "X-Origem", value: "outro" } ])

      expect(response).to have_http_status(:ok)
      expect(stored_authorization).to eq("Bearer token-real")
      expect(response.body).not_to include("token-real")
    end

    it "escrever outro valor troca" do
      update(url: "https://api.exemplo.test/pedidos", headers: [ { key: "Authorization", value: "Bearer novo" } ])

      expect(response).to have_http_status(:ok)
      expect(stored_authorization).to eq("Bearer novo")
    end

    it "trocar o endereço não leva o segredo junto" do
      update(url: "https://servidor-de-quem-quer-o-token.test/", headers: [ { key: "Authorization", value: mask } ])

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("secretHeaderNeedsRetyping")
      expect(action.reload.config["url"]).to eq("https://api.exemplo.test/pedidos")
    end

    it "trocar o endereço só de http para https e vice-versa também exige digitar de novo" do
      update(url: "http://api.exemplo.test/pedidos", headers: [ { key: "Authorization", value: mask } ])

      expect(response).to have_http_status(:unprocessable_content)
    end

    it "trocar o endereço digitando de novo funciona" do
      update(url: "https://outro.exemplo.test/", headers: [ { key: "Authorization", value: "Bearer novo" } ])

      expect(response).to have_http_status(:ok)
      expect(stored_authorization).to eq("Bearer novo")
    end

    it "mudar só o caminho mantém" do
      update(url: "https://api.exemplo.test/outro/caminho", headers: [ { key: "Authorization", value: mask } ])

      expect(response).to have_http_status(:ok)
      expect(stored_authorization).to eq("Bearer token-real")
    end

    it "a máscara numa ação nova não tem o que manter" do
      patch "/webhooks/#{hook.id}",
        params: { webhook: { webhookActions: [ { type: "HookAction::HttpRequest", config: { url: "https://api.exemplo.test/", headers: [ { key: "Authorization", value: mask } ] } } ] } },
        headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
    end

    it "um cabeçalho renomeado não herda o valor" do
      update(url: "https://api.exemplo.test/pedidos", headers: [ { key: "X-Api-Key", value: mask } ])

      expect(response).to have_http_status(:unprocessable_content)
    end

    it "o pedido de verdade sai com o valor real" do
      stub_public_dns("api.exemplo.test")
      request = stub_request(:post, "https://api.exemplo.test/pedidos")
                .with(headers: { "Authorization" => "Bearer token-real" }).to_return(status: 200, body: "{}")

      action.perform({})

      expect(request).to have_been_requested
    end
  end

  describe "gatilho de pipeline" do
    let(:board) { create(:pipeline_board, organization: organization) }
    let(:trigger) do
      create(:pipeline_trigger, board: board, event_type: "card_moved", actions: [
        { "type" => "fire_webhook", "url" => "https://api.exemplo.test/gancho", "method" => "POST",
          "headers" => { "X-Api-Key" => "chave-real", "X-Origem" => "vekoo" } }
      ])
    end
    let(:path) { "/pipelines/boards/#{board.id}/triggers" }
    # Quem trabalha no quadro: não configura a organização nem escreve script.
    let(:board_worker) do
      role = create(:access_role, organization: organization, name: "Quadro",
        permissions: AccessRole::BLANK_PERMISSIONS.merge("pipelines" => "all"))
      create(:account, organization: organization, role: "member", access_role: role)
    end

    def update(action)
      patch "#{path}/#{trigger.id}", params: { trigger: { actions: [ action ] } }, headers: headers, as: :json
    end

    it "quem trabalha no quadro não lê o valor" do
      trigger

      get path, headers: auth_headers(board_worker), as: :json

      expect(response).to have_http_status(:ok)
      expect(response.body).not_to include("chave-real")
      expect(json["triggers"].first["actions"].first["headers"]).to eq("X-Api-Key" => mask, "X-Origem" => "vekoo")
    end

    it "quem é dono também não" do
      trigger

      get path, headers: headers, as: :json

      expect(response.body).not_to include("chave-real")
    end

    it "salvar sem mexer mantém o valor" do
      update(type: "fire_webhook", url: "https://api.exemplo.test/gancho", method: "POST", headers: { "X-Api-Key" => mask })

      expect(response).to have_http_status(:ok)
      expect(trigger.reload.actions.first["headers"]).to eq("X-Api-Key" => "chave-real")
    end

    it "trocar o endereço não leva o segredo junto" do
      update(type: "fire_webhook", url: "https://servidor-de-quem-quer-o-token.test/", method: "POST", headers: { "X-Api-Key" => mask })

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("secretHeaderNeedsRetyping")
      expect(trigger.reload.actions.first["url"]).to eq("https://api.exemplo.test/gancho")
    end

    it "criar com a máscara não tem o que manter" do
      post path,
        params: { trigger: { name: "Novo", eventType: "card_moved", actions: [ { type: "fire_webhook", url: "https://api.exemplo.test/gancho", headers: { "X-Api-Key" => mask } } ] } },
        headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
    end
  end

  # `GET /tool-catalog/:id`. O código de uma ferramenta instalada não sai por `/tools` (`locked`), e a tela do
  # catálogo só usa nome, descrição e parâmetros.
  describe "código das funções no catálogo de ferramentas" do
    it "não sai no detalhe" do
      account = create(:account, organization: organization, role: "owner")
      tool = create(:tool, function_templates: [
        { "name" => "consultar_cep", "description" => "Consulta", "js_code" => "return 'codigo-secreto';", "parameters" => [ { "name" => "cep", "type" => "string" } ] }
      ])

      get "/tool-catalog/#{tool.id}", headers: auth_headers(account), as: :json

      expect(response).to have_http_status(:ok)
      expect(response.body).not_to include("codigo-secreto")
      expect(json["tool"]["functionTemplates"].first).to include("name" => "consultar_cep", "description" => "Consulta")
      expect(json["tool"]["functionTemplates"].first["parameters"].first).to include("name" => "cep")
    end
  end
end
