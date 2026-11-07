import {
  PERIOD_PRESETS,
  presetRange,
  type DashboardPeriod,
  type PeriodPreset,
  type PeriodSlice,
} from "@/hooks/insights/use-dashboard-period"
import { toDateInputValue } from "@/lib/date-format"

import { columnLetter, WIDGET_SPECS } from "./catalog"
import type {
  Aggregation,
  DashboardWidget,
  DataSourceField,
  DataSourceMeta,
  FormulaStep,
  QueryFilter,
  VisualConfig,
  WidgetDimension,
  WidgetMetric,
  WidgetQuery,
} from "./types"

// Do que está guardado num card ao corpo de `POST /custom-dashboards/query`. Nada aqui fala com a rede.

const VALUELESS_OPERATORS = new Set(["exists", "not_exists"])

/** Sem agrupar, ou por categoria: mais linhas que isto não cabem num gráfico. Quem quer mais, pede no card. */
export const DEFAULT_ROWS = 100

export type DateRange = { start: string; end: string }

export type ApiMetric = {
  field?: string
  aggregation: Aggregation
  label: string
  filters?: QueryFilter[]
  filtersOperator?: "and" | "or"
}

export type QueryPayload = {
  id?: string
  dataSource: string
  metrics: ApiMetric[]
  dimensions: WidgetDimension[]
  filters: QueryFilter[]
  timeRange: { field?: string; start: string; end: string }
  sort?: { field: string; direction: "asc" | "desc" }
  limit?: number
}

/* ---------- leitura do que está guardado ---------- */

type LegacyQuery = WidgetQuery & {
  metric?: string
  aggregation?: Aggregation
  groupBy?: string
  timeGrouping?: WidgetDimension["granularity"]
  sortBy?: string
  sortDirection?: "asc" | "desc"
}

/**
 * Card que veio no formato curto da origem (`metric`, `groupBy`, `timeGrouping`): a mesma consulta, no formato da API.
 * Nada escreve mais assim, mas o que foi guardado continua abrindo.
 */
export function normalizeQuery(raw: WidgetQuery | null | undefined): WidgetQuery {
  const { metric, aggregation, groupBy, timeGrouping, sortBy, sortDirection, ...query } = (raw ?? {}) as LegacyQuery

  if (!query.metrics?.length && (metric || aggregation)) {
    query.metrics = [{ aggregation: aggregation ?? "count", ...(metric ? { field: metric } : {}) }]
  }
  if (!query.dimensions?.length && groupBy) {
    query.dimensions = [{ field: groupBy, ...(timeGrouping ? { granularity: timeGrouping } : {}) }]
  }
  if (!query.sort && sortBy) {
    query.sort = { field: sortBy, direction: sortDirection ?? "asc" }
  }
  return query
}

export function isFormulaQuery(query: WidgetQuery): boolean {
  return Boolean(query.compound && query.formulaSteps?.length && query.formula?.trim())
}

/** Tabela sem medida nem agrupamento: cada linha é um registro. */
export function isRecordsTable(widget: { widgetType: string; query: WidgetQuery }): boolean {
  return widget.widgetType === "table" && !widget.query.metrics?.length && !widget.query.dimensions?.length
}

/* ---------- campos ---------- */

export function isDateField(source: DataSourceMeta | undefined, field: string | undefined): boolean {
  return Boolean(field && source?.fields.some((item) => item.key === field && item.type === "date"))
}

export function dateFields(source: DataSourceMeta | undefined): DataSourceField[] {
  return source?.fields.filter((field) => field.type === "date") ?? []
}

/** A data que representa a fonte: a primeira dimensão de data, que é a que a API usa de padrão. */
export function defaultDateField(source: DataSourceMeta | undefined): string | undefined {
  if (!source) return undefined
  return source.allowedDimensions.find((key) => isDateField(source, key)) ?? dateFields(source)[0]?.key
}

/** Dá para agrupar por isto: as dimensões da fonte e as relacionadas. Data e campo personalizado ficam à parte. */
export function categoryDimensions(source: DataSourceMeta | undefined): { key: string; label: string }[] {
  if (!source) return []
  const labelOf = (key: string) => source.fields.find((field) => field.key === key)?.label ?? key
  return [
    ...source.allowedDimensions.filter((key) => !isDateField(source, key)).map((key) => ({ key, label: labelOf(key) })),
    ...source.relatedDimensions,
  ]
}

export function splitDimensions(dimensions: WidgetDimension[] | undefined, source: DataSourceMeta | undefined) {
  const list = dimensions ?? []
  const isTime = (dimension: WidgetDimension) => Boolean(dimension.granularity) || isDateField(source, dimension.field)
  return {
    time: list.find(isTime) ?? null,
    category: list.find((dimension) => !isTime(dimension)) ?? null,
  }
}

