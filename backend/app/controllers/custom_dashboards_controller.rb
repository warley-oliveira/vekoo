# frozen_string_literal: true

# Dashboards personalizados: o cadastro e a consulta dos widgets. `CustomDashboards::QueryEngine` confere
# tudo o que vem do cliente, e a organização sai sempre da sessão.
#
# Na origem, criar exigia `super_user` e o recurso dependia de um liga-desliga por conta. Aqui quem manda é
# a permissão `custom_dashboards`.
class CustomDashboardsController < PlatformController
  # Mapas da tela: `valueMap` tem como chave o valor de uma etiqueta, e isso não pode virar snake_case.
  self.opaque_params += %w[query visual_config layout global_filters]

  # Cada widget é uma consulta, e o dashboard abre vários de uma vez. O teto é por pessoa, e o CSV pesa mais.
  QUERIES_PER_MINUTE = 300
  EXPORTS_PER_MINUTE = 10

  require_permission :custom_dashboards

  before_action :set_dashboard, only: %i[show update destroy duplicate toggle_favorite]

  rate_limit to: QUERIES_PER_MINUTE, within: 1.minute, only: %i[query compound_query],
    by: -> { current_account.id }, with: -> { render_too_many_requests }, name: "custom-dashboards-query"
  rate_limit to: EXPORTS_PER_MINUTE, within: 1.minute, only: :query_csv,
    by: -> { current_account.id }, with: -> { render_too_many_requests }, name: "custom-dashboards-csv"

  rescue_from CustomDashboards::QueryEngine::QueryError do |error|
    render_error(status: :unprocessable_content, code: error.code, field: error.field, message: error.message)
  end

  rescue_from CustomDashboards::QueryEngine::Forbidden do
    render_forbidden
  end

  rescue_from CustomDashboards::Save::InvalidWidgets do |error|
    render_error(status: :unprocessable_content, code: error.code, field: "widgets", message: error.message, details: error.details)
  end

  rescue_from CustomDashboards::QueryEngine::DeadlineExceeded do
    render_query_timeout
  end

  # O `max_time_ms` cortou: é recusa, e o que fazer é escolher menos. O resto é erro do Mongo com uma
  # consulta que passou pela validação: fica no log, e a tela recebe uma resposta que dá para mostrar.
  rescue_from Mongo::Error::OperationFailure do |error|
    if error.code == Insights::QueryTimeout::MAX_TIME_EXPIRED
      render_query_timeout
    else
      Rails.logger.error("[CustomDashboardsController] #{error.class}: #{error.message}")
      render_error(status: :unprocessable_content, code: "queryFailed", message: t("insights.custom_dashboards.errors.query_failed"))
    end
  end

  # GET /custom-dashboards
  def index
    records, meta = paginate(current_organization.custom_dashboards.order_by(updated_at: :desc), per_page: Paginated::MAX_PER_PAGE)
    list = records.to_a
    creators = current_organization.accounts.where(id: list.map(&:created_by_account_id).uniq).pluck(:id, :name).to_h

    render json: { customDashboards: list.map { |dashboard| CustomDashboardSerializer.summary(dashboard, creators: creators) }, meta: meta }
  end

  def show
    render json: { customDashboard: CustomDashboardSerializer.one(@dashboard) }
  end

  def create
    dashboard = CustomDashboard.new(organization_id: current_organization.id.to_s, created_by_account_id: current_account.id.to_s)
    CustomDashboards::Save.new(dashboard, dashboard_attributes, widgets: widget_list).call

    render json: { customDashboard: CustomDashboardSerializer.one(dashboard) }, status: :created
  end

  def update
    CustomDashboards::Save.new(@dashboard, dashboard_attributes, widgets: widget_list).call

    render json: { customDashboard: CustomDashboardSerializer.one(@dashboard) }
  end

  def destroy
    @dashboard.destroy!

    head :no_content
  end

  # POST /custom-dashboards/:id/duplicate
  def duplicate
    render json: { customDashboard: CustomDashboardSerializer.one(@dashboard.duplicate_for(account_id: current_account.id)) }, status: :created
  end

  # PATCH /custom-dashboards/:id/toggle-favorite
  def toggle_favorite
    @dashboard.update!(is_favorite: !@dashboard.is_favorite)

    render json: { isFavorite: @dashboard.is_favorite }
  end

  # POST /custom-dashboards/query
  def query
    render json: query_response(run_query(params))
  end

  # POST /custom-dashboards/compound-query
  #
  # Até 10 passos, cada um uma consulta independente, e a tela calcula a fórmula em cima. Um depois do
  # outro, dividindo o mesmo prazo: na origem cada passo era uma thread, sem devolver a conexão do banco
  # e sem o idioma da requisição, e dez agregações pesadas de uma vez é justamente o que derruba o servidor.
  def compound_query
    steps = params[:steps]
    unless steps.is_a?(Array) && steps.size.between?(1, MAX_COMPOUND_STEPS) && steps.all? { |step| step.respond_to?(:permit) }
      return render_error(status: :unprocessable_content, code: "invalidSteps", field: "steps", message: t("insights.custom_dashboards.errors.invalid_steps", max: MAX_COMPOUND_STEPS))
    end

    deadline = CustomDashboards::QueryEngine::QUERY_TIMEOUT.seconds.from_now
    results = steps.to_h { |step| [ step[:id].to_s, query_response(run_query(step, deadline: deadline)) ] }

    render json: { results: results }
  end

  # POST /custom-dashboards/query-csv
  def query_csv
    send_data CustomDashboards::RowValues.to_csv(run_query(params), current_organization.reporting_zone),
      type: "text/csv; charset=utf-8",
      disposition: "attachment",
      filename: "dashboard-#{Time.current.in_time_zone(current_organization.reporting_zone).strftime('%Y%m%d-%H%M%S')}.csv"
  end

  # GET /custom-dashboards/data-sources
  def data_sources
    render json: { dataSources: CustomDashboards::DataSourceRegistry.all_sources(current_account) }
  end

  # GET /custom-dashboards/filter-options?sourceKey=conversations
  def filter_options
    source = CustomDashboards::DataSourceRegistry.find_source(params[:source_key])
    return render_not_found unless source
    return render_forbidden unless source.available_to?(current_account)

    render json: { filterOptions: CustomDashboards::DataSourceRegistry.filter_options(source, current_account) }
  end

  private

  MAX_COMPOUND_STEPS = 10

  def render_query_timeout
    render_error(status: :service_unavailable, code: "queryTimeout", message: t("insights.errors.query_timeout"))
  end

  def set_dashboard
    @dashboard = current_organization.custom_dashboards.where(id: params[:id]).take
    render_not_found unless @dashboard
  end

  def dashboard_params
    @dashboard_params ||= params.require(:custom_dashboard)
  end

  def dashboard_attributes
    dashboard_params.permit(:name, :description, :icon, :is_favorite, :is_default, global_filters: {}).to_h
  end

  # Sem o campo, ou com `null`, os widgets ficam como estão. Só a lista vazia apaga todos.
  def widget_list
    return nil if dashboard_params[:widgets].nil?

    Array(dashboard_params[:widgets]).select { |widget| widget.respond_to?(:permit) }.map do |widget|
      widget.permit(:id, :widget_type, :title, :data_source, :position, query: {}, visual_config: {}, layout: {}).to_h
    end
  end

  def run_query(source_params, deadline: nil)
    options = { account: current_account, data_source: source_params[:data_source], query: query_params(source_params) }
    options[:deadline] = deadline if deadline

    CustomDashboards::QueryEngine.execute(**options)
  end

  def query_response(result)
    {
      rows: CustomDashboards::RowValues.json_rows(result[:rows], current_organization.reporting_zone),
      columns: result[:columns],
      labels: result[:labels],
      fieldLabels: result[:field_labels],
      meta: result[:meta]
    }
  end

  def query_params(source)
    permitted = source.permit(:limit, sort: %i[field direction], time_range: %i[field start end], dimensions: [ %i[field granularity] ]).to_h
    permitted["metrics"] = normalize_metrics(source[:metrics])
    permitted["filters"] = normalize_filters(source[:filters])
    permitted
  end

  # Métricas não passam por `permit` aninhado: os filtros por métrica carregam `value` polimórfico (texto,
  # lista ou { key, value }), que o `permit` descartaria.
  def normalize_metrics(raw_metrics)
    return [] unless raw_metrics.is_a?(Array)

    raw_metrics.filter_map do |raw|
      next unless raw.respond_to?(:permit)

      metric = {}
      metric["field"] = raw[:field].to_s if raw[:field].present?
      metric["aggregation"] = raw[:aggregation].to_s if raw[:aggregation].present?
      metric["label"] = raw[:label].to_s if raw[:label].present?
      metric["filters_operator"] = raw[:filters_operator].to_s if raw[:filters_operator].present?
      filters = normalize_filters(raw[:filters])
      metric["filters"] = filters if filters.any?
      metric
    end
  end

  def normalize_filters(raw_filters)
    return [] unless raw_filters.is_a?(Array)

    raw_filters.filter_map do |raw|
      next unless raw.respond_to?(:permit) && raw[:field].present? && raw[:operator].present?

      value = normalize_filter_value(raw[:value])
      next if unfilled_custom_attribute?(raw[:field], value)

      { "field" => raw[:field].to_s, "operator" => raw[:operator].to_s, "value" => value }
    end
  end

  # A tela manda o filtro de campo personalizado com `key: ""` enquanto a pessoa não escolhe o campo. Fica de
  # fora, como na origem, para o card não virar erro no meio da edição.
  def unfilled_custom_attribute?(field, value)
    field.to_s == "custom_attributes" && value.is_a?(Hash) && value["key"].blank?
  end

  # Valor sempre vira texto, lista de texto, ou `{ key, value }`: nada de mapa solto chega ao construtor.
  def normalize_filter_value(value)
    case value
    when Array then value.map(&:to_s)
    when nil then nil
    else value.respond_to?(:permit) ? value.permit(:key, :value, value: []).to_h : value.to_s
    end
  end
end
