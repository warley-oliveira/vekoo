require "rails_helper"

RSpec.describe "Pipelines: quadros", type: :request do
  let(:organization) { create(:organization) }
  let(:owner) { create(:account, organization: organization) }
  let(:headers) { auth_headers(owner) }

  describe "GET /pipelines/boards" do
    it "exige sessão" do
      get "/pipelines/boards"

      expect(response).to have_http_status(:unauthorized)
      expect(json.dig("error", "code")).to eq("unauthorized")
    end

    it "exige a permissão de pipelines" do
      member = member_with(chat: "all")

      get "/pipelines/boards", headers: auth_headers(member)

      expect(response).to have_http_status(:forbidden)
      expect(json.dig("error", "code")).to eq("forbidden")
    end

    it "responde no formato que o menu já consome" do
      create(:pipeline_board, organization: organization, name: "Funil comercial")

      get "/pipelines/boards", headers: headers

      expect(response).to have_http_status(:ok)
      expect(json["boards"].first).to include("id" => be_a(String), "name" => "Funil comercial")
      expect(json["meta"]).to eq("total" => 1)
    end

    it "não mostra quadro de outra organização" do
      create(:pipeline_board)

      get "/pipelines/boards", headers: headers

      expect(json["boards"]).to be_empty
    end

    it "conta cards e etapas, sem contar arquivados" do
      board, stage = board_with_stages(organization, "Novos")
      create(:pipeline_card, stage: stage)
      create(:pipeline_card, stage: stage, archived: true)

      get "/pipelines/boards", headers: headers

      expect(json["boards"].first).to include("id" => board.id, "cardsCount" => 1, "stagesCount" => 1)
    end

    it "separa os arquivados" do
      create(:pipeline_board, organization: organization, name: "Ativo")
      create(:pipeline_board, organization: organization, name: "Velho", archived: true)

      get "/pipelines/boards", params: { archived: "true" }, headers: headers

      expect(json["boards"].map { |board| board["name"] }).to eq([ "Velho" ])
    end

    it "traz as etapas com withStages, sem os cards" do
      board, stage = board_with_stages(organization, "Novos")

      get "/pipelines/boards", params: { withStages: "true" }, headers: headers

      expect(json["boards"].first["stages"]).to eq([ { "id" => stage.id, "name" => "Novos", "position" => 1 } ])
      expect(json["boards"].first).not_to have_key("cards")
      expect(board).to be_present
    end

    it "conta só os cards visíveis em quadro restrito" do
      member = pipelines_member
      board, stage = board_with_stages(organization, "Novos", card_visibility: "assigned",
        card_visibility_bypass_role_ids: [ create(:access_role, organization: organization).id ])
      create(:pipeline_card, stage: stage, assigned_to: member)
      create(:pipeline_card, stage: stage)

      get "/pipelines/boards", headers: auth_headers(member)

      expect(json["boards"].first).to include("id" => board.id, "cardsCount" => 1, "viewerCanViewAllCards" => false)
    end
  end

  describe "GET /pipelines/boards/:id" do
    it "traz etapas, cards, campos e gatilhos" do
      board, stage = board_with_stages(organization, "Novos")
      card = create(:pipeline_card, stage: stage, title: "Atacado de canecas", deal_value: 1500.5)
      create(:pipeline_custom_field, board: board, name: "Origem")
      create(:pipeline_trigger, board: board, name: "Avisar")

      get board_path(board), headers: headers

      expect(response).to have_http_status(:ok)
      first_stage = json["stages"].first
      expect(first_stage).to include("id" => stage.id, "name" => "Novos")
      expect(first_stage["cards"].first).to include(
        "id" => card.id, "title" => "Atacado de canecas", "stageId" => stage.id, "dealValue" => 1500.5, "hasChat" => false
      )
      expect(json["customFields"].first).to include("key" => "origem", "scope" => "board")
      expect(json["triggers"].first).to include("name" => "Avisar", "eventType" => "card_moved")
    end

    it "não traz card arquivado" do
      board, stage = board_with_stages(organization, "Novos")
      create(:pipeline_card, stage: stage, archived: true)

      get board_path(board), headers: headers

      expect(json["stages"].first["cards"]).to be_empty
    end

    it "responde 404 para quadro de outra organização" do
      other = create(:pipeline_board)

      get board_path(other), headers: headers

      expect(response).to have_http_status(:not_found)
    end

    it "não faz uma consulta por card" do
      board, stage = board_with_stages(organization, "Novos")
      create_list(:pipeline_card, 2, stage: stage)

      count_queries = lambda do
        count = 0
        counter = ->(*, payload) { count += 1 unless payload[:name].in?(%w[SCHEMA TRANSACTION]) || payload[:cached] }
        ActiveSupport::Notifications.subscribed(counter, "sql.active_record") do
          get board_path(board), headers: headers
        end
        count
      end

      few = count_queries.call
      create_list(:pipeline_card, 10, stage: stage, assigned_to: owner)
      many = count_queries.call

      # O responsável e o avatar dele entram uma vez, e não uma vez por card.
      expect(many - few).to be <= 3
    end

    context "com um filtro" do
      let(:board) { create(:pipeline_board, organization: organization) }
      let(:stage) { create(:pipeline_stage, board: board) }

      before do
        create(:pipeline_card, stage: stage, title: "Alta", priority: "high")
        create(:pipeline_card, stage: stage, title: "Baixa", priority: "low")
      end

      def card_titles
        json["stages"].flat_map { |item| item["cards"].map { |card| card["title"] } }
      end

      it "aplica o filtro em JSON" do
        filter = { version: 1, all: [ { field: "priority", operator: "eq", value: "high" } ], any: [] }.to_json

        get board_path(board), params: { filter: filter }, headers: headers

        expect(card_titles).to eq([ "Alta" ])
        expect(json["appliedFilter"]).to eq("inline" => true)
      end

      it "aplica um filtro salvo" do
        saved = create(:pipeline_saved_filter, board: board, owner: owner)

        get board_path(board), params: { savedFilterId: saved.id }, headers: headers

        expect(card_titles).to eq([ "Alta" ])
        expect(json["appliedFilter"]).to eq("savedFilterId" => saved.id)
      end

      it "não aplica filtro privado de outra pessoa" do
        saved = create(:pipeline_saved_filter, board: board)

        get board_path(board), params: { savedFilterId: saved.id }, headers: headers

        expect(response).to have_http_status(:not_found)
      end

      it "aplica um preset" do
        get board_path(board), params: { presetKey: "my_deals" }, headers: headers

        expect(card_titles).to be_empty
        expect(json["appliedFilter"]).to eq("presetKey" => "my_deals")
      end

      it "responde 404 para preset desconhecido" do
        get board_path(board), params: { presetKey: "nao_existe" }, headers: headers

        expect(response).to have_http_status(:not_found)
      end

      it "responde 422 para JSON inválido" do
        get board_path(board), params: { filter: "{quebrado" }, headers: headers

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "code")).to eq("invalidFilter")
      end

      it "responde 422 para campo desconhecido, com o motivo em details" do
        filter = { version: 1, all: [ { field: "senha", operator: "eq", value: "x" } ] }.to_json

        get board_path(board), params: { filter: filter }, headers: headers

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "details").first).to include("senha")
      end

      it "responde 422, e não 500, para número que não é número" do
        filter = { version: 1, all: [ { field: "deal_value", operator: "gt", value: "abc" } ] }.to_json

        get board_path(board), params: { filter: filter }, headers: headers

        expect(response).to have_http_status(:unprocessable_content)
      end

      it "responde 422, e não 500, para id que não é UUID" do
        filter = { version: 1, all: [ { field: "stage_id", operator: "eq", value: "12" } ] }.to_json

        get board_path(board), params: { filter: filter }, headers: headers

        expect(response).to have_http_status(:unprocessable_content)
      end
    end
  end

  describe "POST /pipelines/boards" do
    it "cria um quadro comum com as etapas padrão" do
      post "/pipelines/boards", params: { board: { name: "Pós-venda", color: "#123456", icon: "headset" } },
        headers: headers, as: :json

      expect(response).to have_http_status(:created)
      expect(json).to include("name" => "Pós-venda", "boardType" => "standard", "color" => "#123456", "icon" => "headset")
      expect(json["stages"].map { |stage| stage["name"] }).to eq([ "A fazer", "Em andamento", "Concluído" ])
    end

    it "cria um quadro de negócios com as etapas de venda" do
      post "/pipelines/boards", params: { board: { name: "Vendas", boardType: "crm" } }, headers: headers, as: :json

      expect(json["boardType"]).to eq("crm")
      expect(json["stages"].map { |stage| stage["name"] }).to include("Proposta", "Ganho", "Perdido")
    end

    it "fala a língua de quem pediu nas etapas padrão" do
      post "/pipelines/boards", params: { board: { name: "Sales", boardType: "crm" } },
        headers: headers.merge("Accept-Language" => "en"), as: :json

      expect(json["stages"].map { |stage| stage["name"] }).to include("Proposal", "Won", "Lost")
    end

    it "cria a partir de um modelo, mesmo sem semente" do
      post "/pipelines/boards", params: { board: { templateKey: "vendas" } }, headers: headers, as: :json

      expect(response).to have_http_status(:created)
      expect(json).to include("name" => "Vendas", "templateKey" => "vendas", "boardType" => "crm")
      expect(json["stages"].map { |stage| stage["name"] }).to include("Fechado/Ganho")
      expect(json["customFields"].map { |field| field["key"] }).to include("empresa", "fonte")
      expect(json["triggers"].first).to include("name" => "Avisar ao fechar negócio")
    end

    it "responde 404 para modelo que não existe" do
      post "/pipelines/boards", params: { board: { templateKey: "nao_existe" } }, headers: headers, as: :json

      expect(response).to have_http_status(:not_found)
    end

    it "responde 422 sem nome" do
      post "/pipelines/boards", params: { board: { name: "" } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "field")).to eq("name")
    end

    it "responde 400 sem o envelope" do
      post "/pipelines/boards", params: { name: "Solto" }, headers: headers, as: :json

      expect(response).to have_http_status(:bad_request)
    end

    it "exige a permissão" do
      post "/pipelines/boards", params: { board: { name: "X" } }, headers: auth_headers(member_with(chat: "all")), as: :json

      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "PATCH /pipelines/boards/:id" do
    let(:board) { create(:pipeline_board, organization: organization) }

    it "altera as configurações" do
      patch board_path(board), params: { board: { name: "Novo nome", autoArchiveDays: 30, dealRottingDays: 3 } },
        headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json).to include("name" => "Novo nome", "autoArchiveDays" => 30, "dealRottingDays" => 3)
    end

    it "responde 422 para dias negativos" do
      patch board_path(board), params: { board: { autoArchiveDays: -1 } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
    end

    it "responde 422 se a pontuação não aponta para um campo de número" do
      create(:pipeline_custom_field, board: board, name: "Origem", field_type: "text")

      patch board_path(board), params: { board: { leadScoreFieldKey: "origem" } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("invalidLeadScoreField")
    end

    it "aceita um campo de número na pontuação" do
      create(:pipeline_custom_field, board: board, name: "Lead Score", field_type: "number")

      patch board_path(board), params: { board: { leadScoreFieldKey: "lead_score" } }, headers: headers, as: :json

      expect(json).to include("leadScoreFieldKey" => "lead_score")
    end

    it "responde 404 para quadro de outra organização" do
      patch board_path(create(:pipeline_board)), params: { board: { name: "X" } }, headers: headers, as: :json

      expect(response).to have_http_status(:not_found)
    end

    describe "visibilidade dos cards" do
      let(:role) { create(:access_role, organization: organization) }

      it "restringe, com um grupo liberado" do
        patch board_path(board), params: { board: { cardVisibility: "assigned", cardVisibilityBypassRoleIds: [ role.id ] } },
          headers: headers, as: :json

        expect(response).to have_http_status(:ok)
        expect(json).to include("cardVisibility" => "assigned", "cardVisibilityBypassRoleIds" => [ role.id ])
      end

      it "responde 422 sem nenhum grupo" do
        patch board_path(board), params: { board: { cardVisibility: "assigned" } }, headers: headers, as: :json

        expect(response).to have_http_status(:unprocessable_content)
      end

      it "responde 422 com grupo de outra organização" do
        other = create(:access_role)

        patch board_path(board), params: { board: { cardVisibility: "assigned", cardVisibilityBypassRoleIds: [ other.id ] } },
          headers: headers, as: :json

        expect(response).to have_http_status(:unprocessable_content)
      end

      it "quem está restrito não se libera sozinho" do
        board.update!(card_visibility: "assigned", card_visibility_bypass_role_ids: [ role.id ])
        member = pipelines_member

        patch board_path(board), params: { board: { cardVisibility: "all" } }, headers: auth_headers(member), as: :json

        expect(response).to have_http_status(:forbidden)
        expect(board.reload.card_visibility).to eq("assigned")
      end

      it "ninguém se tranca para fora da regra que está salvando" do
        member = pipelines_member

        patch board_path(board), params: { board: { cardVisibility: "assigned", cardVisibilityBypassRoleIds: [ role.id ] } },
          headers: auth_headers(member), as: :json

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "code")).to eq("visibilityLockout")
      end

      it "o dono nunca fica de fora" do
        patch board_path(board), params: { board: { cardVisibility: "assigned", cardVisibilityBypassRoleIds: [ role.id ] } },
          headers: headers, as: :json

        expect(json).to include("viewerCanViewAllCards" => true)
      end

      it "um grupo apagado depois não trava a edição do quadro e some da resposta" do
        board.update!(card_visibility: "assigned", card_visibility_bypass_role_ids: [ role.id ])
        role.destroy!

        patch board_path(board), params: { board: { name: "Outro nome" } }, headers: headers, as: :json

        expect(response).to have_http_status(:ok)
        expect(json["cardVisibilityBypassRoleIds"]).to eq([])
      end
    end
  end

  describe "DELETE /pipelines/boards/:id" do
    it "apaga o quadro com tudo o que é dele" do
      board, stage = board_with_stages(organization, "Novos")
      card = create(:pipeline_card, stage: stage)
      create(:pipeline_comment, card: card, author: owner)
      trigger = create(:pipeline_trigger, board: board, stage: stage)
      Pipelines::TriggerExecution.create!(trigger: trigger, card: card)

      delete board_path(board), headers: headers

      expect(response).to have_http_status(:no_content)
      expect(Pipelines::Board.exists?(board.id)).to be(false)
      expect(Pipelines::Card.exists?(card.id)).to be(false)
    end

    it "quem está restrito não apaga cards que não enxerga" do
      role = create(:access_role, organization: organization)
      board = create(:pipeline_board, organization: organization, card_visibility: "assigned",
        card_visibility_bypass_role_ids: [ role.id ])

      delete board_path(board), headers: auth_headers(pipelines_member)

      expect(response).to have_http_status(:forbidden)
      expect(Pipelines::Board.exists?(board.id)).to be(true)
    end

    it "responde 404 para quadro de outra organização" do
      delete board_path(create(:pipeline_board)), headers: headers

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "POST /pipelines/boards/:id/archive" do
    let(:board) { create(:pipeline_board, organization: organization) }

    it "arquiva e desarquiva" do
      post board_path(board, "/archive"), headers: headers, as: :json
      expect(json).to include("archived" => true)

      post board_path(board, "/archive"), params: { undo: true }, headers: headers, as: :json
      expect(json).to include("archived" => false)
    end
  end

  describe "GET /pipelines/boards/:id/metrics" do
    it "calcula os números do quadro" do
      board, first, second = board_with_stages(organization, "Novos", "Proposta")
      create(:pipeline_card, stage: first, priority: "high", deal_value: 100, deal_probability: 50)
      create(:pipeline_card, stage: second, deal_value: 300, won_at: Time.current)
      create(:pipeline_card, stage: second, deal_value: 200, lost_at: Time.current)

      get board_path(board, "/metrics"), headers: headers

      expect(response).to have_http_status(:ok)
      expect(json["cardsPerStage"].map { |item| [ item["stageName"], item["count"] ] }).to eq([ [ "Novos", 1 ], [ "Proposta", 2 ] ])
      expect(json["dealValuePerStage"].first).to include("stageName" => "Novos", "totalValue" => 100.0)
      expect(json["cardsByPriority"]).to eq("high" => 1)
      expect(json["dealSummary"]).to include(
        "wonCount" => 1, "wonValue" => 300.0, "lostCount" => 1, "openCount" => 1, "conversionRate" => 50.0
      )
      expect(json["weightedPipelineValue"]).to eq(50.0)
    end

    it "mostra só o que a pessoa enxerga em quadro restrito" do
      member = pipelines_member
      role = create(:access_role, organization: organization)
      board, stage = board_with_stages(organization, "Novos", card_visibility: "assigned",
        card_visibility_bypass_role_ids: [ role.id ])
      create(:pipeline_card, stage: stage, assigned_to: member)
      create(:pipeline_card, stage: stage)

      get board_path(board, "/metrics"), headers: auth_headers(member)

      expect(json["totalCards"]).to eq(1)
    end

    it "mede o tempo por etapa pelas passagens, sem depender de edição" do
      board, first, second = board_with_stages(organization, "Novos", "Proposta")
      card = create(:pipeline_card, stage: first)
      card.update_columns(created_at: 10.hours.ago)
      Pipelines::CardActivity.create!(
        card: card, action: "moved", details: { from_stage_id: first.id, to_stage_id: second.id }, created_at: 4.hours.ago
      )
      card.update_columns(stage_id: second.id, stage_entered_at: 4.hours.ago)

      get board_path(board, "/metrics"), headers: headers

      times = json["avgTimePerStage"].to_h { |item| [ item["stageName"], item["avgHours"] ] }
      expect(times["Novos"]).to eq(6.0)
      expect(times["Proposta"]).to eq(4.0)
    end
  end

  describe "GET /pipelines/boards/:id/archived-cards" do
    let(:board) { create(:pipeline_board, organization: organization) }
    let(:stage) { create(:pipeline_stage, board: board, name: "Fechamento", color: "#ABCDEF") }

    before do
      create(:pipeline_card, stage: stage, title: "Arquivado", archived: true)
      create(:pipeline_card, stage: stage, title: "Ganho", won_at: Time.current)
      create(:pipeline_card, stage: stage, title: "Perdido", lost_at: Time.current)
      create(:pipeline_card, stage: stage, title: "Aberto")
    end

    def titles
      json["cards"].map { |card| card["title"] }
    end

    it "lista o que saiu do quadro, com o nome da etapa e a paginação" do
      get board_path(board, "/archived-cards"), headers: headers

      expect(titles).to contain_exactly("Arquivado", "Ganho", "Perdido")
      expect(json["cards"].first).to include("stageName" => "Fechamento", "stageColor" => "#ABCDEF")
      expect(json["meta"]).to include("total" => 3, "page" => 1)
    end

    it "filtra por situação e por título" do
      get board_path(board, "/archived-cards"), params: { status: "won" }, headers: headers
      expect(titles).to eq([ "Ganho" ])

      get board_path(board, "/archived-cards"), params: { status: "archived" }, headers: headers
      expect(titles).to eq([ "Arquivado" ])

      get board_path(board, "/archived-cards"), params: { search: "perd" }, headers: headers
      expect(titles).to eq([ "Perdido" ])
    end
  end

  describe "GET /pipelines/templates" do
    it "traz os modelos, mesmo sem ter rodado a semente" do
      get "/pipelines/templates", headers: headers

      expect(response).to have_http_status(:ok)
      keys = json["templates"].map { |template| template["templateKey"] }
      expect(keys).to contain_exactly("vendas", "suporte", "lead_scoring", "onboarding")

      vendas = json["templates"].find { |template| template["templateKey"] == "vendas" }
      expect(vendas["stagesConfig"].first).to include("name" => "Prospecção", "color" => "#90CAF9")
      expect(vendas["customFieldsConfig"].last).to include("fieldType" => "select")
    end

    it "exige sessão" do
      get "/pipelines/templates"

      expect(response).to have_http_status(:unauthorized)
    end

    it "exige a permissão" do
      get "/pipelines/templates", headers: auth_headers(member_with(chat: "all"))

      expect(response).to have_http_status(:forbidden)
    end
  end
end
