require "rails_helper"

RSpec.describe "Fluxos", type: :request do
  include ActiveJob::TestHelper

  let(:organization) { create(:organization) }
  let(:account) { create(:account, organization: organization) }
  let(:headers) { auth_headers(account) }
  let(:blank_role) { create(:access_role, organization: organization, permissions: AccessRole::BLANK_PERMISSIONS) }
  let(:no_access_headers) { auth_headers(create(:account, organization: organization, role: "member", access_role: blank_role)) }
  let(:other_flow) { create(:flow, organization: create(:organization)) }
  let(:definition) do
    {
      nodes: [
        { id: "t", type: "trigger_keyword", position: { x: 0, y: 0 }, data: { keywords: [ "oi" ], "campoLivre" => 1 } },
        { id: "a", type: "send_text", position: { x: 1, y: 1 }, data: { text: "olá", sender_name: "Doma" } }
      ],
      edges: [ { id: "e", source: "t", target: "a", sourceHandle: "next" } ],
      viewport: { x: 0, y: 0, zoom: 1 },
      base_prompt: "Atenda bem"
    }
  end

  def flow_with_draft(attributes = {})
    create(:flow, organization: organization, **attributes).tap do |flow|
      flow.versions.create!(version_number: 1, definition: definition.deep_stringify_keys)
    end
  end

  describe "GET /flows, o que cada um fez" do
    it "traz o último uso, os últimos resultados e a semana, sem contar o teste do editor" do
      flow = flow_with_draft(name: "Com histórico")
      version = flow.versions.first
      create(:flow_execution, flow: flow, flow_version: version, status: "failed", created_at: 1.hour.ago)
      create(:flow_execution, flow: flow, flow_version: version, status: "completed", created_at: 2.hours.ago)
      create(:flow_execution, flow: flow, flow_version: version, status: "completed", created_at: 10.days.ago)
      create(:flow_execution, flow: flow, flow_version: version, status: "waiting_for_message", chat_id: "c1", created_at: 3.hours.ago)
      create(:flow_execution, flow: flow, flow_version: version, status: "completed", playground: true)
      idle = flow_with_draft(name: "Parado")

      get "/flows", headers: headers, as: :json

      stats = json["flows"].find { |item| item["id"] == flow.id }["stats"]
      expect(stats["recent"]).to eq(%w[failed completed waiting_for_message completed])
      expect(stats["last7Days"]).to eq("total" => 3, "failed" => 1, "waiting" => 1)
      expect(stats["lastExecutedAt"]).to be_within(5_000).of((1.hour.ago.to_f * 1000).to_i)
      expect(json["flows"].find { |item| item["id"] == idle.id }["stats"]).to be_nil
    end

    it "não mistura execuções de outra organização" do
      flow_with_draft(name: "Meu")
      create(:flow_execution, flow: create(:flow, organization: create(:organization)), status: "failed")

      get "/flows", headers: headers, as: :json

      expect(json["flows"].pluck("stats")).to eq([ nil ])
    end
  end

  describe "POST /flows/:id/unarchive" do
    it "volta a valer na versão que estava publicada, sem publicar o rascunho" do
      flow = flow_with_draft(name: "Liga e desliga")
      flow.publish!
      published = flow.published_version_id
      flow.update!(status: "archived")

      post "/flows/#{flow.id}/unarchive", headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json["flow"]).to include("status" => "published", "published" => true)
      expect(flow.reload.published_version_id).to eq(published)
    end

    it "volta a rascunho se nunca foi publicado" do
      flow = flow_with_draft(status: "archived")

      post "/flows/#{flow.id}/unarchive", headers: headers, as: :json

      expect(json["flow"]).to include("status" => "draft", "published" => false)
    end

    it "não mexe em quem não está arquivado" do
      flow = flow_with_draft(status: "draft")

      post "/flows/#{flow.id}/unarchive", headers: headers, as: :json

      expect(flow.reload.status).to eq("draft")
    end

    it "é 404 em fluxo de outra organização e 403 sem a permissão" do
      post "/flows/#{other_flow.id}/unarchive", headers: headers, as: :json
      expect(response).to have_http_status(:not_found)

      post "/flows/#{flow_with_draft.id}/unarchive", headers: no_access_headers, as: :json
      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "GET /flows/:id/versions" do
    it "lista da mais nova para a mais antiga, sem a definição, e abre uma com a definição" do
      flow = flow_with_draft
      flow.publish!

      get "/flows/#{flow.id}/versions", headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json["versions"].pluck("versionNumber")).to eq([ 2, 1 ])
      expect(json["versions"].first).not_to have_key("definition")
      expect(json["versions"].last["publishedAt"]).to be_a(Integer)

      get "/flows/#{flow.id}/versions/#{json['versions'].last['id']}", headers: headers, as: :json

      expect(json["version"]["definition"]["base_prompt"]).to eq("Atenda bem")
    end

    it "não abre versão de outro fluxo" do
      flow = flow_with_draft
      foreign = flow_with_draft.versions.first

      get "/flows/#{flow.id}/versions/#{foreign.id}", headers: headers, as: :json
      expect(response).to have_http_status(:not_found)

      get "/flows/#{other_flow.id}/versions", headers: headers, as: :json
      expect(response).to have_http_status(:not_found)
    end

    it "exige a permissão" do
      get "/flows/#{flow_with_draft.id}/versions", headers: no_access_headers, as: :json
      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "GET /flows/:flowId/executions, quem é o contato" do
    it "traz o nome da conversa e a contagem por situação, sem o teste do editor" do
      flow = flow_with_draft
      version = flow.versions.first
      chat = create(:chat, organization: organization, user_name: "Fernanda Souza")
      foreign = create(:chat, organization: create(:organization), user_name: "De outra")
      create(:flow_execution, flow: flow, flow_version: version, status: "completed", chat_id: chat.id.to_s)
      create(:flow_execution, flow: flow, flow_version: version, status: "failed", chat_id: foreign.id.to_s)
      create(:flow_execution, flow: flow, flow_version: version, status: "completed", playground: true)

      get "/flows/#{flow.id}/executions", headers: headers, as: :json

      expect(json["counts"]).to eq("completed" => 1, "failed" => 1)
      names = json["executions"].to_h { |item| [ item["status"], item["contactName"] ] }
      expect(names).to eq("completed" => "Fernanda Souza", "failed" => nil)
    end
  end

  describe "GET /flows" do
    it "lista os da organização, com filtros e busca" do
      flow = flow_with_draft(name: "Boas-vindas", status: "published", trigger_type: "first_message")
      create(:flow, organization: organization, name: "Rascunho")
      other_flow

      get "/flows", headers: headers, as: :json
      expect(response).to have_http_status(:ok)
      expect(json["flows"].pluck("name")).to contain_exactly("Boas-vindas", "Rascunho")
      expect(json["meta"]).to include("total" => 2, "page" => 1)

      get "/flows", params: { status: "published", triggerType: "first_message" }, headers: headers
      expect(json["flows"].pluck("id")).to eq([ flow.id ])

      get "/flows", params: { q: "boas" }, headers: headers
      expect(json["flows"].pluck("id")).to eq([ flow.id ])
    end

    it "sai em camelCase, com a data em milissegundos" do
      flow = flow_with_draft(connector_filter: { "connector_ids" => [ "c1" ] })

      get "/flows/#{flow.id}", headers: headers, as: :json

      expect(json["flow"]).to include("triggerType" => "manual", "connectorFilter" => { "connectorIds" => [ "c1" ] }, "published" => false)
      expect(json["flow"]["updatedAt"]).to eq((flow.reload.updated_at.to_f * 1000).round)
    end

    it "401 sem sessão" do
      get "/flows", as: :json

      expect(response).to have_http_status(:unauthorized)
    end

    it "403 sem a permissão" do
      get "/flows", headers: no_access_headers, as: :json

      expect(response).to have_http_status(:forbidden)
      expect(json["error"]["code"]).to eq("forbidden")
    end
  end

  describe "GET /flows/:id" do
    it "traz o rascunho, com a definição intacta" do
      flow = flow_with_draft

      get "/flows/#{flow.id}", headers: headers, as: :json

      draft = json["flow"]["draft"]
      expect(draft["versionNumber"]).to eq(1)
      expect(draft["definition"]["nodes"].second["data"]).to eq("text" => "olá", "sender_name" => "Doma")
      expect(draft["definition"]["edges"].first["sourceHandle"]).to eq("next")
      expect(json["flow"]["publishedVersion"]).to be_nil
    end

    it "404 em fluxo de outra organização" do
      get "/flows/#{other_flow.id}", headers: headers, as: :json

      expect(response).to have_http_status(:not_found)
      expect(json["error"]["code"]).to eq("notFound")
    end
  end

  describe "POST /flows" do
    it "cria o rascunho com o gatilho inicial" do
      post "/flows", params: { flow: { name: "Novo", triggerType: "first_message", description: "x" } }, headers: headers, as: :json

      expect(response).to have_http_status(:created)
      expect(json["flow"]).to include("name" => "Novo", "status" => "draft", "triggerType" => "first_message")
      expect(json["flow"]["draft"]["definition"]["nodes"].first["type"]).to eq("trigger_first_message")
      expect(Flow.find(json["flow"]["id"]).created_by_account_id).to eq(account.id)
    end

    it "começa de um modelo" do
      post "/flows", params: { flow: { name: "De modelo" }, template: "welcome_routing" }, headers: headers, as: :json

      expect(response).to have_http_status(:created)
      expect(json["flow"]["triggerType"]).to eq("first_message")
      expect(json["flow"]["draft"]["definition"]["nodes"].first["id"]).to eq("trigger")
    end

    it "404 com modelo que não existe" do
      post "/flows", params: { flow: { name: "x" }, template: "nao-existe" }, headers: headers, as: :json

      expect(response).to have_http_status(:not_found)
    end

    it "422 sem nome e com gatilho desconhecido" do
      post "/flows", params: { flow: { name: "" } }, headers: headers, as: :json
      expect(response).to have_http_status(:unprocessable_entity)
      expect(json["error"]).to include("code" => "unprocessable", "field" => "name", "message" => "Nome não pode ficar em branco")

      post "/flows", params: { flow: { name: "x", triggerType: "inventado" } }, headers: headers, as: :json
      expect(response).to have_http_status(:unprocessable_entity)
    end

    it "400 sem envelope" do
      post "/flows", params: { name: "x" }, headers: headers, as: :json

      expect(response).to have_http_status(:bad_request)
    end

    it "403 sem a permissão" do
      post "/flows", params: { flow: { name: "x" } }, headers: no_access_headers, as: :json

      expect(response).to have_http_status(:forbidden)
    end

    it "a organização vem da sessão, e não do corpo" do
      post "/flows", params: { flow: { name: "x", organizationId: other_flow.organization_id } }, headers: headers, as: :json

      expect(Flow.find(json["flow"]["id"]).organization_id).to eq(organization.id)
    end
  end

  describe "PATCH /flows/:id" do
    it "muda os metadados" do
      flow = flow_with_draft

      patch "/flows/#{flow.id}", params: { flow: { name: "Outro", connectorFilter: { connectorIds: [ "c1" ] } } }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(flow.reload).to have_attributes(name: "Outro", connector_ids: [ "c1" ])
    end

    it "422 com status inválido não passa, porque status não é editável aqui" do
      flow = flow_with_draft

      patch "/flows/#{flow.id}", params: { flow: { name: "" } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_entity)
    end

    it "404 em outra organização" do
      patch "/flows/#{other_flow.id}", params: { flow: { name: "x" } }, headers: headers, as: :json

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "PUT /flows/:id/definition" do
    it "grava o rascunho como veio: arestas em camelCase e data em snake_case" do
      flow = flow_with_draft

      put "/flows/#{flow.id}/definition", params: { definition: definition }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      saved = flow.draft_version.reload.definition
      expect(saved["edges"].first["sourceHandle"]).to eq("next")
      expect(saved["nodes"].second["data"]["sender_name"]).to eq("Doma")
      expect(saved["nodes"].first["data"]["campoLivre"]).to eq(1)
      expect(saved["base_prompt"]).to eq("Atenda bem")
      expect(json["version"]["definition"]).to eq(saved)
    end

    it "cria o rascunho, se não houver" do
      flow = create(:flow, organization: organization)

      put "/flows/#{flow.id}/definition", params: { definition: definition }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(flow.draft_version).to be_present
    end

    it "422 com definição fora do formato" do
      flow = flow_with_draft

      put "/flows/#{flow.id}/definition", params: { definition: { nodes: "x" } }, headers: headers, as: :json
      expect(response).to have_http_status(:unprocessable_entity)

      put "/flows/#{flow.id}/definition", params: { definition: "x" }, headers: headers, as: :json
      expect(response).to have_http_status(:unprocessable_entity)
    end

    it "400 sem definição" do
      put "/flows/#{flow_with_draft.id}/definition", params: {}, headers: headers, as: :json

      expect(response).to have_http_status(:bad_request)
    end
  end

  describe "POST /flows/:id/publish" do
    it "congela o rascunho e abre o próximo, com o gatilho do bloco inicial" do
      flow = flow_with_draft

      post "/flows/#{flow.id}/publish", headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json["flow"]).to include("status" => "published", "published" => true, "triggerType" => "keyword")
      expect(json["flow"]["publishedVersion"]["versionNumber"]).to eq(1)
      expect(json["flow"]["draft"]["versionNumber"]).to eq(2)
      expect(json["flow"]["publishedVersion"]["publishedAt"]).to be_present
    end

    it "resolve o alerta de execução com erro" do
      flow = flow_with_draft
      OrganizationAlertService.flow_error(organization, flow, code: "flow_execution_failed")

      post "/flows/#{flow.id}/publish", headers: headers, as: :json

      expect(organization.organization_alerts.active.for_origin("Flow", flow.id)).not_to exist
    end

    it "422 com o que está errado: bloco desconhecido, sem gatilho, conexão quebrada" do
      flow = create(:flow, organization: organization)
      flow.versions.create!(version_number: 1, definition: { nodes: [ { id: "x", type: "bloco_inventado" } ], edges: [ { id: "e", source: "x", target: "nada" } ] })

      post "/flows/#{flow.id}/publish", headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json["error"]["code"]).to eq("invalidDefinition")
      expect(json["error"]["details"]["issues"]).to include(
        { "code" => "noTrigger" },
        { "code" => "unknownBlock", "nodeId" => "x", "type" => "bloco_inventado" },
        { "code" => "brokenEdge", "edgeId" => "e" }
      )
      expect(flow.reload.status).to eq("draft")
    end

    it "422 sem rascunho" do
      post "/flows/#{create(:flow, organization: organization).id}/publish", headers: headers, as: :json

      expect(json["error"]["code"]).to eq("noDraftToPublish")
    end

    it "404 em outra organização" do
      post "/flows/#{other_flow.id}/publish", headers: headers, as: :json

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "POST /flows/:id/archive" do
    it "arquiva e encerra o que estava em andamento" do
      flow = published_flow(organization, [ node("t", "trigger_manual"), node("p", "wait_for_message") ], [ edge("t", "p") ])
      execution = run_flow(flow, chat: create(:chat, organization: organization))

      post "/flows/#{flow.id}/archive", headers: headers, as: :json

      expect(json["flow"]["status"]).to eq("archived")
      expect(execution.reload.status).to eq("cancelled")
    end
  end

  describe "DELETE /flows/:id" do
    it "apaga o fluxo e o histórico" do
      flow = published_flow(organization, [ node("t", "trigger_manual") ])
      execution = run_flow(flow, chat: create(:chat, organization: organization))

      delete "/flows/#{flow.id}", headers: headers, as: :json

      expect(response).to have_http_status(:no_content)
      expect(Flow.exists?(flow.id)).to be(false)
      expect(FlowExecution.exists?(execution.id)).to be(false)
    end

    it "404 em outra organização" do
      delete "/flows/#{other_flow.id}", headers: headers, as: :json

      expect(response).to have_http_status(:not_found)
      expect(Flow.exists?(other_flow.id)).to be(true)
    end
  end

  describe "GET /flows/:flowId/executions" do
    let(:flow) { published_flow(organization, [ node("t", "trigger_manual"), node("v", "set_variable", assignments: [ { name: "x", value: "1" } ]) ], [ edge("t", "v") ]) }
    let(:chat) { create(:chat, organization: organization) }

    it "lista as de verdade, sem as do teste" do
      execution = run_flow(flow, chat: chat)
      create(:flow_execution, flow: flow, playground: true)

      get "/flows/#{flow.id}/executions", headers: headers, as: :json

      expect(json["executions"].pluck("id")).to eq([ execution.id ])
      expect(json["executions"].first).to include("status" => "completed", "chatId" => chat.id.to_s, "flowId" => flow.id)
      expect(json["meta"]["total"]).to eq(1)
    end

    it "traz os blocos, no detalhe" do
      execution = run_flow(flow, chat: chat)

      get "/flows/#{flow.id}/executions/#{execution.id}", headers: headers, as: :json

      expect(json["execution"]["context"]["variables"]).to eq("x" => "1")
      expect(json["execution"]["logs"].first).to include("nodeId" => "v", "nodeType" => "set_variable", "status" => "success")
      expect(json["execution"]["logs"].first["output"]).to eq("variables" => { "x" => "1" })
    end

    it "404 em fluxo e em execução de outra organização" do
      alheia = create(:flow_execution, flow: other_flow)

      get "/flows/#{other_flow.id}/executions", headers: headers, as: :json
      expect(response).to have_http_status(:not_found)

      get "/flows/#{flow.id}/executions/#{alheia.id}", headers: headers, as: :json
      expect(response).to have_http_status(:not_found)
    end

    it "403 sem a permissão, e 401 sem sessão" do
      get "/flows/#{flow.id}/executions", headers: no_access_headers, as: :json
      expect(response).to have_http_status(:forbidden)

      get "/flows/#{flow.id}/executions", as: :json
      expect(response).to have_http_status(:unauthorized)
    end
  end

  describe "POST /flows/:flowId/executions" do
    let(:flow) { published_flow(organization, [ node("t", "trigger_manual"), node("v", "set_variable", assignments: [ { name: "x", value: "{{vars.y}}" } ]) ], [ edge("t", "v") ]) }
    let(:chat) { create(:chat, organization: organization) }

    it "começa o fluxo na conversa, com as variáveis como vieram" do
      perform_enqueued_jobs do
        post "/flows/#{flow.id}/executions", params: { chatId: chat.id.to_s, variables: { y: "2", "chaveLivre" => "3" } }, headers: headers, as: :json
      end

      expect(response).to have_http_status(:accepted)
      execution = FlowExecution.where(flow: flow).take
      expect(execution.variables).to include("x" => "2", "chaveLivre" => "3")
      expect(execution.context["event"]).to eq("manual")
    end

    it "422 em fluxo não publicado" do
      draft = create(:flow, organization: organization)

      post "/flows/#{draft.id}/executions", params: { chatId: chat.id.to_s }, headers: headers, as: :json

      expect(json["error"]["code"]).to eq("flowNotPublished")
    end

    it "404 em conversa de outra organização" do
      alheia = create(:chat, organization: create(:organization))

      post "/flows/#{flow.id}/executions", params: { chatId: alheia.id.to_s }, headers: headers, as: :json

      expect(response).to have_http_status(:not_found)
    end

    it "400 sem conversa" do
      post "/flows/#{flow.id}/executions", params: {}, headers: headers, as: :json

      expect(response).to have_http_status(:bad_request)
    end

    it "422 com variáveis demais" do
      many = Array.new(20) { |index| [ "v#{index}", "a" * FlowRuntime::Limits::MAX_VARIABLE_BYTES ] }.to_h

      post "/flows/#{flow.id}/executions", params: { chatId: chat.id.to_s, variables: many }, headers: headers, as: :json

      expect(json["error"]["code"]).to eq("variablesTooLarge")
    end
  end

  describe "o teste do editor" do
    let(:flow) { flow_with_draft }

    def start_playground(params = {})
      post "/flows/#{flow.id}/playground", params: params, headers: headers, as: :json
      json["executionId"]
    end

    it "abre uma execução de teste, numa conversa de teste, sem rodar nada ainda" do
      id = start_playground(useDraft: true)

      expect(response).to have_http_status(:created)
      expect(json).to include("channel" => "FlowPlaygroundChannel", "currentNodeId" => "a")
      execution = FlowExecution.find(id)
      expect(execution).to have_attributes(status: "pending", playground: true)
      expect(execution.chat.external_id).to eq(Chat::TEST_EXTERNAL_ID)
    end

    it "reaproveita a conversa de teste, e ela não entra nas listas" do
      first = start_playground
      second = start_playground

      expect(FlowExecution.find(first).chat_id).to eq(FlowExecution.find(second).chat_id)
    end

    it "run roda a partir do rascunho, e a mensagem não sai para canal nenhum" do
      id = start_playground

      perform_enqueued_jobs { post "/flows/#{flow.id}/playground/#{id}/run", headers: headers, as: :json }

      expect(response).to have_http_status(:ok)
      expect(FlowExecution.find(id).status).to eq("completed")
    end

    it "run de novo não roda duas vezes" do
      id = start_playground
      perform_enqueued_jobs { post "/flows/#{flow.id}/playground/#{id}/run", headers: headers, as: :json }

      expect do
        post "/flows/#{flow.id}/playground/#{id}/run", headers: headers, as: :json
      end.not_to have_enqueued_job(Flows::ResumeExecutionJob)
      expect(json["status"]).to eq("completed")
    end

    it "message retoma quem espera" do
      waiting = published_flow(organization, [ node("t", "trigger_manual"), node("p", "wait_for_message", save_to: "fala") ], [ edge("t", "p") ])
      post "/flows/#{waiting.id}/playground", headers: headers, as: :json
      id = json["executionId"]
      perform_enqueued_jobs { post "/flows/#{waiting.id}/playground/#{id}/run", headers: headers, as: :json }

      perform_enqueued_jobs { post "/flows/#{waiting.id}/playground/#{id}/message", params: { text: "oi" }, headers: headers, as: :json }

      expect(FlowExecution.find(id)).to have_attributes(status: "completed", variables: hash_including("fala" => "oi"))
    end

    it "message responde 422 se não está esperando" do
      id = start_playground

      post "/flows/#{flow.id}/playground/#{id}/message", params: { text: "oi" }, headers: headers, as: :json

      expect(json["error"]["code"]).to eq("notWaiting")
    end

    it "stop cancela" do
      id = start_playground

      delete "/flows/#{flow.id}/playground/#{id}", headers: headers, as: :json

      expect(response).to have_http_status(:no_content)
      expect(FlowExecution.find(id).status).to eq("cancelled")
    end

    it "não alcança execução de verdade, nem de outra organização" do
      real = run_flow(published_flow(organization, [ node("t", "trigger_manual") ]), chat: create(:chat, organization: organization))
      post "/flows/#{real.flow_id}/playground/#{real.id}/run", headers: headers, as: :json
      expect(response).to have_http_status(:not_found)

      post "/flows/#{other_flow.id}/playground", headers: headers, as: :json
      expect(response).to have_http_status(:not_found)
    end

    it "403 sem a permissão" do
      post "/flows/#{flow.id}/playground", headers: no_access_headers, as: :json

      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "GET /flow-templates" do
    it "lista os modelos prontos, com os blocos da lista final" do
      get "/flow-templates", headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json["flowTemplates"].pluck("slug")).to include("welcome_routing", "sales_agent", "cart_recovery")
      types = json["flowTemplates"].flat_map { |template| template["definition"]["nodes"].pluck("type") }.uniq
      expect(types - FlowRuntime::NodeRegistry.types).to be_empty
    end

    it "mostra um" do
      get "/flow-templates/welcome_routing", headers: headers, as: :json

      expect(json["flowTemplate"]).to include("slug" => "welcome_routing", "triggerType" => "first_message")
    end

    it "404, 403 e 401" do
      get "/flow-templates/nao-existe", headers: headers, as: :json
      expect(response).to have_http_status(:not_found)

      get "/flow-templates", headers: no_access_headers, as: :json
      expect(response).to have_http_status(:forbidden)

      get "/flow-templates", as: :json
      expect(response).to have_http_status(:unauthorized)
    end
  end
end
