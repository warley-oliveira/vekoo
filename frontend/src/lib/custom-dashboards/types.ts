// O formato dos dashboards personalizados. `query`, `visualConfig` e `layout` são da tela: o servidor só guarda e
// devolve. As chaves de `FieldOption`, das linhas e de `valueMap` são dados, e ficam em snake_case quando vêm assim.

export type WidgetType =
  | "kpi"
  | "number_trend"
  | "gauge"
  | "progress_bar"
  | "line_chart"
  | "bar_chart"
  | "area_chart"
  | "pie_chart"
  | "donut_chart"
  | "radar"
  | "heatmap"
  | "table"
  | "funnel"
  | "rich_text"
  | "section_divider"

export type FilterOperator =
  | "eq"
  | "ne"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "nin"
  | "contains"
  | "exists"
  | "not_exists"

export type QueryFilter = {
  field: string
  operator: FilterOperator
  value: unknown
}

export type Aggregation = "count" | "sum" | "avg" | "min" | "max"
export type Granularity = "day" | "week" | "month" | "year"

/** Uma medida. Com `filters`, é condicional. Com `formula`, é coluna calculada na tela, e não vai para o servidor. */
export type WidgetMetric = {
  field?: string
  aggregation?: Aggregation
  label?: string
  filters?: QueryFilter[]
  filtersOperator?: "and" | "or"
  formula?: string
}

export type WidgetDimension = {
  field: string
  granularity?: Granularity
}

/** O período do próprio card. Sem `preset` nem `start`, ele segue o do painel. `field` diz qual data conta. */
export type CardPeriod = {
  field?: string
  preset?: string
  start?: string
  end?: string
}

/** Um passo de fórmula, referenciado por letra: A, B, C. */
export type FormulaStep = {
  id: string
  label: string
  dataSource: string
  metric?: string
  aggregation: Aggregation
  filters?: QueryFilter[]
}

export type WidgetQuery = {
  dataSource?: string
  metrics?: WidgetMetric[]
  dimensions?: WidgetDimension[]
  filters?: QueryFilter[]
  sort?: { field: string; direction: "asc" | "desc" }
  limit?: number
  timeRange?: CardPeriod
  /** Fórmula sobre várias consultas, feita na tela. */
  compound?: boolean
  formulaSteps?: FormulaStep[]
  formula?: string
}

export type WidgetLayout = { x: number; y: number; w: number; h: number }

export type ValueMapEntry = { label?: string; color?: string }
export type ThresholdLine = { value: number; label?: string; color?: string }
export type WidgetAnnotation = { id: string; text: string; createdAt: string; author?: string }
export type ConditionalRule = {
  operator: "gt" | "gte" | "lt" | "lte" | "eq"
  value: number
  color: string
}
export type ValueFormat = "number" | "percent" | "currency" | "duration"

export type VisualConfig = {
  icon?: string
  /** Chave da paleta (`cat-2`, `accent`) ou hex escolhido pela pessoa. */
  color?: string
  /** A cor de cada medida, na ordem delas. */
  colors?: string[]
  subtitle?: string
  showLegend?: boolean
  showGrid?: boolean
  showValues?: boolean
  curved?: boolean
  stacked?: boolean
  horizontal?: boolean
  opacity?: number
  format?: ValueFormat
  prefix?: string
  suffix?: string
  decimalPrecision?: number
  fontSize?: number
  comparisonLabel?: string
  /** Comparar com o período anterior, do mesmo tamanho. */
  compare?: boolean
  /** Para o que melhora caindo, como tempo de espera. */
  goodWhen?: "up" | "down"
  goalValue?: number
  goalLabel?: string
  /** Texto em markdown do card de texto. */
  content?: string
  valueMap?: Record<string, ValueMapEntry>
  thresholds?: ThresholdLine[]
  conditionalRules?: ConditionalRule[]
  annotations?: WidgetAnnotation[]
  /** Colunas da tabela de registros. */
  columns?: { field: string; label: string }[]
  showTotals?: boolean
  locked?: boolean
}

export type DashboardWidget = {
  id: string
  widgetType: WidgetType
  title: string
  dataSource: string | null
  query: WidgetQuery
  visualConfig: VisualConfig
  layout: WidgetLayout
  position: number
}

export type NewWidget = Omit<DashboardWidget, "id" | "position" | "layout"> & {
  layout?: Partial<WidgetLayout>
}

export type CustomDashboardSummary = {
  id: string
  name: string
  description: string | null
  icon: string | null
  isFavorite: boolean
  isDefault: boolean
  createdByAccountId: string
  createdByName?: string | null
  createdAt: number
  updatedAt: number
  widgetsCount: number
}

export type CustomDashboard = Omit<CustomDashboardSummary, "widgetsCount" | "createdByName"> & {
  globalFilters: Record<string, unknown>
  widgets: DashboardWidget[]
}

export type DataSourceField = {
  key: string
  label: string
  type: "string" | "number" | "date" | "enum" | "boolean" | "array" | "custom_attribute"
  enumValues: (string | null)[] | null
  filterType?: "relationship" | "custom_attribute"
  /** Só filtro: nunca sai nas linhas, nem agrupa. */
  virtual?: boolean
}

export type DataSourceMeta = {
  key: string
  label: string
  fields: DataSourceField[]
  allowedMetrics: Aggregation[]
  allowedDimensions: string[]
  relatedDimensions: { key: string; label: string }[]
  supportsCustomAttributeDimensions: boolean
  supportsMetricFilters: boolean
}

export type FilterOption = { value: string; label: string }
export type CustomAttributeOption = FilterOption & { valueType: string; optionValues: string[] }

/** Por campo. Em `custom_attributes`, as opções trazem também o tipo do campo personalizado. */
export type FilterOptions = Record<string, FilterOption[]> & {
  custom_attributes?: CustomAttributeOption[]
}

export type QueryRow = Record<string, unknown>

export type QueryResult = {
  rows: QueryRow[]
  columns: string[]
  labels?: Record<string, Record<string, string>>
  fieldLabels?: Record<string, string>
  meta?: {
    total: number
    truncated: boolean
    timeRange?: { field: string; from: number; to: number }
  }
}
