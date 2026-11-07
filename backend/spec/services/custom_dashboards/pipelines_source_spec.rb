require "rails_helper"

# A fonte `pipelines` e os filtros `pipeline_status` e `pipeline_stage` sobre conversas, no banco de verdade.
RSpec.describe CustomDashboards::Sources::Pipelines do
  let(:organization) { create(:organization) }
  let(:account) { create(:account, organization: organization) }

  def execute(as: account, source: "pipelines", **query)
    CustomDashboards::QueryEngine.execute(account: as, data_source: source, query: query.deep_stringify_keys)
  end

  def total
    { aggregation: "count", label: "Total" }
  end

  describe "agregar" do
    let!(:board) { create(:pipeline_board, :crm, organization: organization, name: "Comercial") }
    let!(:proposal) { create(:pipeline_stage, board: board, name: "Proposta") }
    let!(:closing) { create(:pipeline_stage, board: board, name: "Fechamento") }

    it "conta por etapa, com o quadro no nome" do
      2.times { create(:pipeline_card, stage: proposal) }
      create(:pipeline_card, stage: closing)

      result = execute(dimensions: [ { field: "stage_id" } ], metrics: [ total ], sort: { field: "Total", direction: "desc" })

      expect(result[:rows]).to eq([ { "stage_id" => proposal.id, "Total" => 2 }, { "stage_id" => closing.id, "Total" => 1 } ])
      expect(result[:labels]["stage_id"]).to eq(proposal.id => "Comercial · Proposta", closing.id => "Comercial · Fechamento")
    end

    it "agrupa por quadro, mesmo o quadro sendo da etapa" do
      other = create(:pipeline_board, organization: organization, name: "Suporte")
      create(:pipeline_card, stage: proposal)
      create(:pipeline_card, stage: closing)
      create(:pipeline_card, stage: create(:pipeline_stage, board: other))

      result = execute(dimensions: [ { field: "board_id" } ], metrics: [ total ], sort: { field: "Total", direction: "desc" })

      expect(result[:rows]).to eq([ { "board_id" => board.id, "Total" => 2 }, { "board_id" => other.id, "Total" => 1 } ])
      expect(result[:labels]["board_id"]).to eq(board.id => "Comercial", other.id => "Suporte")
    end

    it "agrupa e filtra pela situação do negócio, que no banco são duas datas" do
      create(:pipeline_card, :won, stage: proposal)
      create(:pipeline_card, stage: proposal, lost_at: Time.current)
      2.times { create(:pipeline_card, stage: proposal) }

      rows = execute(dimensions: [ { field: "deal_status" } ], metrics: [ total ], sort: { field: "Total", direction: "desc" })[:rows]
      expect(rows.first).to eq("deal_status" => "open", "Total" => 2)
      expect(rows.map { |row| row["deal_status"] }).to contain_exactly("open", "won", "lost")

      expect(execute(filters: [ { field: "deal_status", operator: "eq", value: "won" } ], metrics: [ total ])[:rows]).to eq([ { "Total" => 1 } ])
      expect(execute(filters: [ { field: "deal_status", operator: "in", value: %w[won lost] } ], metrics: [ total ])[:rows]).to eq([ { "Total" => 2 } ])
    end

    it "filtra por quadro" do
      other = create(:pipeline_board, organization: organization)
      create(:pipeline_card, stage: proposal)
      create(:pipeline_card, stage: create(:pipeline_stage, board: other))

      expect(execute(filters: [ { field: "board_id", operator: "eq", value: board.id } ], metrics: [ total ])[:rows]).to eq([ { "Total" => 1 } ])
      # O editor consulta enquanto a pessoa preenche: filtro vazio não vira erro de banco.
      expect(execute(filters: [ { field: "board_id", operator: "eq", value: "" } ], metrics: [ total ])[:rows]).to eq([ { "Total" => 0 } ])
    end

    it "soma o valor dos negócios, por semana" do
      create(:pipeline_card, stage: proposal, deal_value: 1_500.50)
      create(:pipeline_card, stage: proposal, deal_value: 499.50)

      result = execute(
        dimensions: [ { field: "created_at", granularity: "week" } ],
        metrics: [ { field: "deal_value", aggregation: "sum", label: "Valor" } ]
      )

      expect(result[:rows].sum { |row| row["Valor"] }).to eq(2_000)
    end

    it "sem agrupar, traz os campos da fonte, inclusive os que não são coluna" do
      card = create(:pipeline_card, :won, stage: proposal, title: "Pedido da Doma", deal_value: 80)

      row = execute[:rows].first

      expect(row).to include("title" => "Pedido da Doma", "board_id" => board.id, "stage_id" => proposal.id, "deal_status" => "won")
      expect(row.keys).not_to include("description", "contact_phone", "custom_field_values")
      expect(card.reload.title).to eq("Pedido da Doma")
    end

    it "conta o arquivado, e quem quer só os ativos filtra" do
      create(:pipeline_card, :won, stage: proposal, archived: true)
      create(:pipeline_card, stage: proposal)

      expect(execute(metrics: [ total ])[:rows]).to eq([ { "Total" => 2 } ])
      expect(execute(filters: [ { field: "archived", operator: "eq", value: "false" } ], metrics: [ total ])[:rows]).to eq([ { "Total" => 1 } ])
    end

    it "o período padrão é por `created_at`, e dá para contar por outra data" do
      create(:pipeline_card, stage: proposal, created_at: 200.days.ago, won_at: 1.day.ago)
      create(:pipeline_card, stage: proposal)

      expect(execute(metrics: [ total ])[:rows]).to eq([ { "Total" => 1 } ])
      expect(execute(metrics: [ total ], time_range: { field: "won_at" })[:rows]).to eq([ { "Total" => 1 } ])
    end

    it "não alcança outra organização" do
      create(:pipeline_card, stage: proposal)
      create(:pipeline_card)

      expect(execute(metrics: [ total ])[:rows]).to eq([ { "Total" => 1 } ])
    end

    it "métrica condicional não existe no Postgres" do
      expect { execute(metrics: [ total.merge(filters: [ { field: "priority", operator: "eq", value: "high" } ]) ]) }
        .to raise_error(CustomDashboards::QueryEngine::QueryError) { |error| expect(error.code).to eq("metricFiltersUnsupported") }
    end

    it "recusa campo que não é da fonte" do
      expect { execute(filters: [ { field: "description", operator: "eq", value: "x" } ]) }
        .to raise_error(CustomDashboards::QueryEngine::QueryError) { |error| expect(error.code).to eq("fieldNotAllowed") }
    end

    it "escreve o valor do negócio por extenso no CSV" do
      create(:pipeline_card, stage: proposal, deal_value: 1_500.5)

      result = execute(dimensions: [ { field: "stage_id" } ], metrics: [ { field: "deal_value", aggregation: "sum", label: "Valor" } ])
      csv = CustomDashboards::RowValues.to_csv(result, organization.reporting_zone)

      expect(csv).to include("Comercial · Proposta,1500.5")
    end
  end

  describe "quem vê o quê" do
    let(:person) { member_with(organization, custom_dashboards: "all", pipelines: "all") }
    let(:free_board) { create(:pipeline_board, organization: organization) }
    let(:managers) { create(:access_role, organization: organization) }
    let(:closed_board) { create(:pipeline_board, organization: organization, card_visibility: "assigned", card_visibility_bypass_role_ids: [ managers.id ]) }
    let!(:free_card) { create(:pipeline_card, stage: create(:pipeline_stage, board: free_board)) }
    let!(:hidden_card) { create(:pipeline_card, stage: create(:pipeline_stage, board: closed_board)) }
    let!(:own_card) { create(:pipeline_card, stage: hidden_card.stage, assigned_to: person) }

    def visible_titles(as)
      execute(as: as)[:rows].map { |row| row["title"] }
    end

    it "em quadro restrito, a pessoa só conta o que é dela" do
      expect(visible_titles(person)).to contain_exactly(free_card.title, own_card.title)
    end

    it "na agregação também" do
      expect(execute(as: person, metrics: [ total ])[:rows]).to eq([ { "Total" => 2 } ])
    end

    it "a dona vê tudo" do
      expect(visible_titles(account)).to contain_exactly(free_card.title, hidden_card.title, own_card.title)
    end

    it "grupo liberado no quadro vê tudo" do
      closed_board.update!(card_visibility_bypass_role_ids: [ person.access_role_id ])

      expect(visible_titles(person)).to contain_exactly(free_card.title, hidden_card.title, own_card.title)
    end

    it "a regra é a mesma de `CardVisibility`, card a card" do
      other = member_with(organization, custom_dashboards: "all", pipelines: "all")
      closed_board.update!(card_visibility_bypass_role_ids: [ other.access_role_id ])

      [ person, other, account ].each do |viewer|
        expected = [ free_card, hidden_card, own_card ].select { |card| Pipelines::CardVisibility.new(card.board, viewer).visible?(card) }

        expect(visible_titles(viewer)).to match_array(expected.map(&:title))
      end
    end
  end

  describe "os filtros sobre conversas" do
    let(:board) { create(:pipeline_board, :crm, organization: organization, name: "Comercial") }
    let(:stage) { create(:pipeline_stage, board: board, name: "Proposta") }
    let!(:won_chat) { create(:chat, organization: organization, user_name: "Ganhou") }
    let!(:open_chat) { create(:chat, organization: organization, user_name: "Em aberto") }
    let!(:plain_chat) { create(:chat, organization: organization, user_name: "Sem card") }

    before do
      create(:pipeline_card, :won, stage: stage, chat_id: won_chat.id.to_s)
      create(:pipeline_card, stage: stage, chat_id: open_chat.id.to_s)
    end

    def names(as: account, **filter)
      execute(as: as, source: "conversations", filters: [ filter ])[:rows].map { |row| row["user_name"] }
    end

    it "pipeline_status acha as conversas pelo negócio" do
      expect(names(field: "pipeline_status", operator: "eq", value: "won")).to contain_exactly("Ganhou")
      expect(names(field: "pipeline_status", operator: "in", value: %w[won open])).to contain_exactly("Ganhou", "Em aberto")
      expect(names(field: "pipeline_status", operator: "ne", value: "won")).to contain_exactly("Em aberto", "Sem card")
    end

    it "pipeline_stage acha as conversas pela etapa" do
      other = create(:pipeline_stage, board: board)

      expect(names(field: "pipeline_stage", operator: "eq", value: stage.id)).to contain_exactly("Ganhou", "Em aberto")
      expect(names(field: "pipeline_stage", operator: "eq", value: other.id)).to be_empty
    end

    it "funciona dentro de uma métrica condicional" do
      rows = execute(
        source: "conversations",
        metrics: [ total, { aggregation: "count", label: "Ganhas", filters: [ { field: "pipeline_status", operator: "eq", value: "won" } ] } ]
      )[:rows]

      expect(rows).to eq([ { "Total" => 3, "Ganhas" => 1 } ])
    end

    it "só olha os quadros de CRM, como na origem" do
      standard = create(:pipeline_board, organization: organization)
      create(:pipeline_card, :won, stage: create(:pipeline_stage, board: standard), chat_id: plain_chat.id.to_s)

      expect(names(field: "pipeline_status", operator: "eq", value: "won")).to contain_exactly("Ganhou")
    end

    it "conta o card ganho que foi arquivado" do
      create(:pipeline_card, :won, stage: stage, chat_id: plain_chat.id.to_s, archived: true)

      expect(names(field: "pipeline_status", operator: "eq", value: "won")).to contain_exactly("Ganhou", "Sem card")
    end

    it "em quadro restrito, o card que a pessoa não vê não decide nada" do
      board.update!(card_visibility: "assigned", card_visibility_bypass_role_ids: [ create(:access_role, organization: organization).id ])
      person = member_with(organization, custom_dashboards: "all", chat: "all", chat_list_to: "all", pipelines: "all")

      expect(names(as: person, field: "pipeline_status", operator: "eq", value: "won")).to be_empty

      create(:pipeline_card, :won, stage: stage, chat_id: open_chat.id.to_s, assigned_to: person)

      expect(names(as: person, field: "pipeline_status", operator: "eq", value: "won")).to contain_exactly("Em aberto")
    end

    it "não alcança card de outra organização" do
      foreign = create(:pipeline_stage, board: create(:pipeline_board, :crm))
      create(:pipeline_card, :won, stage: foreign, chat_id: plain_chat.id.to_s)

      expect(names(field: "pipeline_status", operator: "eq", value: "won")).to contain_exactly("Ganhou")
      expect(names(field: "pipeline_stage", operator: "eq", value: foreign.id)).to be_empty
    end

    it "valor que não existe não acha nada" do
      expect(names(field: "pipeline_status", operator: "eq", value: "talvez")).to be_empty
    end

    it "só com a permissão de pipelines" do
      person = member_with(organization, custom_dashboards: "all", chat: "all", chat_list_to: "all")

      expect { names(as: person, field: "pipeline_status", operator: "eq", value: "won") }.to raise_error(CustomDashboards::QueryEngine::Forbidden)
    end

    it "recusa operador que não é de conjunto" do
      expect { names(field: "pipeline_stage", operator: "contains", value: "x") }
        .to raise_error(CustomDashboards::QueryEngine::QueryError) { |error| expect(error.code).to eq("operatorNotAllowed") }
    end

    it "recusa quando o filtro alcançaria conversas demais" do
      stub_const("CustomDashboards::DocumentIdResolvers::MAX_IDS", 1)

      expect { names(field: "pipeline_stage", operator: "eq", value: stage.id) }
        .to raise_error(CustomDashboards::QueryEngine::QueryError) { |error| expect(error.code).to eq("tooManyMatches") }
    end
  end

  describe "na API", type: :request do
    let(:headers) { auth_headers(account) }
    let(:board) { create(:pipeline_board, :crm, organization: organization, name: "Comercial") }
    let!(:stage) { create(:pipeline_stage, board: board, name: "Proposta") }

    before { Rails.cache.clear }

    it "manda o valor como número, e não como texto" do
      create(:pipeline_card, stage: stage, deal_value: 1_500.5)

      post "/custom-dashboards/query", params: { dataSource: "pipelines", metrics: [ { field: "deal_value", aggregation: "sum", label: "Valor" } ] }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json["rows"]).to eq([ { "Valor" => 1500.5 } ])
    end

    it "é de quem pode ver os pipelines" do
      person = member_with(organization, custom_dashboards: "all", chat: "all", chat_list_to: "all")

      post "/custom-dashboards/query", params: { dataSource: "pipelines" }, headers: auth_headers(person), as: :json
      expect(response).to have_http_status(:forbidden)

      get "/custom-dashboards/filter-options", params: { sourceKey: "pipelines" }, headers: auth_headers(person)
      expect(response).to have_http_status(:forbidden)

      get "/custom-dashboards/data-sources", headers: auth_headers(person)
      sources = json["dataSources"]
      expect(sources.map { |source| source["key"] }).not_to include("pipelines")
      expect(sources.find { |source| source["key"] == "conversations" }["fields"].map { |field| field["key"] }).not_to include("pipeline_status", "pipeline_stage")
    end

    it "traz os campos traduzidos nos dois idiomas, e diz o que a fonte não aceita" do
      get "/custom-dashboards/data-sources", params: { locale: "en" }, headers: headers

      source = json["dataSources"].find { |item| item["key"] == "pipelines" }
      expect(source).to include("label" => "Pipelines", "supportsMetricFilters" => false)
      expect(source["fields"].find { |field| field["key"] == "deal_value" }).to include("label" => "Deal value", "type" => "number")
      expect(source["fields"].find { |field| field["key"] == "board_id" }).to include("label" => "Board", "filterType" => "relationship")
      expect(json["dataSources"].find { |item| item["key"] == "conversations" }).to include("supportsMetricFilters" => true)
    end

    it "traz as opções dos filtros: quadros e etapas ativos, e os valores com nome" do
      archived = create(:pipeline_board, organization: organization, name: "Antigo", archived: true)
      create(:pipeline_stage, board: archived, name: "Velha")

      get "/custom-dashboards/filter-options", params: { sourceKey: "pipelines" }, headers: headers

      options = json["filterOptions"]
      expect(options["board_id"]).to eq([ { "value" => board.id, "label" => "Comercial" } ])
      expect(options["stage_id"]).to eq([ { "value" => stage.id, "label" => "Comercial · Proposta" } ])
      expect(options["deal_status"]).to include("value" => "won", "label" => "Ganho")
      expect(options["priority"]).to include("value" => "urgent", "label" => "Urgente")
    end

    it "traz as opções dos filtros de pipeline em conversas, só de CRM" do
      standard = create(:pipeline_board, organization: organization, name: "Suporte")
      create(:pipeline_stage, board: standard, name: "Fila")

      get "/custom-dashboards/filter-options", params: { sourceKey: "conversations" }, headers: headers

      options = json["filterOptions"]
      expect(options["pipeline_status"]).to include("value" => "won", "label" => "Ganho")
      expect(options["pipeline_stage"]).to eq([ { "value" => stage.id, "label" => "Comercial · Proposta" } ])
    end

    it "um card de pipelines salva e consulta como os outros" do
      post "/custom-dashboards", params: {
        customDashboard: {
          name: "Comercial",
          widgets: [
            {
              widgetType: "bar_chart", title: "Valor por etapa", dataSource: "pipelines", position: 0,
              query: { dataSource: "pipelines", metrics: [ { field: "deal_value", aggregation: "sum", label: "Valor" } ], dimensions: [ { field: "stage_id" } ] },
              visualConfig: {}, layout: { x: 0, y: 0, w: 6, h: 4 }
            }
          ]
        }
      }, headers: headers, as: :json

      expect(response).to have_http_status(:created)
      expect(json["customDashboard"]["widgets"].first).to include("dataSource" => "pipelines")
    end
  end
end