/* ---------- medidas ---------- */

/** A coluna de cada medida no resultado: o nome dela, ou a letra. Dois nomes iguais viram "Total" e "Total (2)", como na API. */
export function metricKeys(metrics: WidgetMetric[] | undefined): string[] {
  const seen = new Map<string, number>()
  return (metrics ?? []).map((metric, index) => {
    const base = metric.label?.trim() || columnLetter(index)
    const count = (seen.get(base) ?? 0) + 1
    seen.set(base, count)
    return count === 1 ? base : `${base} (${count})`
  })
}

export function effectiveMetrics(query: WidgetQuery): WidgetMetric[] {
  return query.metrics?.length ? query.metrics : [{ aggregation: "count" }]
}

function isFilled(filter: QueryFilter): boolean {
  if (VALUELESS_OPERATORS.has(filter.operator)) return true
  if (Array.isArray(filter.value)) return filter.value.length > 0
  return filter.value !== "" && filter.value !== null && filter.value !== undefined
}

/** Filtro pela metade não vale: ele ainda vai ser preenchido, e não pode zerar o card na prévia. */
function completeFilters(filters: QueryFilter[] | undefined): QueryFilter[] {
  return (filters ?? []).filter(isFilled).map(({ field, operator, value }) => ({ field, operator, value: value ?? null }))
}

function apiMetric(metric: WidgetMetric, key: string): ApiMetric {
  const aggregation = metric.aggregation ?? "count"
  const filters = completeFilters(metric.filters)
  return {
    aggregation,
    label: key,
    ...(aggregation !== "count" && metric.field ? { field: metric.field } : {}),
    ...(filters.length ? { filters } : {}),
    ...(filters.length && metric.filtersOperator ? { filtersOperator: metric.filtersOperator } : {}),
  }
}

/* ---------- período ---------- */

/** O período que vale para o card: o dele, ou o do painel. */
export function cardRange(query: WidgetQuery, period: PeriodSlice): DateRange {
  const own = query.timeRange
  if (own?.preset && PERIOD_PRESETS.includes(own.preset as PeriodPreset)) {
    const { from, to } = presetRange(own.preset as PeriodPreset)
    return { start: toDateInputValue(from), end: toDateInputValue(to) }
  }
  if (own?.start && own.end) return { start: own.start, end: own.end }
  return { start: period.dateStart, end: period.dateEnd }
}

export function hasOwnPeriod(query: WidgetQuery): boolean {
  return Boolean(query.timeRange?.preset || (query.timeRange?.start && query.timeRange.end))
}

const DAY_MS = 86_400_000

function dayToUtc(value: string): number {
  const [year, month, day] = value.split("-").map(Number)
  return Date.UTC(year, month - 1, day)
}

function utcToDay(value: number): string {
  return new Date(value).toISOString().slice(0, 10)
}

/** O mesmo tanto de dias, logo antes. Em "hoje" não há comparação: um dia pela metade contra um inteiro engana. */
export function previousRange(query: WidgetQuery, period: DashboardPeriod): DateRange | null {
  if (!hasOwnPeriod(query)) {
    return period.previous ? { start: period.previous.dateStart, end: period.previous.dateEnd } : null
  }
  if (query.timeRange?.preset === "today") return null

  const range = cardRange(query, period)
  const start = dayToUtc(range.start)
  const days = Math.round((dayToUtc(range.end) - start) / DAY_MS) + 1
  return { start: utcToDay(start - days * DAY_MS), end: utcToDay(start - DAY_MS) }
}

/* ---------- corpo da consulta ---------- */

function resolveSort(
  query: WidgetQuery,
  metricLabels: string[],
  source: DataSourceMeta | undefined
): QueryPayload["sort"] {
  const dimensions = query.dimensions ?? []
  if (query.sort?.field) {
    const known = metricLabels.includes(query.sort.field) || dimensions.some((item) => item.field === query.sort?.field)
    if (known) return query.sort
  }
  if (dimensions.length === 0) return undefined

  const { time } = splitDimensions(dimensions, source)
  if (time) return { field: time.field, direction: query.sort?.direction ?? "asc" }
  return metricLabels[0] ? { field: metricLabels[0], direction: query.sort?.direction ?? "desc" } : undefined
}

/**
 * A consulta comum. Série no tempo vem em ordem de data. Categoria vem do maior para o menor, e com um teto, porque
 * ninguém lê 500 barras. Duas dimensões não têm teto próprio: cortar as linhas tiraria pontos do meio da série.
 */
