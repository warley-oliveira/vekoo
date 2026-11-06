# frozen_string_literal: true

# Um card do dashboard personalizado (KPI, gráfico, tabela...), dentro do documento do dashboard.
#
# `query`, `visual_config` e `layout` são da tela: chegam em camelCase e voltam como foram, com chaves que
# são dados (valores de etiqueta em `valueMap`, por exemplo). Quem executa consulta é
# `POST /custom-dashboards/query`, que confere o que recebe: o que está guardado aqui nunca roda sozinho.
class CustomDashboardWidget
  include Mongoid::Document
  include Mongoid::Timestamps

  embedded_in :custom_dashboard, inverse_of: :widgets

  WIDGET_TYPES = %w[
    kpi line_chart bar_chart pie_chart donut_chart
    area_chart table funnel heatmap
    gauge number_trend rich_text progress_bar radar
    section_divider
  ].freeze
  NO_DATA_TYPES = %w[rich_text section_divider].freeze
  # Por mapa. O documento inteiro tem o teto de 16 MB do Mongo, e a lista de widgets tem teto próprio.
  MAX_MAP_BYTES = 32.kilobytes

  field :widget_type, type: String
  field :title, type: String
  field :data_source, type: String
  field :query, type: Hash, default: {}
  field :visual_config, type: Hash, default: {}
  field :layout, type: Hash, default: -> { { "x" => 0, "y" => 0, "w" => 4, "h" => 3 } }
  field :position, type: Integer, default: 0

  validates :widget_type, presence: true, inclusion: { in: WIDGET_TYPES }
  validates :title, presence: true, length: { maximum: 200 }
  validates :data_source, presence: true, unless: -> { NO_DATA_TYPES.include?(widget_type) }
  validate :data_source_is_known
  validate :maps_within_limit

  private

  def data_source_is_known
    return if data_source.blank? || CustomDashboards::DataSourceRegistry.find_source(data_source)

    errors.add(:data_source, :inclusion)
  end

  def maps_within_limit
    { query: query, visual_config: visual_config, layout: layout }.each do |name, map|
      errors.add(name, :too_long, count: MAX_MAP_BYTES) if map.to_json.bytesize > MAX_MAP_BYTES
    end
  end
end
