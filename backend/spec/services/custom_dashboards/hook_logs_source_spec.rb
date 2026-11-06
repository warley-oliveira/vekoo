require "rails_helper"

# A fonte `hook_logs`, com a agregação de verdade no Mongo de teste.
RSpec.describe CustomDashboards::Sources::HookLogs do
  let(:organization) { create(:organization) }
  let(:account) { create(:account, organization: organization) }
  let(:hook) { create(:hook, organization: organization, name: "Pedido aprovado") }

  def add_log(status, target: hook, **attributes)
    HookLog.create!(
      hook_id: target.id, hook_uid: target.uid, hook_name: target.name, organization_id: target.organization_id,
      status: status, hook_status: "active", **attributes
    )
  end

  def execute(**query)
    CustomDashboards::QueryEngine.execute(account: account, data_source: "hook_logs", query: query.deep_stringify_keys)
  end

  def count_metric
    { aggregation: "count", label: "Total" }
  end

  it "conta por situação, com o nome de cada valor" do
    2.times { add_log("success") }
    add_log("error", status_code: 500)

    result = execute(dimensions: [ { field: "status" } ], metrics: [ count_metric ], sort: { field: "Total", direction: "desc" })

    expect(result[:rows]).to eq([ { "status" => "success", "Total" => 2 }, { "status" => "error", "Total" => 1 } ])
    expect(result[:labels]["status"]).to include("success" => "Sucesso", "error" => "Erro")
  end

  it "agrupa por webhook, com a média de tempo" do
    other = create(:hook, organization: organization, name: "Boleto pago")
    add_log("success", processing_time_ms: 100.0)
    add_log("success", processing_time_ms: 300.0)
    add_log("success", target: other, processing_time_ms: 50.0)

    rows = execute(
      dimensions: [ { field: "hook_name" } ],
      metrics: [ { field: "processing_time_ms", aggregation: "avg", label: "Tempo" } ],
      sort: { field: "Tempo", direction: "desc" }
    )[:rows]

    expect(rows).to eq([ { "hook_name" => "Pedido aprovado", "Tempo" => 200.0 }, { "hook_name" => "Boleto pago", "Tempo" => 50.0 } ])
  end

  it "filtra por código HTTP e pela situação do webhook na hora" do
    add_log("error", status_code: 500)
    add_log("error", status_code: 401, hook_status: "test")

    expect(execute(filters: [ { field: "status_code", operator: "gte", value: 500 } ], metrics: [ count_metric ])[:rows]).to eq([ { "Total" => 1 } ])
    expect(execute(filters: [ { field: "hook_status", operator: "eq", value: "test" } ], metrics: [ count_metric ])[:rows]).to eq([ { "Total" => 1 } ])
  end

  it "não alcança outra organização" do
    add_log("success")
    add_log("success", target: create(:hook))

    expect(execute(metrics: [ count_metric ])[:rows]).to eq([ { "Total" => 1 } ])
  end

  it "o período padrão é por `created_at`, e o que passou dele não conta" do
    add_log("success")
    add_log("success", created_at: 120.days.ago)

    expect(execute(metrics: [ count_metric ])[:rows]).to eq([ { "Total" => 1 } ])
  end

  it "o que veio na requisição não sai" do
    add_log("success", request_body: { "cpf" => "123" }, request_headers: { "authorization" => "segredo" }, request_ip: "10.0.0.1")

    row = execute[:rows].first

    expect(row).to include("hook_name" => "Pedido aprovado", "status" => "success")
    expect(row.keys).not_to include("request_body", "request_headers", "request_query", "request_ip", "error_message")
  end

  it "recusa campo que não é da fonte" do
    expect { execute(filters: [ { field: "request_body", operator: "eq", value: "x" } ]) }.to raise_error(CustomDashboards::QueryEngine::QueryError)
  end

  describe "na API", type: :request do
    let(:headers) { auth_headers(account) }

    it "responde com os logs da organização" do
      add_log("error", status_code: 500)

      post "/custom-dashboards/query", params: { dataSource: "hook_logs", dimensions: [ { field: "status" } ], metrics: [ count_metric ] }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json["rows"]).to eq([ { "status" => "error", "Total" => 1 } ])
    end

    it "é de quem pode ver os webhooks" do
      person = member_with(organization, custom_dashboards: "all", chat: "all")

      post "/custom-dashboards/query", params: { dataSource: "hook_logs" }, headers: auth_headers(person), as: :json
      expect(response).to have_http_status(:forbidden)

      get "/custom-dashboards/data-sources", headers: auth_headers(person)
      expect(json["dataSources"].map { |source| source["key"] }).not_to include("hook_logs")
    end

    it "traz os campos traduzidos nos dois idiomas" do
      get "/custom-dashboards/data-sources", params: { locale: "en" }, headers: headers

      source = json["dataSources"].find { |item| item["key"] == "hook_logs" }
      expect(source).to include("label" => "Webhook logs", "allowedDimensions" => %w[status hook_name hook_status created_at])
      expect(source["fields"].find { |field| field["key"] == "status_code" }).to include("label" => "HTTP code", "type" => "number")
    end
  end
end
