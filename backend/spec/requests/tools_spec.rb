require "rails_helper"

RSpec.describe "Ferramentas", type: :request do
  include ActiveJob::TestHelper

  let(:organization) { create(:organization) }
  let(:account) { create(:account, organization: organization) }
  let(:headers) { auth_headers(account) }
  let(:blank_role) { create(:access_role, organization: organization, permissions: AccessRole::BLANK_PERMISSIONS) }
  let(:no_access_headers) { auth_headers(create(:account, organization: organization, role: "member", access_role: blank_role)) }
  let(:other_organization) { create(:organization) }

  def installed_function(attributes = {})
    installation = create(:tool_installation, organization: organization)
    create(:tool_function, organization: organization, tool_installation_id: installation.id.to_s, **attributes)
  end

  describe "GET /tools" do
    it "lista as da organização, em ordem de nome, com a busca" do
      create(:tool_function, organization: organization, name: "calcular_frete")
      create(:tool_function, organization: organization, name: "abrir_chamado")
      create(:tool_function, organization: other_organization, name: "alheia")

      get "/tools", headers: headers, as: :json
      expect(response).to have_http_status(:ok)
      expect(json["tools"].pluck("name")).to eq(%w[abrir_chamado calcular_frete])
      expect(json["meta"]["total"]).to eq(2)

      get "/tools", params: { q: "FRETE" }, headers: headers
      expect(json["tools"].pluck("name")).to eq(%w[calcular_frete])
    end

    it "não mostra o código de quem veio do catálogo" do
      installed_function

      get "/tools", headers: headers, as: :json

      expect(json["tools"].first).to include("locked" => true, "jsCode" => nil, "parametersJson" => nil)
    end

    it "a lista curta dos seletores não traz código" do
      create(:tool_function, organization: organization, name: "calcular_frete")

      get "/tools", params: { summary: true }, headers: headers

      expect(json["tools"].first).to include("name" => "calcular_frete", "description" => "Consulta um CEP", "tool" => nil)
      expect(json["tools"].first).not_to have_key("jsCode")
    end

    it "401 e 403" do
      get "/tools", as: :json
      expect(response).to have_http_status(:unauthorized)

      get "/tools", headers: no_access_headers, as: :json
      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "GET /tools/:id" do
    it "404 em outra organização" do
      get "/tools/#{create(:tool_function, organization: other_organization).id}", headers: headers, as: :json

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "POST /tools" do
    let(:valid) do
      { name: "Consultar CEP", description: "Consulta", jsCode: "return params.cep;", parameters: [ { name: "cep", type: "string", description: "O CEP", required: true, itemsType: "string" } ] }
    end

    it "cria, com o nome normalizado e o esquema calculado" do
      post "/tools", params: { tool: valid }, headers: headers, as: :json

      expect(response).to have_http_status(:created)
      expect(json["tool"]).to include("name" => "consultar_cep", "locked" => false, "jsCode" => "return params.cep;")
      expect(JSON.parse(json["tool"]["parametersJson"])).to include("required" => [ "cep" ])
      expect(json["tool"]["parameters"].first).to include("itemsType" => "string")
      expect(ToolFunction::MiniRacer.where(id: json["tool"]["id"]).take.organization_id).to eq(organization.id.to_s)
    end

    it "422 sem nome e com nome que o modelo recusa" do
      post "/tools", params: { tool: valid.merge(name: "") }, headers: headers, as: :json
      expect(response).to have_http_status(:unprocessable_entity)
      expect(json["error"]["field"]).to eq("name")

      post "/tools", params: { tool: valid.merge(description: "") }, headers: headers, as: :json
      expect(response).to have_http_status(:unprocessable_entity)
    end

    it "403 sem a permissão" do
      post "/tools", params: { tool: valid }, headers: no_access_headers, as: :json

      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "PATCH e DELETE /tools/:id" do
    it "muda e apaga a própria" do
      tool = create(:tool_function, organization: organization)

      patch "/tools/#{tool.id}", params: { tool: { description: "Outra", jsCode: "return 2;" } }, headers: headers, as: :json
      expect(response).to have_http_status(:ok)
      expect(tool.reload).to have_attributes(description: "Outra", js_code: "return 2;")

      delete "/tools/#{tool.id}", headers: headers, as: :json
      expect(response).to have_http_status(:no_content)
      expect(ToolFunction::MiniRacer.where(id: tool.id)).not_to exist
    end

    it "403 toolLocked em quem veio do catálogo" do
      tool = installed_function

      patch "/tools/#{tool.id}", params: { tool: { description: "x" } }, headers: headers, as: :json
      expect(response).to have_http_status(:forbidden)
      expect(json["error"]["code"]).to eq("toolLocked")

      delete "/tools/#{tool.id}", headers: headers, as: :json
      expect(response).to have_http_status(:forbidden)
    end

    it "404 em outra organização" do
      alheia = create(:tool_function, organization: other_organization)

      patch "/tools/#{alheia.id}", params: { tool: { description: "x" } }, headers: headers, as: :json
      expect(response).to have_http_status(:not_found)

      delete "/tools/#{alheia.id}", headers: headers, as: :json
      expect(response).to have_http_status(:not_found)
      expect(ToolFunction::MiniRacer.where(id: alheia.id)).to exist
    end

    it "422 em dado inválido" do
      tool = create(:tool_function, organization: organization)

      patch "/tools/#{tool.id}", params: { tool: { description: "" } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_entity)
    end
  end

  describe "POST /tools/:id/personalize" do
    it "desvincula da ferramenta, e o código aparece" do
      tool = installed_function(js_code: "return 1;")

      post "/tools/#{tool.id}/personalize", headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json["tool"]).to include("locked" => false, "jsCode" => "return 1;", "toolInstallationId" => nil)
    end

    it "422 se já é personalizada" do
      post "/tools/#{create(:tool_function, organization: organization).id}/personalize", headers: headers, as: :json

      expect(json["error"]["code"]).to eq("alreadyPersonalized")
    end
  end

  describe "POST /tools/:id/test" do
    let(:tool) { create(:tool_function, organization: organization, js_code: "console.log('oi'); return { dobro: params.n * 2 };") }

    it "não roda na requisição: enfileira na fila scripts" do
      expect { post "/tools/#{tool.id}/test", params: { args: { n: 2 } }, headers: headers, as: :json }
        .to have_enqueued_job(Tools::TestRunJob).on_queue("scripts")

      expect(response).to have_http_status(:accepted)
      expect(json["testRun"]["status"]).to eq("pending")
    end

    it "a tela consulta o resultado" do
      perform_enqueued_jobs { post "/tools/#{tool.id}/test", params: { args: { n: 2 } }, headers: headers, as: :json }
      id = json["testRun"]["id"]

      get "/tools/#{tool.id}/test-runs/#{id}", headers: headers, as: :json

      expect(json["testRun"]).to include("id" => id, "status" => "done", "response" => { "dobro" => 4 })
      expect(json["testRun"]["events"].first).to include("name" => "console_log")
    end

    it "o erro do script é a resposta" do
      tool.update!(js_code: "throw new Error('faltou o CPF');")

      perform_enqueued_jobs { post "/tools/#{tool.id}/test", headers: headers, as: :json }
      get "/tools/#{tool.id}/test-runs/#{json['testRun']['id']}", headers: headers, as: :json

      expect(json["testRun"]["status"]).to eq("failed")
      expect(json["testRun"]["error"]).to include("faltou o CPF")
    end

    it "404 no resultado que não existe, e em função e conversa de outra organização" do
      get "/tools/#{tool.id}/test-runs/#{SecureRandom.uuid}", headers: headers, as: :json
      expect(response).to have_http_status(:not_found)

      post "/tools/#{create(:tool_function, organization: other_organization).id}/test", headers: headers, as: :json
      expect(response).to have_http_status(:not_found)

      post "/tools/#{tool.id}/test", params: { chatId: create(:chat, organization: other_organization).id.to_s }, headers: headers, as: :json
      expect(response).to have_http_status(:not_found)
    end

    it "tem limite por pessoa" do
      freeze = Time.current
      allow(Time).to receive(:current).and_return(freeze)

      ToolsController::TEST_RUNS_PER_MINUTE.times { post "/tools/#{tool.id}/test", headers: headers, as: :json }
      post "/tools/#{tool.id}/test", headers: headers, as: :json

      expect(response).to have_http_status(:too_many_requests)
    end
  end

  describe "GET /tool-catalog" do
    it "lista só as ativas, com o filtro de categoria" do
      tool = create(:tool, name: "Utilidades", category: "utilidades", credentials_schema: [ { "name" => "api_key", "required" => true } ])
      create(:tool, name: "Desligada", active: false)
      create(:tool, name: "Vendas", category: "vendas")

      get "/tool-catalog", params: { category: "utilidades" }, headers: headers

      expect(response).to have_http_status(:ok)
      expect(json["tools"].pluck("id")).to eq([ tool.id.to_s ])
      expect(json["tools"].first).to include("requiresCredentials" => true, "functionCount" => 1)
      expect(json["tools"].first).not_to have_key("functionTemplates")
    end

    it "mostra uma, com os modelos das funções" do
      tool = create(:tool)

      get "/tool-catalog/#{tool.id}", headers: headers, as: :json

      expect(json["tool"]["functionTemplates"].first).to include("name" => "consultar_cep", "jsCode" => a_string_including("credentials"))
    end

    it "404, 403 e 401" do
      get "/tool-catalog/#{create(:tool, active: false).id}", headers: headers, as: :json
      expect(response).to have_http_status(:not_found)

      get "/tool-catalog", headers: no_access_headers, as: :json
      expect(response).to have_http_status(:forbidden)

      get "/tool-catalog", as: :json
      expect(response).to have_http_status(:unauthorized)
    end
  end

  describe "/tool-installations" do
    let(:tool) { create(:tool, credentials_schema: [ { "name" => "api_key", "required" => true }, { "name" => "conta", "required" => false } ]) }

    it "instala, copiando as funções para a organização" do
      post "/tool-installations", params: { toolId: tool.id.to_s, credentials: { api_key: "segredo" } }, headers: headers, as: :json

      expect(response).to have_http_status(:created)
      expect(json["installation"]).to include("toolId" => tool.id.to_s, "enabled" => true, "hasCredentials" => true)
      expect(json["installation"].to_json).not_to include("segredo")
      function = ToolFunction::MiniRacer.where(id: json["installation"]["toolFunctionIds"].first).take
      expect(function).to have_attributes(name: "consultar_cep", organization_id: organization.id.to_s)
      expect(function.credentials).to eq("api_key" => "segredo")
    end

    it "422 sem a credencial obrigatória" do
      post "/tool-installations", params: { toolId: tool.id.to_s }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json["error"]).to include("code" => "missingCredentials")
      expect(json["error"]["message"]).to include("api_key")
    end

    it "404 em ferramenta que não existe, e 400 sem nada" do
      post "/tool-installations", params: { toolId: "000000000000000000000000" }, headers: headers, as: :json
      expect(response).to have_http_status(:not_found)

      post "/tool-installations", params: {}, headers: headers, as: :json
      expect(response).to have_http_status(:bad_request)
    end

    it "lista as da organização, sem as de outra" do
      installation = create(:tool_installation, organization: organization, tool_id: tool.id.to_s)
      create(:tool_installation, organization: other_organization, tool_id: tool.id.to_s)

      get "/tool-installations", headers: headers, as: :json

      expect(json["installations"].pluck("id")).to eq([ installation.id.to_s ])
      expect(json["installations"].first["tool"]).to include("name" => tool.name)
    end

    it "atualiza só as credenciais que vieram com valor" do
      installation = create(:tool_installation, organization: organization, tool_id: tool.id.to_s)
      installation.credentials = { "api_key" => "antiga", "conta" => "1" }
      installation.save!

      patch "/tool-installations/#{installation.id}", params: { credentials: { api_key: "nova", conta: "" } }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(installation.reload.credentials).to eq("api_key" => "nova", "conta" => "1")
    end

    it "liga e desliga" do
      installation = create(:tool_installation, organization: organization, tool_id: tool.id.to_s)

      patch "/tool-installations/#{installation.id}/toggle", headers: headers, as: :json

      expect(json["installation"]["enabled"]).to be(false)
    end

    it "desinstala, levando as funções do catálogo e deixando as personalizadas" do
      post "/tool-installations", params: { toolId: tool.id.to_s, credentials: { api_key: "x" } }, headers: headers, as: :json
      id = json["installation"]["id"]
      function_id = json["installation"]["toolFunctionIds"].first

      delete "/tool-installations/#{id}", headers: headers, as: :json

      expect(response).to have_http_status(:no_content)
      expect(ToolInstallation.where(id: id)).not_to exist
      expect(ToolFunction::MiniRacer.where(id: function_id)).not_to exist
    end

    it "404 em outra organização, e 403 sem a permissão" do
      alheia = create(:tool_installation, organization: other_organization, tool_id: tool.id.to_s)

      patch "/tool-installations/#{alheia.id}/toggle", headers: headers, as: :json
      expect(response).to have_http_status(:not_found)
      delete "/tool-installations/#{alheia.id}", headers: headers, as: :json
      expect(response).to have_http_status(:not_found)

      get "/tool-installations", headers: no_access_headers, as: :json
      expect(response).to have_http_status(:forbidden)
    end
  end
end
