require "rails_helper"

RSpec.describe "Dashboards personalizados", type: :request do
  let(:organization) { create(:organization) }
  let(:account) { create(:account, organization: organization, name: "Marina Duarte") }
  let(:headers) { auth_headers(account) }
  let(:other_organization) { create(:organization) }

  def dashboard_for(target = organization, **attributes)
    create(:custom_dashboard, organization: target, created_by_account_id: account.id, **attributes)
  end

  def query(body, as_headers: headers)
    post "/custom-dashboards/query", params: body, headers: as_headers, as: :json
  end

  # Sem o teto de consultas por minuto entre um exemplo e outro: `memory_store` é um só no processo.
  before { Rails.cache.clear }

  describe "sessão e permissão" do
    let(:forbidden) { member_with(organization, chat: "all", dashboard: "all") }

    it "responde 401 sem sessão" do
      [
        -> { get "/custom-dashboards" },
        -> { get "/custom-dashboards/data-sources" },
        -> { post "/custom-dashboards/query", params: { dataSource: "conversations" }, as: :json }
      ].each do |request|
        request.call

        expect(response).to have_http_status(:unauthorized)
      end
    end

    it "responde 403 sem a permissão custom_dashboards, em todas as rotas" do
      dashboard = dashboard_for
      forbidden_headers = auth_headers(forbidden)

      [
        -> { get "/custom-dashboards", headers: forbidden_headers },
        -> { get "/custom-dashboards/#{dashboard.id}", headers: forbidden_headers },
        -> { post "/custom-dashboards", params: { customDashboard: { name: "X" } }, headers: forbidden_headers, as: :json },
        -> { patch "/custom-dashboards/#{dashboard.id}", params: { customDashboard: { name: "X" } }, headers: forbidden_headers, as: :json },
        -> { delete "/custom-dashboards/#{dashboard.id}", headers: forbidden_headers },
        -> { post "/custom-dashboards/#{dashboard.id}/duplicate", headers: forbidden_headers },
        -> { patch "/custom-dashboards/#{dashboard.id}/toggle-favorite", headers: forbidden_headers },
        -> { post "/custom-dashboards/query", params: { dataSource: "conversations" }, headers: forbidden_headers, as: :json },
        -> { post "/custom-dashboards/compound-query", params: { steps: [ { dataSource: "conversations" } ] }, headers: forbidden_headers, as: :json },
        -> { post "/custom-dashboards/query-csv", params: { dataSource: "conversations" }, headers: forbidden_headers, as: :json },
        -> { get "/custom-dashboards/data-sources", headers: forbidden_headers },
        -> { get "/custom-dashboards/filter-options", params: { sourceKey: "conversations" }, headers: forbidden_headers }
      ].each do |request|
        request.call

        expect(response).to have_http_status(:forbidden)
      end
    end

    it "libera com a permissão, sem precisar ser dono" do
      get "/custom-dashboards", headers: auth_headers(member_with(organization, custom_dashboards: "all"))

      expect(response).to have_http_status(:ok)
    end
  end

  describe "isolamento entre organizações" do
    let(:foreign) { dashboard_for(other_organization) }

    it "não lista dashboard de outra organização" do
      foreign
      mine = dashboard_for

      get "/custom-dashboards", headers: headers

      expect(json["customDashboards"].map { |item| item["id"] }).to eq([ mine.id.to_s ])
    end

    it "responde 404 para dashboard de outra organização, em todas as rotas" do
      [
        -> { get "/custom-dashboards/#{foreign.id}", headers: headers },
        -> { patch "/custom-dashboards/#{foreign.id}", params: { customDashboard: { name: "Meu" } }, headers: headers, as: :json },
        -> { delete "/custom-dashboards/#{foreign.id}", headers: headers },
        -> { post "/custom-dashboards/#{foreign.id}/duplicate", headers: headers },
        -> { patch "/custom-dashboards/#{foreign.id}/toggle-favorite", headers: headers }
      ].each do |request|
        request.call

        expect(response).to have_http_status(:not_found)
      end

      expect(CustomDashboard.for_organization(other_organization.id).where(id: foreign.id).exists?).to be(true)
    end

    it "responde 404 para id que nem é id" do
      get "/custom-dashboards/nao-e-um-id", headers: headers

      expect(response).to have_http_status(:not_found)
    end

    it "a consulta só alcança a própria organização, com ou sem agrupar" do
      create(:chat, organization: organization, user_name: "Minha")
      create(:chat, organization: other_organization, user_name: "Alheia")

      query({ dataSource: "conversations" })
      expect(json["rows"].map { |row| row["user_name"] }).to eq([ "Minha" ])

      query({ dataSource: "conversations", metrics: [ { aggregation: "count", label: "Total" } ] })
      expect(json["rows"]).to eq([ { "Total" => 1 } ])
    end

    it "não consegue trocar a organização por um filtro" do
      create(:chat, organization: other_organization)

      query({ dataSource: "conversations", filters: [ { field: "organization_id", operator: "eq", value: other_organization.id } ] })

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("fieldNotAllowed")
    end
  end

  describe "GET /custom-dashboards" do
    it "lista do mais recente para o mais antigo, sem os widgets, com contagem e autor" do
      older = dashboard_for(name: "Antigo", updated_at: 2.days.ago)
      older.widgets.create!(widget_type: "kpi", title: "Total", data_source: "conversations")
      older.set(updated_at: 2.days.ago)
      dashboard_for(name: "Recente")

      get "/custom-dashboards", headers: headers

      expect(response).to have_http_status(:ok)
      expect(json["customDashboards"].map { |item| item["name"] }).to eq(%w[Recente Antigo])
      item = json["customDashboards"].last
      expect(item).to include("widgetsCount" => 1, "createdByName" => "Marina Duarte", "createdByAccountId" => account.id, "isFavorite" => false)
      expect(item).not_to have_key("widgets")
      expect(json["meta"]).to include("total" => 2)
    end
  end

  describe "POST /custom-dashboards" do
    let(:widget) do
      {
        widgetType: "bar_chart", title: "Por canal", dataSource: "conversations", position: 2,
        query: { metrics: [ { aggregation: "count" } ], dimensions: [ { field: "audience_type" } ] },
        visualConfig: { showLegend: true, valueMap: { "Sr. João" => { label: "João" }, "preço$" => { color: "#fff" } } },
        layout: { x: 1, y: 2, w: 3, h: 4 }
      }
    end

    it "cria, em nome de quem pediu, guardando os mapas da tela como vieram" do
      post "/custom-dashboards", params: { customDashboard: { name: "Atendimento", description: "Do dia", icon: "chart", globalFilters: { dateField: "created_at" }, widgets: [ widget ] } }, headers: headers, as: :json

      expect(response).to have_http_status(:created)
      body = json["customDashboard"]
      expect(body).to include("name" => "Atendimento", "description" => "Do dia", "icon" => "chart", "createdByAccountId" => account.id, "globalFilters" => { "dateField" => "created_at" })
      saved = body["widgets"].first
      expect(saved).to include("widgetType" => "bar_chart", "title" => "Por canal", "dataSource" => "conversations", "position" => 2)
      expect(saved["id"]).to be_present
      expect(saved["query"]).to eq("metrics" => [ { "aggregation" => "count" } ], "dimensions" => [ { "field" => "audience_type" } ])
      expect(saved["visualConfig"]).to eq("showLegend" => true, "valueMap" => { "Sr. João" => { "label" => "João" }, "preço$" => { "color" => "#fff" } })
      expect(saved["layout"]).to eq("x" => 1, "y" => 2, "w" => 3, "h" => 4)
    end

    it "lê de volta o mesmo que guardou, depois de ir ao banco" do
      post "/custom-dashboards", params: { customDashboard: { name: "Atendimento", widgets: [ widget ] } }, headers: headers, as: :json

      get "/custom-dashboards/#{json.dig('customDashboard', 'id')}", headers: headers

      expect(json.dig("customDashboard", "widgets", 0, "visualConfig", "valueMap")).to include("Sr. João" => { "label" => "João" })
    end

    it "não deixa o cliente escolher a organização nem o autor" do
      post "/custom-dashboards", params: { customDashboard: { name: "X", organizationId: other_organization.id, createdByAccountId: "outra" } }, headers: headers, as: :json

      expect(response).to have_http_status(:created)
      saved = CustomDashboard.for_organization(organization.id).where(id: json.dig("customDashboard", "id")).take
      expect(saved).to have_attributes(organization_id: organization.id.to_s, created_by_account_id: account.id)
    end

    it "responde 400 sem o envelope" do
      post "/custom-dashboards", params: { name: "X" }, headers: headers, as: :json

      expect(response).to have_http_status(:bad_request)
      expect(json.dig("error", "code")).to eq("parameterMissing")
    end

    it "responde 422 sem nome" do
      post "/custom-dashboards", params: { customDashboard: { name: "" } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "field")).to eq("name")
    end

    it "responde 422 com widget de tipo que não existe" do
      post "/custom-dashboards", params: { customDashboard: { name: "X", widgets: [ widget.merge(widgetType: "pizza") ] } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]).to include("code" => "invalidWidget", "field" => "widgets", "message" => "Card 1: Tipo não está na lista")
      expect(json.dig("error", "details")).to include("position" => 0)
      expect(json.dig("error", "details", "errors")).to have_key("widgetType")
    end

    it "responde 422 com widget de fonte que não existe" do
      post "/custom-dashboards", params: { customDashboard: { name: "X", widgets: [ widget.merge(dataSource: "billing") ] } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
    end

    it "aceita widget sem fonte quando ele não mostra dados" do
      post "/custom-dashboards", params: { customDashboard: { name: "X", widgets: [ { widgetType: "rich_text", title: "Nota" } ] } }, headers: headers, as: :json

      expect(response).to have_http_status(:created)
    end

    it "responde 422 com mapa grande demais" do
      post "/custom-dashboards", params: { customDashboard: { name: "X", widgets: [ widget.merge(visualConfig: { content: "a" * 40.kilobytes }) ] } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
    end

    it "responde 422 acima do teto de widgets e de dashboards" do
      stub_const("CustomDashboard::MAX_WIDGETS", 1)
      post "/custom-dashboards", params: { customDashboard: { name: "X", widgets: [ widget, widget ] } }, headers: headers, as: :json
      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("tooManyWidgets")

      stub_const("CustomDashboard::MAX_PER_ORGANIZATION", 1)
      dashboard_for
      post "/custom-dashboards", params: { customDashboard: { name: "X" } }, headers: headers, as: :json
      expect(response).to have_http_status(:unprocessable_content)
    end
  end

  describe "PATCH /custom-dashboards/:id" do
    let(:dashboard) { dashboard_for(name: "Antes") }

    before { dashboard.widgets.create!(widget_type: "kpi", title: "Antigo", data_source: "conversations") }

    it "sem a lista, deixa os widgets como estão" do
      patch "/custom-dashboards/#{dashboard.id}", params: { customDashboard: { name: "Depois" } }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json["customDashboard"]["name"]).to eq("Depois")
      expect(json["customDashboard"]["widgets"].map { |item| item["title"] }).to eq([ "Antigo" ])
    end

    it "com null, também: só a lista vazia apaga" do
      patch "/custom-dashboards/#{dashboard.id}", params: { customDashboard: { widgets: nil } }, headers: headers, as: :json

      expect(json["customDashboard"]["widgets"].map { |item| item["title"] }).to eq([ "Antigo" ])
    end

    it "com a lista, troca os widgets" do
      patch "/custom-dashboards/#{dashboard.id}", params: { customDashboard: { widgets: [ { widgetType: "table", title: "Novo", dataSource: "contacts" } ] } }, headers: headers, as: :json

      expect(json["customDashboard"]["widgets"].map { |item| item["title"] }).to eq([ "Novo" ])
      get "/custom-dashboards/#{dashboard.id}", headers: headers
      expect(json["customDashboard"]["widgets"].map { |item| item["title"] }).to eq([ "Novo" ])
    end

    it "com a lista vazia, tira todos" do
      patch "/custom-dashboards/#{dashboard.id}", params: { customDashboard: { widgets: [] } }, headers: headers, as: :json

      get "/custom-dashboards/#{dashboard.id}", headers: headers
      expect(json["customDashboard"]["widgets"]).to eq([])
    end

    # Na origem os widgets eram apagados antes de validar os novos.
    it "widget inválido não apaga os que já estavam" do
      patch "/custom-dashboards/#{dashboard.id}", params: { customDashboard: { widgets: [ { widgetType: "pizza", title: "Novo", dataSource: "contacts" } ] } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      get "/custom-dashboards/#{dashboard.id}", headers: headers
      expect(json["customDashboard"]["widgets"].map { |item| item["title"] }).to eq([ "Antigo" ])
    end
  end

  describe "ações de um dashboard" do
    let(:dashboard) { dashboard_for(name: "Atendimento", description: "Do dia", is_default: true, global_filters: { "a" => 1 }) }

    before { dashboard.widgets.create!(widget_type: "kpi", title: "Total", data_source: "conversations", query: { "metrics" => [ { "aggregation" => "count" } ] }) }

    it "apaga" do
      delete "/custom-dashboards/#{dashboard.id}", headers: headers

      expect(response).to have_http_status(:no_content)
      expect(CustomDashboard.for_organization(organization.id).count).to eq(0)
    end

    it "duplica com widgets de id novo, em nome de quem duplicou, sem ser padrão" do
      person = member_with(organization, custom_dashboards: "all")

      post "/custom-dashboards/#{dashboard.id}/duplicate", headers: auth_headers(person)

      expect(response).to have_http_status(:created)
      copy = json["customDashboard"]
      expect(copy).to include("name" => "Atendimento (cópia)", "description" => "Do dia", "createdByAccountId" => person.id, "isDefault" => false, "globalFilters" => { "a" => 1 })
      expect(copy["id"]).not_to eq(dashboard.id.to_s)
      expect(copy["widgets"].first).to include("title" => "Total", "query" => { "metrics" => [ { "aggregation" => "count" } ] })
      expect(copy["widgets"].first["id"]).not_to eq(dashboard.widgets.first.id.to_s)
    end

    it "alterna o favorito" do
      patch "/custom-dashboards/#{dashboard.id}/toggle-favorite", headers: headers
      expect(json).to eq("isFavorite" => true)

      patch "/custom-dashboards/#{dashboard.id}/toggle-favorite", headers: headers
      expect(json).to eq("isFavorite" => false)
    end
  end

  describe "POST /custom-dashboards/query" do
    it "agrupa, conta e devolve os nomes das colunas e dos valores, no idioma da requisição" do
      2.times { create(:chat, organization: organization, status: "open") }
      create(:chat, organization: organization, status: "closed")

      post "/custom-dashboards/query?locale=en", params: {
        dataSource: "conversations",
        dimensions: [ { field: "status" } ],
        metrics: [ { aggregation: "count", label: "Total" } ],
        sort: { field: "Total", direction: "desc" }
      }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json["rows"]).to eq([ { "status" => "open", "Total" => 2 }, { "status" => "closed", "Total" => 1 } ])
      expect(json["columns"]).to eq(%w[status Total])
      expect(json["labels"]["status"]).to include("open" => "Open", "closed" => "Closed")
      expect(json["fieldLabels"]).to include("status" => "Status")
      expect(json["meta"]).to include("total" => 2, "truncated" => false)
      expect(json["meta"]["timeRange"]).to include("field" => "created_at")
    end

    it "agrupa por data no fuso da organização, e devolve em milissegundos" do
      zone = organization.reporting_zone
      at = zone.local(2026, 10, 10, 22, 30) # já é o dia seguinte em UTC
      create(:chat, organization: organization, created_at: at)

      query({
        dataSource: "conversations",
        dimensions: [ { field: "created_at", granularity: "day" } ],
        metrics: [ { aggregation: "count", label: "Total" } ],
        timeRange: { start: "2026-10-01", end: "2026-10-31" }
      })

      expect(json["rows"]).to eq([ { "created_at" => zone.local(2026, 10, 10).to_i * 1000, "Total" => 1 } ])
    end

    it "agrupa por campo personalizado, com os baldes de vazio, e dá nome ao campo" do
      create(:custom_field, organization_id: organization.id, name: "Origem Campanha")
      create(:chat, organization: organization, custom_attributes: { "origem_campanha" => "instagram" })
      create(:chat, organization: organization)

      query({ dataSource: "conversations", dimensions: [ { field: "custom_attributes.origem_campanha" } ], metrics: [ { aggregation: "count", label: "Total" } ] })

      expect(json["rows"]).to contain_exactly(
        { "custom_attributes.origem_campanha" => "instagram", "Total" => 1 },
        { "custom_attributes.origem_campanha" => "__empty__", "Total" => 1 }
      )
      expect(json["fieldLabels"]).to include("custom_attributes.origem_campanha" => "Origem Campanha")
      expect(json["labels"]["custom_attributes.origem_campanha"]).to include("__empty__" => "(vazio)")
    end

    it "dá nome à pessoa quando agrupa por atendente" do
      person = create(:account, organization: organization, name: "Camila Rocha")
      create(:chat, organization: organization, assigned_account_id: person.id)

      query({ dataSource: "conversations", dimensions: [ { field: "assigned_account_id" } ], metrics: [ { aggregation: "count", label: "Total" } ] })

      expect(json["labels"]["assigned_account_id"]).to eq(person.id => "Camila Rocha")
    end

    describe "o que vem do cliente" do
      it "recusa fonte que não existe" do
        query({ dataSource: "accounts" })

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "code")).to eq("unknownDataSource")
      end

      %w[$where regex like eval].each do |operator|
        it "recusa o operador #{operator}" do
          query({ dataSource: "conversations", filters: [ { field: "status", operator: operator, value: "open" } ] })

          expect(response).to have_http_status(:unprocessable_content)
          expect(json.dig("error", "code")).to eq("operatorNotAllowed")
        end
      end

      # A origem ignorava o filtro, e a resposta trazia tudo como se tivesse sido filtrado.
      it "recusa operador que não faz sentido em etiqueta e em presença" do
        query({ dataSource: "conversations", filters: [ { field: "tags", operator: "gt", value: "vip" } ] })
        expect(json.dig("error", "code")).to eq("operatorNotAllowed")

        query({ dataSource: "conversations", filters: [ { field: "booking_attendance", operator: "contains", value: "show" } ] })
        expect(json.dig("error", "code")).to eq("operatorNotAllowed")
      end

      it "recusa operador proibido também no filtro de uma coluna" do
        query({ dataSource: "conversations", metrics: [ { aggregation: "count", filters: [ { field: "status", operator: "$where", value: "1" } ] } ] })

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "code")).to eq("operatorNotAllowed")
      end

      [ "organization_id", "$where", "notes", "contact_storage", "custom_attributes.$where", "custom_attributes.a.b" ].each do |name|
        it "recusa o campo #{name} em filtro" do
          query({ dataSource: "conversations", filters: [ { field: name, operator: "eq", value: "x" } ] })

          expect(response).to have_http_status(:unprocessable_content)
          expect(json.dig("error", "code")).to eq("fieldNotAllowed")
        end
      end

      it "recusa chave de campo personalizado com operador embutido" do
        query({ dataSource: "conversations", filters: [ { field: "custom_attributes", operator: "eq", value: { key: "a.$where", value: "1" } } ] })

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "code")).to eq("fieldNotAllowed")
      end

      it "recusa mapa como valor de filtro, em vez de deixá-lo virar operador" do
        chat = create(:chat, organization: organization, status: "open")

        query({ dataSource: "conversations", filters: [ { field: "status", operator: "eq", value: { "$ne" => "x" } } ] })

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "code")).to eq("invalidFilterValue")
        expect(chat).to be_persisted
      end

      # Em expressão de agregação, texto com `$` é caminho de campo: viraria comparação com outro campo.
      it "trata valor com $ como valor, na métrica condicional" do
        create(:chat, organization: organization, user_name: "Ana", notes: "Ana")
        create(:chat, organization: organization, user_name: "$notes", notes: "x")

        query({ dataSource: "conversations", metrics: [ { aggregation: "count", label: "Iguais", filters: [ { field: "user_name", operator: "eq", value: "$notes" } ] } ] })

        expect(json["rows"]).to eq([ { "Iguais" => 1 } ])
      end

      it "recusa campo fora da lista em métrica" do
        query({ dataSource: "conversations", metrics: [ { field: "$where", aggregation: "sum" } ] })

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "code")).to eq("fieldNotAllowed")
      end

      it "recusa agregação fora da lista" do
        query({ dataSource: "conversations", metrics: [ { field: "unread_messages", aggregation: "$function" } ] })

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "code")).to eq("metricNotAllowed")
      end

      it "recusa somar o que não é número" do
        query({ dataSource: "conversations", metrics: [ { field: "user_name", aggregation: "sum" } ] })

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "code")).to eq("metricNotAllowed")
      end

      it "recusa dimensão fora da lista" do
        query({ dataSource: "conversations", dimensions: [ { field: "organization_id" } ], metrics: [ { aggregation: "count" } ] })

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "code")).to eq("dimensionNotAllowed")
      end

      it "recusa granularidade que não existe" do
        query({ dataSource: "conversations", dimensions: [ { field: "created_at", granularity: "'; DROP TABLE organizations; --" } ], metrics: [ { aggregation: "count" } ] })

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "code")).to eq("invalidGranularity")
      end

      it "recusa ordenação por campo fora da lista" do
        query({ dataSource: "conversations", sort: { field: "contact_storage", direction: "asc" } })

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "code")).to eq("invalidSort")
      end

      it "recusa ordenação fora do resultado, depois de agrupar" do
        query({ dataSource: "conversations", dimensions: [ { field: "status" } ], metrics: [ { aggregation: "count", label: "Total" } ], sort: { field: "$where" } })

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "code")).to eq("invalidSort")
      end

      [ 0, -1, 10_001, "muitos" ].each do |limit|
        it "recusa o limite #{limit}" do
          query({ dataSource: "conversations", limit: limit })

          expect(response).to have_http_status(:unprocessable_content)
          expect(json.dig("error", "code")).to eq("invalidLimit")
        end
      end

      it "campo de data que não é da fonte vale o padrão dela, e nunca chega ao banco" do
        create(:chat, organization: organization)

        query({ dataSource: "conversations", metrics: [ { aggregation: "count", label: "Total" } ], timeRange: { field: "$where" } })

        expect(response).to have_http_status(:ok)
        expect(json.dig("meta", "timeRange", "field")).to eq("created_at")
        expect(json["rows"]).to eq([ { "Total" => 1 } ])
      end

      it "recusa período que não é data, ao contrário, ou longo demais" do
        query({ dataSource: "conversations", timeRange: { start: "ontem" } })
        expect(json.dig("error", "code")).to eq("invalidTimeRange")

        query({ dataSource: "conversations", timeRange: { start: "2026-11-05", end: "2026-11-01" } })
        expect(json.dig("error", "code")).to eq("invalidTimeRange")

        query({ dataSource: "conversations", timeRange: { start: "2020-01-01", end: "2026-11-01" } })
        expect(json.dig("error", "code")).to eq("rangeTooLong")
        expect(response).to have_http_status(:unprocessable_content)
      end

      it "recusa consulta grande demais" do
        query({ dataSource: "conversations", metrics: Array.new(13) { { aggregation: "count" } } })
        expect(json.dig("error", "code")).to eq("tooManyMetrics")

        query({ dataSource: "conversations", filters: Array.new(31) { { field: "status", operator: "eq", value: "open" } } })
        expect(json.dig("error", "code")).to eq("tooManyFilters")

        query({ dataSource: "conversations", dimensions: Array.new(6) { { field: "status" } }, metrics: [ { aggregation: "count" } ] })
        expect(json.dig("error", "code")).to eq("tooManyDimensions")

        query({ dataSource: "conversations", filters: [ { field: "status", operator: "in", value: Array.new(1001) { "x" } } ] })
        expect(json.dig("error", "code")).to eq("invalidFilterValue")
      end
    end

    describe "a fonte daily_stats, no Postgres" do
      before do
        DailyChatStat.create!(organization: organization, day: Date.new(2026, 10, 10), metrics: { "messages_inbound" => 10 })
        DailyChatStat.create!(organization: organization, day: Date.new(2026, 10, 11), metrics: { "messages_inbound" => 30 })
        DailyChatStat.create!(organization: other_organization, day: Date.new(2026, 10, 10), metrics: { "messages_inbound" => 500 })
      end

      let(:period) { { start: "2026-10-01", end: "2026-10-31" } }

      it "soma dentro do jsonb, só da própria organização" do
        query({ dataSource: "daily_stats", metrics: [ { field: "messages_inbound", aggregation: "sum", label: "Recebidas" } ], timeRange: period })

        expect(json["rows"]).to eq([ { "Recebidas" => 40.0 } ])
      end

      it "agrupa por dia, com data em milissegundos no fuso da organização" do
        zone = organization.reporting_zone

        query({ dataSource: "daily_stats", dimensions: [ { field: "day" } ], metrics: [ { field: "messages_inbound", aggregation: "sum", label: "Recebidas" } ], timeRange: period })

        expect(json["rows"]).to eq(
          [
            { "day" => zone.local(2026, 10, 10).to_i * 1000, "Recebidas" => 10.0 },
            { "day" => zone.local(2026, 10, 11).to_i * 1000, "Recebidas" => 30.0 }
          ]
        )
      end

      it "aguenta injeção no nome da métrica: fica só como nome de coluna" do
        label = "x\"; DROP TABLE organizations; --"

        query({ dataSource: "daily_stats", metrics: [ { aggregation: "count", label: label } ], timeRange: period })

        expect(response).to have_http_status(:ok)
        expect(json["rows"]).to eq([ { label => 2 } ])
        expect(Organization.exists?(organization.id)).to be(true)
      end

      it "recusa injeção na ordenação" do
        query({ dataSource: "daily_stats", dimensions: [ { field: "day" } ], metrics: [ { aggregation: "count", label: "Total" } ], sort: { field: "day; DROP TABLE organizations; --" }, timeRange: period })

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "code")).to eq("invalidSort")
      end

      it "recusa filtro por coluna, que a fonte não suporta" do
        query({ dataSource: "daily_stats", metrics: [ { aggregation: "count", filters: [ { field: "day", operator: "eq", value: "2026-10-10" } ] } ], timeRange: period })

        expect(json.dig("error", "code")).to eq("metricFiltersUnsupported")
      end

      it "aplica filtro por valor do jsonb e por data" do
        query({ dataSource: "daily_stats", metrics: [ { aggregation: "count", label: "Dias" } ], filters: [ { field: "messages_inbound", operator: "gte", value: "20" } ], timeRange: period })
        expect(json["rows"]).to eq([ { "Dias" => 1 } ])

        query({ dataSource: "daily_stats", metrics: [ { aggregation: "count", label: "Dias" } ], filters: [ { field: "day", operator: "lt", value: "2026-10-11" } ], timeRange: period })
        expect(json["rows"]).to eq([ { "Dias" => 1 } ])
      end

      it "sem agrupar, traz os campos da lista" do
        query({ dataSource: "daily_stats", timeRange: period, sort: { field: "messages_inbound", direction: "desc" } })

        expect(json["rows"].first).to include("messages_inbound" => 30)
        expect(json["columns"]).to include("day", "messages_inbound")
      end
    end

    describe "permissão por fonte" do
      it "recusa a fonte de quem não tem a permissão dela" do
        person = member_with(organization, custom_dashboards: "all", chat: "all")
        person_headers = auth_headers(person)

        query({ dataSource: "campaigns" }, as_headers: person_headers)
        expect(response).to have_http_status(:forbidden)

        query({ dataSource: "agenda_bookings" }, as_headers: person_headers)
        expect(response).to have_http_status(:forbidden)

        query({ dataSource: "daily_stats" }, as_headers: person_headers)
        expect(response).to have_http_status(:forbidden)

        query({ dataSource: "conversations" }, as_headers: person_headers)
        expect(response).to have_http_status(:ok)
      end

      it "recusa o filtro por agendamento de quem não vê a agenda" do
        person = member_with(organization, custom_dashboards: "all", chat: "all")

        query({ dataSource: "conversations", filters: [ { field: "booking_attendance", operator: "eq", value: "show" } ] }, as_headers: auth_headers(person))

        expect(response).to have_http_status(:forbidden)
      end

      it "só lista as fontes que a pessoa pode consultar" do
        person = member_with(organization, custom_dashboards: "all", contacts: "all")

        get "/custom-dashboards/data-sources", headers: auth_headers(person)

        expect(json["dataSources"].map { |source| source["key"] }).to eq([ "contacts" ])
      end
    end

    describe "quem vê o quê" do
      let(:person) { member_with(organization, custom_dashboards: "all", chat: "all", contacts: "all", chat_list_to: "assigned") }
      let(:person_headers) { auth_headers(person) }

      before do
        create(:chat, organization: organization, assigned_account_id: person.id, user_name: "Minha")
        create(:chat, organization: organization, assigned_account_id: account.id, user_name: "De outra pessoa")
      end

      it "conversas respeitam chat_list_to, listando e contando" do
        query({ dataSource: "conversations" }, as_headers: person_headers)
        expect(json["rows"].map { |row| row["user_name"] }).to eq([ "Minha" ])

        query({ dataSource: "conversations", metrics: [ { aggregation: "count", label: "Total" } ] }, as_headers: person_headers)
        expect(json["rows"]).to eq([ { "Total" => 1 } ])
      end

      it "contatos também" do
        query({ dataSource: "contacts" }, as_headers: person_headers)

        expect(json["rows"].map { |row| row["user_name"] }).to eq([ "Minha" ])
      end

      it "mensagens também" do
        hidden = Chat.where(organization_id: organization.id.to_s, user_name: "De outra pessoa").take
        visible = Chat.where(organization_id: organization.id.to_s, user_name: "Minha").take
        add_message(hidden, kind: :inbound, at: 1.hour.ago)
        add_message(visible, kind: :inbound, at: 1.hour.ago)

        query({ dataSource: "messages", metrics: [ { aggregation: "count", label: "Total" } ] }, as_headers: person_headers)

        expect(json["rows"]).to eq([ { "Total" => 1 } ])
      end
    end

    it "responde 503 quando o Postgres corta por tempo" do
      allow(CustomDashboards::QueryEngine).to receive(:execute).and_raise(CustomDashboards::QueryEngine::DeadlineExceeded)

      query({ dataSource: "daily_stats" })

      expect(response).to have_http_status(:service_unavailable)
      expect(json.dig("error", "code")).to eq("queryTimeout")
    end

    # O editor manda assim enquanto a pessoa não escolhe o campo, e o card não pode virar erro nesse meio tempo.
    it "deixa de fora o filtro de campo personalizado que ainda não tem o campo" do
      create(:chat, organization: organization)

      query({ dataSource: "conversations", metrics: [ { aggregation: "count", label: "Total" } ], filters: [ { field: "custom_attributes", operator: "eq", value: { key: "", value: "" } } ] })

      expect(response).to have_http_status(:ok)
      expect(json["rows"]).to eq([ { "Total" => 1 } ])
    end

    it "responde 503 quando o Mongo corta por tempo, e 422 em outra falha dele" do
      collection = instance_double(Mongo::Collection)
      allow(Chat).to receive(:collection).and_return(collection)

      allow(collection).to receive(:aggregate).and_raise(Mongo::Error::OperationFailure.new("exceeded time limit", nil, code: 50, code_name: "MaxTimeMSExpired"))
      query({ dataSource: "conversations" })
      expect(response).to have_http_status(:service_unavailable)
      expect(json.dig("error", "code")).to eq("queryTimeout")

      allow(collection).to receive(:aggregate).and_raise(Mongo::Error::OperationFailure.new("deu ruim", nil, code: 2, code_name: "BadValue"))
      allow(Rails.logger).to receive(:error)
      query({ dataSource: "conversations" })
      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("queryFailed")
    end

    # `rate_limit` lê o número ao carregar a classe: o teto testado aqui é o de exportação, que é o menor.
    it "limita as exportações por minuto" do
      (CustomDashboardsController::EXPORTS_PER_MINUTE + 1).times do
        post "/custom-dashboards/query-csv", params: { dataSource: "conversations" }, headers: headers, as: :json
      end

      expect(response).to have_http_status(:too_many_requests)
      expect(json.dig("error", "code")).to eq("tooManyRequests")
    end
  end

  describe "POST /custom-dashboards/compound-query" do
    it "devolve o resultado de cada passo pelo id, cada um na própria fonte" do
      create(:chat, organization: organization)
      # O dia do agregado é o do fuso da organização: às 21h em São Paulo, `Date.current` já é amanhã em UTC.
      today = Time.current.in_time_zone(organization.reporting_zone).to_date
      DailyChatStat.create!(organization: organization, day: today, metrics: { "messages_inbound" => 5 })

      post "/custom-dashboards/compound-query", params: {
        steps: [
          { id: "a", dataSource: "conversations", metrics: [ { aggregation: "count", label: "value" } ], timeRange: { field: "created_at" } },
          { id: "b", dataSource: "daily_stats", metrics: [ { field: "messages_inbound", aggregation: "sum", label: "value" } ], timeRange: { field: "created_at" } }
        ]
      }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json["results"]["a"]["rows"]).to eq([ { "value" => 1 } ])
      expect(json["results"]["b"]["rows"]).to eq([ { "value" => 5.0 } ])
      expect(json["results"]["b"]["meta"]["timeRange"]["field"]).to eq("day")
    end

    it "responde 422 sem passos ou com passos demais" do
      post "/custom-dashboards/compound-query", params: { steps: nil }, headers: headers, as: :json
      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("invalidSteps")

      post "/custom-dashboards/compound-query", params: { steps: Array.new(11) { { id: "a", dataSource: "conversations" } } }, headers: headers, as: :json
      expect(json.dig("error", "code")).to eq("invalidSteps")

      post "/custom-dashboards/compound-query", params: { steps: [ "a" ] }, headers: headers, as: :json
      expect(json.dig("error", "code")).to eq("invalidSteps")
    end

    it "um passo com operador proibido recusa a consulta inteira" do
      post "/custom-dashboards/compound-query", params: {
        steps: [
          { id: "a", dataSource: "conversations", metrics: [ { aggregation: "count" } ] },
          { id: "b", dataSource: "conversations", filters: [ { field: "status", operator: "$where", value: "1" } ] }
        ]
      }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("operatorNotAllowed")
    end

    it "os passos dividem o mesmo prazo" do
      create(:chat, organization: organization)
      stub_const("CustomDashboards::QueryEngine::QUERY_TIMEOUT", 0)

      post "/custom-dashboards/compound-query", params: { steps: [ { id: "a", dataSource: "conversations" } ] }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("queryTimeout")
    end

    it "não alcança outra organização em nenhum passo" do
      create(:chat, organization: other_organization)

      post "/custom-dashboards/compound-query", params: { steps: [ { id: "a", dataSource: "conversations", metrics: [ { aggregation: "count", label: "value" } ] } ] }, headers: headers, as: :json

      expect(json["results"]["a"]["rows"]).to eq([])
    end
  end

  describe "POST /custom-dashboards/query-csv" do
    it "gera o CSV com os nomes das colunas e dos valores" do
      2.times { create(:chat, organization: organization, status: "open") }

      post "/custom-dashboards/query-csv", params: { dataSource: "conversations", dimensions: [ { field: "status" } ], metrics: [ { aggregation: "count", label: "Total" } ] }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(response.media_type).to eq("text/csv")
      expect(response.headers["Content-Disposition"]).to include("attachment", ".csv")
      expect(CSV.parse(response.body)).to eq([ [ "Situação", "Total" ], [ "Aberta", "2" ] ])
    end

    it "neutraliza fórmula vinda do nome do contato" do
      create(:chat, organization: organization, user_name: "=HYPERLINK(\"http://mal\")")

      post "/custom-dashboards/query-csv", params: { dataSource: "conversations" }, headers: headers, as: :json

      rows = CSV.parse(response.body, headers: true)
      expect(rows.first["Nome do contato"]).to eq("'=HYPERLINK(\"http://mal\")")
    end

    it "mostra data legível, no fuso da organização" do
      zone = organization.reporting_zone
      create(:chat, organization: organization, created_at: zone.local(2026, 10, 10, 22, 30))

      post "/custom-dashboards/query-csv", params: { dataSource: "conversations", timeRange: { start: "2026-10-01", end: "2026-10-31" } }, headers: headers, as: :json

      expect(CSV.parse(response.body, headers: true).first["Data de criação"]).to eq("10/10/2026 22:30")
    end

    it "responde 422 com operador proibido" do
      post "/custom-dashboards/query-csv", params: { dataSource: "conversations", filters: [ { field: "status", operator: "$where", value: "1" } ] }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
    end
  end

  describe "GET /custom-dashboards/data-sources" do
    it "traz as fontes, com campos, métricas e dimensões, no idioma da requisição" do
      get "/custom-dashboards/data-sources", headers: headers

      expect(json["dataSources"].map { |source| source["key"] }).to eq(%w[conversations contacts messages agenda_bookings campaigns daily_stats hook_logs])

      conversations = json["dataSources"].first
      expect(conversations).to include("label" => "Conversas", "supportsCustomAttributeDimensions" => true)
      expect(conversations["allowedMetrics"]).to include("count", "sum")
      expect(conversations["allowedDimensions"]).to include("status")
      expect(conversations["relatedDimensions"]).to eq([ { "key" => "chat_tag_name", "label" => "Etiqueta" } ])
      expect(conversations["fields"]).to include(
        a_hash_including("key" => "status", "label" => "Situação", "type" => "enum", "enumValues" => %w[open closed]),
        a_hash_including("key" => "tags", "filterType" => "relationship"),
        a_hash_including("key" => "custom_attributes", "filterType" => "custom_attribute"),
        a_hash_including("key" => "booking_attendance", "filterType" => "relationship")
      )

      get "/custom-dashboards/data-sources", params: { locale: "en" }, headers: headers
      expect(json["dataSources"].first["label"]).to eq("Conversations")
    end

    it "tem tradução de todo campo, em todas as fontes, nos dois idiomas" do
      CustomDashboards::DataSourceRegistry.sources.each_value do |source|
        %i[pt-BR en].each do |locale|
          (source.allowed_fields + source.related_dimensions.keys + source.document_id_filters.keys).each do |key|
            expect(I18n.exists?("insights.custom_dashboards.sources.#{source.key}.fields.#{key}", locale)).to be(true), "sem tradução em #{locale}: #{source.key}.#{key}"
          end
          expect(I18n.exists?("insights.custom_dashboards.sources.#{source.key}.label", locale)).to be(true)
        end
      end
    end
  end

  describe "GET /custom-dashboards/filter-options" do
    it "traz as opções da organização, com as chaves dos campos intactas" do
      person = create(:account, organization: organization, name: "Camila Rocha")
      team = create(:team, organization: organization, name: "Comercial")
      create(:chat_tag, organization_id: organization.id, name: "vip")
      create(:chat_tag, organization_id: other_organization.id, name: "de-fora")
      create(:custom_field, organization_id: organization.id, name: "Cidade", value_type: "list", option_values: %w[BH SP])

      get "/custom-dashboards/filter-options", params: { sourceKey: "conversations" }, headers: headers

      options = json["filterOptions"]
      expect(options["assigned_account_id"]).to include({ "value" => person.id, "label" => "Camila Rocha" })
      expect(options["team_id"]).to eq([ { "value" => team.id, "label" => "Comercial" } ])
      expect(options["tags"]).to eq([ { "value" => "vip", "label" => "vip" } ])
      expect(options["custom_attributes"]).to eq([ { "value" => "cidade", "label" => "Cidade", "valueType" => "list", "optionValues" => %w[BH SP] } ])
      expect(options["booking_attendance"]).to eq(
        [ { "value" => "show", "label" => "Compareceu" }, { "value" => "no_show", "label" => "Não compareceu" } ]
      )
    end

    it "responde 404 para fonte que não existe e 403 para a que a pessoa não vê" do
      get "/custom-dashboards/filter-options", params: { sourceKey: "accounts" }, headers: headers
      expect(response).to have_http_status(:not_found)

      get "/custom-dashboards/filter-options", params: { sourceKey: "campaigns" }, headers: auth_headers(member_with(organization, custom_dashboards: "all"))
      expect(response).to have_http_status(:forbidden)
    end
  end
end