export function buildQueryPayload(
  widget: Pick<DashboardWidget, "widgetType" | "dataSource" | "query">,
  range: DateRange,
  source: DataSourceMeta | undefined
): QueryPayload | null {
  const { query } = widget
  const dataSource = query.dataSource || widget.dataSource
  if (!dataSource) return null

  const records = isRecordsTable(widget)
  const metrics = records ? [] : effectiveMetrics(query)
  const keys = metricKeys(metrics)
  // Coluna de fórmula é da tela: o servidor nunca vê.
  const apiMetrics = metrics.flatMap((metric, index) =>
    metric.formula === undefined ? [apiMetric(metric, keys[index])] : []
  )
  const dimensions = query.dimensions ?? []
  const { time } = splitDimensions(dimensions, source)
  const field = query.timeRange?.field ?? time?.field
  const sort = records ? query.sort : resolveSort(query, apiMetrics.map((metric) => metric.label), source)
  const limit = query.limit ?? (records || (dimensions.length === 1 && !time) ? DEFAULT_ROWS : undefined)

  return {
    dataSource,
    metrics: apiMetrics,
    // Campo personalizado é texto: a API recusa granularidade nele.
    dimensions: dimensions.map((dimension) =>
      dimension.field.startsWith("custom_attributes.") ? { field: dimension.field } : dimension
    ),
    filters: completeFilters(query.filters),
    timeRange: { ...(field ? { field } : {}), start: range.start, end: range.end },
    ...(sort ? { sort } : {}),
    ...(limit ? { limit } : {}),
  }
}

/** A dimensão de cada passo de fórmula: a mesma, ou a data equivalente na fonte dele. Sem equivalente, o passo não agrupa. */
export function stepDimension(
  dimension: WidgetDimension | undefined,
  step: FormulaStep,
  sources: DataSourceMeta[]
): WidgetDimension | null {
  if (!dimension) return null
  const source = sources.find((item) => item.key === step.dataSource)
  if (!source) return null

  const available =
    source.allowedDimensions.includes(dimension.field) ||
    source.relatedDimensions.some((related) => related.key === dimension.field) ||
    source.fields.some((field) => field.key === dimension.field && field.type !== "array") ||
    (source.supportsCustomAttributeDimensions && dimension.field.startsWith("custom_attributes."))
  if (available) return dimension

  const isDate = Boolean(dimension.granularity) || sources.some((item) => isDateField(item, dimension.field))
  if (!isDate) return null

  const field = defaultDateField(source)
  return field ? { ...dimension, field } : null
}

const STEP_VALUE = "value"

/** Os passos de uma fórmula. Cada um é uma consulta inteira, e a conta em cima deles é da tela. */
export function buildCompoundSteps(query: WidgetQuery, range: DateRange, sources: DataSourceMeta[]): QueryPayload[] {
  const dimension = query.dimensions?.[0]

  return (query.formulaSteps ?? []).map((step) => {
    const stepDim = stepDimension(dimension, step, sources)
    const source = sources.find((item) => item.key === step.dataSource)
    const aggregation = step.aggregation ?? "count"
    const dateField = stepDim && (stepDim.granularity || isDateField(source, stepDim.field)) ? stepDim.field : undefined

    return {
      id: step.id,
      dataSource: step.dataSource,
      metrics: [{ aggregation, label: STEP_VALUE, ...(aggregation !== "count" && step.metric ? { field: step.metric } : {}) }],
      dimensions: stepDim ? [stepDim] : [],
      filters: completeFilters(step.filters),
      timeRange: { ...(dateField ? { field: dateField } : {}), start: range.start, end: range.end },
    }
  })
}

/* ---------- comparação ---------- */

/** O card de número compara com o período anterior? `number_trend` compara por padrão, e o `kpi` só se pedir. */
export function wantsComparison(widget: { widgetType: string; visualConfig: VisualConfig }): boolean {
  const spec = WIDGET_SPECS[widget.widgetType as keyof typeof WIDGET_SPECS]
  if (!spec?.figure || spec.goal) return false
  return widget.visualConfig.compare ?? widget.widgetType === "number_trend"
}

/** O número do período inteiro: sem dimensões, para média não virar média de médias. */
export function scalarPayload(payload: QueryPayload, range: DateRange, id: string): QueryPayload {
  return {
    id,
    dataSource: payload.dataSource,
    metrics: payload.metrics,
    dimensions: [],
    filters: payload.filters,
    timeRange: { ...payload.timeRange, start: range.start, end: range.end },
  }
}
