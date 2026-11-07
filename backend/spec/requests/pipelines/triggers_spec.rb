require "rails_helper"

RSpec.describe "Pipelines: gatilhos", type: :request do
  let(:organization) { create(:organization) }
  let(:owner) { create(:account, organization: organization) }
  let(:headers) { auth_headers(owner) }
  let(:board) { create(:pipeline_board, organization: organization) }
  let(:triggers_path) { board_path(board, "/triggers") }

  it "exige sessão e permissão" do
    get triggers_path
    expect(response).to have_http_status(:unauthorized)

    get triggers_path, headers: auth_headers(member_with(chat: "all"))
    expect(response).to have_http_status(:forbidden)
  end

  it "responde 404 para quadro de outra organização" do
    get board_path(create(:pipeline_board), "/triggers"), headers: headers

    expect(response).to have_http_status(:not_found)
  end

  describe "POST" do
    let(:stage) { create(:pipeline_stage, board: board) }

    it "cria, recebendo e devolvendo em camelCase" do
      post triggers_path,
        params: {
          trigger: {
            name: "Avisar e mover", eventType: "card_moved", stageId: stage.id,
            conditions: { toStageName: "Proposta", dealValue: { operator: "greater_than", value: 100 } },
            actions: [
              { type: "notify", message: "Olha o {{card.title}}", accountIds: [ owner.id ] },
              { type: "move_card", stageId: stage.id },
              { type: "fire_webhook", url: "https://exemplo.com/gancho", method: "POST", headers: { "X-Chave_Secreta" => "abc" } },
              { type: "create_card", targetBoardId: board.id, cardTitleTemplate: "{{card.title}}",
                cardCustomFieldValues: { "cor_Preferida" => "Azul" } }
            ]
          }
        },
        headers: headers, as: :json

      expect(response).to have_http_status(:created)
      expect(json).to include("name" => "Avisar e mover", "eventType" => "card_moved", "stageId" => stage.id, "active" => true)
      expect(json["conditions"]).to eq(
        "toStageName" => "Proposta", "dealValue" => { "operator" => "greater_than", "value" => 100 }
      )
      expect(json["actions"][0]).to include("type" => "notify", "accountIds" => [ owner.id ])
      expect(json["actions"][1]).to include("type" => "move_card", "stageId" => stage.id)
      # Cabeçalho e valores de campo são dados: as chaves passam como vieram.
      # Cabeçalho que parece segredo é só de escrita. O nome continua como veio, sem virar camelCase.
      expect(json["actions"][2]["headers"]).to eq("X-Chave_Secreta" => "••••••••")
      expect(Pipelines::Trigger.find(json["id"]).actions[2]["headers"]).to eq("X-Chave_Secreta" => "abc")
      expect(json["actions"][3]["cardCustomFieldValues"]).to eq("cor_Preferida" => "Azul")

      stored = Pipelines::Trigger.find(json["id"])
      expect(stored.conditions).to include("to_stage_name" => "Proposta")
      expect(stored.actions.first).to include("account_ids" => [ owner.id ])
    end

    it "responde 422 sem ação, com ação desconhecida e com evento desconhecido" do
      post triggers_path, params: { trigger: { name: "X", eventType: "card_moved", actions: [] } }, headers: headers, as: :json
      expect(response).to have_http_status(:unprocessable_content)

      post triggers_path, params: { trigger: { name: "X", eventType: "card_moved", actions: [ { type: "chamar_assistente" } ] } },
        headers: headers, as: :json
      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "field")).to eq("actions")

      post triggers_path, params: { trigger: { name: "X", eventType: "inventado", actions: [ { type: "notify" } ] } },
        headers: headers, as: :json
      expect(response).to have_http_status(:unprocessable_content)
    end

    it "responde 422 para evento de negócio em quadro comum" do
      post triggers_path, params: { trigger: { name: "X", eventType: "deal_won", actions: [ { type: "notify" } ] } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "field")).to eq("eventType")
    end

    it "aceita evento de negócio em quadro de negócios" do
      board.update!(board_type: "crm")

      post triggers_path, params: { trigger: { name: "X", eventType: "deal_won", actions: [ { type: "notify" } ] } }, headers: headers, as: :json

      expect(response).to have_http_status(:created)
    end

    it "responde 422 para etapa de outro quadro" do
      post triggers_path, params: { trigger: { name: "X", eventType: "card_moved", stageId: create(:pipeline_stage).id, actions: [ { type: "notify" } ] } },
        headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
    end

    describe "ação com código" do
      let(:code_action) { { type: "run_code", code: "return 1;", timeoutMs: 5000 } }

      it "o dono escreve" do
        post triggers_path, params: { trigger: { name: "Código", eventType: "card_moved", actions: [ code_action ] } }, headers: headers, as: :json

        expect(response).to have_http_status(:created)
        expect(json["actions"].first).to include("type" => "run_code", "code" => "return 1;", "timeoutMs" => 5000)
      end

      it "quem tem só pipelines não escreve" do
        post triggers_path, params: { trigger: { name: "Código", eventType: "card_moved", actions: [ code_action ] } },
          headers: auth_headers(pipelines_member), as: :json

        expect(response).to have_http_status(:forbidden)
      end

      describe "a leitura do código, que pode conter segredo" do
        let!(:coded) { board.triggers.create!(name: "Código", event_type: "card_moved", actions: [ { "type" => "run_code", "code" => "return 'segredo';" } ]) }

        it "vem para quem tem fluxos" do
          get triggers_path, headers: auth_headers(member_with(pipelines: "all", flows: "all"))

          expect(json["triggers"].first["actions"].first).to include("type" => "run_code", "code" => "return 'segredo';")
        end

        it "não vem para quem tem só pipelines, nem na lista, nem no quadro aberto, nem ao ligar e desligar" do
          get triggers_path, headers: auth_headers(pipelines_member)
          expect(json["triggers"].first["actions"].first).to include("type" => "run_code")
          expect(response.body).not_to include("segredo")

          get "/pipelines/boards/#{board.id}", headers: auth_headers(pipelines_member)
          expect(response).to have_http_status(:ok)
          expect(response.body).not_to include("segredo")

          post "#{triggers_path}/#{coded.id}/toggle", headers: auth_headers(pipelines_member)
          expect(response).to have_http_status(:ok)
          expect(response.body).not_to include("segredo")
        end
      end

      it "quem tem fluxos escreve" do
        member = member_with(pipelines: "all", flows: "all")

        post triggers_path, params: { trigger: { name: "Código", eventType: "card_moved", actions: [ code_action ] } },
          headers: auth_headers(member), as: :json

        expect(response).to have_http_status(:created)
      end

      it "responde 422 sem código" do
        post triggers_path, params: { trigger: { name: "Código", eventType: "card_moved", actions: [ { type: "run_code", code: "  " } ] } },
          headers: headers, as: :json

        expect(response).to have_http_status(:unprocessable_content)
      end

      it "responde 422 para código grande demais" do
        huge = "x" * (Pipelines::Trigger::MAX_CODE_LENGTH + 1)

        post triggers_path, params: { trigger: { name: "Código", eventType: "card_moved", actions: [ { type: "run_code", code: huge } ] } },
          headers: headers, as: :json

        expect(response).to have_http_status(:unprocessable_content)
      end
    end
  end

  it "lista por ordem de criação, altera, liga e desliga, apaga" do
    older = create(:pipeline_trigger, board: board, name: "Primeiro", created_at: 2.days.ago)
    create(:pipeline_trigger, board: board, name: "Segundo", created_at: 1.day.ago)

    get triggers_path, headers: headers
    expect(json["triggers"].map { |trigger| trigger["name"] }).to eq(%w[Primeiro Segundo])

    patch "#{triggers_path}/#{older.id}", params: { trigger: { name: "Renomeado" } }, headers: headers, as: :json
    expect(json).to include("name" => "Renomeado")

    post "#{triggers_path}/#{older.id}/toggle", headers: headers, as: :json
    expect(json).to include("active" => false)

    delete "#{triggers_path}/#{older.id}", headers: headers
    expect(response).to have_http_status(:no_content)
  end

  it "responde 404 para gatilho de outro quadro" do
    other = create(:pipeline_trigger)

    post "#{triggers_path}/#{other.id}/toggle", headers: headers, as: :json

    expect(response).to have_http_status(:not_found)
  end

  describe "GET trigger-executions" do
    let(:executions_path) { board_path(board, "/trigger-executions") }
    let(:stage) { create(:pipeline_stage, board: board) }
    let(:trigger) { create(:pipeline_trigger, board: board, name: "Avisar") }

    it "exige sessão e permissão" do
      get executions_path
      expect(response).to have_http_status(:unauthorized)

      get executions_path, headers: auth_headers(member_with(chat: "all"))
      expect(response).to have_http_status(:forbidden)
    end

    it "traz a mais recente primeiro, com os nomes" do
      card = create(:pipeline_card, stage: stage, title: "Atacado")
      Pipelines::TriggerExecution.create!(trigger: trigger, card: card, status: "failure", error_message: "Sem canal",
        executed_actions: [ { "type" => "notify", "status" => "failure", "error" => "Sem canal" } ], executed_at: 1.hour.ago)
      Pipelines::TriggerExecution.create!(trigger: trigger, card: card, status: "success", executed_at: 1.minute.ago)

      get executions_path, headers: headers

      expect(json["executions"].map { |execution| execution["status"] }).to eq(%w[success failure])
      expect(json["executions"].last).to include(
        "triggerId" => trigger.id, "cardId" => card.id, "triggerName" => "Avisar", "cardTitle" => "Atacado", "errorMessage" => "Sem canal"
      )
      expect(json["executions"].last["executedActions"].first).to include("type" => "notify", "status" => "failure")
      expect(json["meta"]).to include("total" => 2)
    end

    it "não mostra execução de outro quadro" do
      other_trigger = create(:pipeline_trigger)
      Pipelines::TriggerExecution.create!(trigger: other_trigger, card: create(:pipeline_card, stage: create(:pipeline_stage, board: other_trigger.board)))

      get executions_path, headers: headers

      expect(json["executions"]).to be_empty
    end

    it "em quadro restrito, só as dos próprios cards" do
      role = create(:access_role, organization: organization)
      board.update!(card_visibility: "assigned", card_visibility_bypass_role_ids: [ role.id ])
      member = pipelines_member
      mine = create(:pipeline_card, stage: stage, assigned_to: member)
      Pipelines::TriggerExecution.create!(trigger: trigger, card: mine)
      Pipelines::TriggerExecution.create!(trigger: trigger, card: create(:pipeline_card, stage: stage))

      get executions_path, headers: auth_headers(member)

      expect(json["executions"].map { |execution| execution["cardId"] }).to eq([ mine.id ])
    end
  end
end
