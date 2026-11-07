import { parseDay, PERIOD_PRESETS } from "@/hooks/insights/use-dashboard-period"
import { toDateInputValue } from "@/lib/date-format"

import { WIDGET_SPECS } from "./catalog"
import { categoryDimensions, defaultDateField, isDateField, isRecordsTable, splitDimensions } from "./query"
import type {
  Aggregation,
  DashboardWidget,
  DataSourceMeta,
  FormulaStep,
  Granularity,
  QueryFilter,
  VisualConfig,
  WidgetDimension,
  WidgetMetric,
  WidgetQuery,
  WidgetType,
} from "./types"

// O formulário do card. O que está guardado é o formato da API, bom para consultar e ruim para editar: aqui a pessoa pensa
// em "o que medir", "ao longo do tempo" e "separar por", e nunca em dimensão. As duas pontas se convertem por aqui, e nenhum
// componente do editor conhece `query`.

export type EditorMetric = {
  aggregation: Aggregation
  field: string | null
  label: string
  filters: QueryFilter[]
  filtersOperator: "and" | "or"
  /** Preenchido: é coluna calculada. `null`: é medida comum. */
  formula: string | null
}

export type PeriodMode = "dashboard" | "preset" | "custom"

/** Os atalhos do período do card. */
export const CARD_PERIOD_PRESETS = PERIOD_PRESETS

type EditorVisual = {
  icon: string | null
  color: string | null
  colors: string[]
  showLegend: boolean
  showGrid: boolean
  showValues: boolean
  curved: boolean
  stacked: boolean
  /** `null`: a tela decide (categoria deitada, tempo em pé). */
  horizontal: boolean | null
  opacity: number
  format: NonNullable<VisualConfig["format"]>
  prefix: string
  suffix: string
  decimalPrecision: number | null
  fontSize: number | null
  comparisonLabel: string
  compare: boolean
  goodWhen: "up" | "down"
  goalValue: number | null
  goalLabel: string
  content: string
  valueMap: Record<string, { label: string; color: string | null }>
  thresholds: { value: number | null; label: string; color: string | null }[]
  conditionalRules: { operator: "gt" | "gte" | "lt" | "lte" | "eq"; value: number | null; color: string }[]
  showTotals: boolean
}

export type EditorValues = {
  widgetType: WidgetType
  title: string
  subtitle: string
  dataSource: string | null
  metrics: EditorMetric[]
  /** Tabela: uma linha por registro, em vez de resumo. */
  records: boolean
  columns: string[]
  /** "Ao longo do tempo". `none` é não agrupar por data. */
  granularity: Granularity | "none"
  timeField: string | null
  /** "Separar por". */
  breakdown: string | null
  filters: QueryFilter[]
  periodMode: PeriodMode
  periodPreset: string
  periodRange: { from: Date; to: Date } | null
  /** Qual data conta para o período. `null`: a da fonte. */
  dateField: string | null
  sortField: string | null
  sortDirection: "asc" | "desc"
  limit: number | null
  useFormula: boolean
  formulaSteps: FormulaStep[]
  formula: string
  visual: EditorVisual
}

export function emptyMetric(): EditorMetric {
  return { aggregation: "count", field: null, label: "", filters: [], filtersOperator: "and", formula: null }
}

function metricToEditor(metric: WidgetMetric): EditorMetric {
  return {
    aggregation: metric.aggregation ?? "count",
    field: metric.field ?? null,
    label: metric.label ?? "",
    filters: metric.filters ?? [],
    filtersOperator: metric.filtersOperator ?? "and",
    formula: metric.formula ?? null,
  }
}

function visualToEditor(config: VisualConfig, type: WidgetType): EditorVisual {
  return {
    icon: config.icon ?? null,
    color: config.color ?? null,
    colors: config.colors ?? [],
    showLegend: config.showLegend ?? true,
    showGrid: config.showGrid ?? true,
    showValues: config.showValues ?? false,
    curved: config.curved ?? true,
    stacked: config.stacked ?? false,
    horizontal: config.horizontal ?? null,
    opacity: config.opacity ?? 0.1,
    format: config.format ?? "number",
    prefix: config.prefix ?? "",
    suffix: config.suffix ?? "",
    decimalPrecision: config.decimalPrecision ?? null,
    fontSize: config.fontSize ?? null,
    comparisonLabel: config.comparisonLabel ?? "",
    compare: config.compare ?? type === "number_trend",
    goodWhen: config.goodWhen ?? "up",
    goalValue: config.goalValue ?? (WIDGET_SPECS[type].goal ? 100 : null),
    goalLabel: config.goalLabel ?? "",
    content: config.content ?? "",
    valueMap: Object.fromEntries(
      Object.entries(config.valueMap ?? {}).map(([key, entry]) => [key, { label: entry.label ?? "", color: entry.color ?? null }])
    ),
    thresholds: (config.thresholds ?? []).map((line) => ({ value: line.value, label: line.label ?? "", color: line.color ?? null })),
    conditionalRules: (config.conditionalRules ?? []).map((rule) => ({ ...rule })),
    showTotals: config.showTotals ?? false,
  }
}

/** Do que está guardado ao formulário. */
export function widgetToEditor(widget: Pick<DashboardWidget, "widgetType" | "title" | "dataSource" | "query" | "visualConfig">, source: DataSourceMeta | undefined): EditorValues {
  const { query, widgetType, visualConfig } = widget
  const { time, category } = splitDimensions(query.dimensions, source)
  const own = query.timeRange
  const start = own?.start ? parseDay(own.start) : null
  const end = own?.end ? parseDay(own.end) : null

  return {
    widgetType,
    title: widget.title,
    subtitle: visualConfig.subtitle ?? "",
    dataSource: query.dataSource || widget.dataSource,
    metrics: (query.metrics?.length ? query.metrics : [{ aggregation: "count" as const }]).map(metricToEditor),
    records: isRecordsTable(widget),
    columns: visualConfig.columns?.map((column) => column.field) ?? [],
    granularity: time ? (time.granularity ?? "day") : "none",
    timeField: time?.field ?? null,
    breakdown: category?.field ?? null,
    filters: query.filters ?? [],
    periodMode: own?.preset ? "preset" : start && end ? "custom" : "dashboard",
    periodPreset: own?.preset ?? "30d",
    periodRange: start && end ? { from: start, to: end } : null,
    dateField: own?.field ?? null,
    sortField: query.sort?.field ?? null,
    sortDirection: query.sort?.direction ?? "desc",
    limit: query.limit ?? null,
    useFormula: Boolean(query.compound),
    formulaSteps: query.formulaSteps ?? [],
    formula: query.formula ?? "",
    visual: visualToEditor(visualConfig, widgetType),
  }
}

function metricFromEditor(metric: EditorMetric): WidgetMetric {
  if (metric.formula !== null) {
    return { ...(metric.label.trim() ? { label: metric.label.trim() } : {}), formula: metric.formula }
  }
  return {
    aggregation: metric.aggregation,
    ...(metric.aggregation !== "count" && metric.field ? { field: metric.field } : {}),
    ...(metric.label.trim() ? { label: metric.label.trim() } : {}),
    ...(metric.filters.length ? { filters: metric.filters } : {}),
    ...(metric.filters.length > 1 && metric.filtersOperator === "or" ? { filtersOperator: "or" as const } : {}),
  }
}

function visualFromEditor(values: EditorValues, source: DataSourceMeta | undefined): VisualConfig {
  const { visual } = values
  const spec = WIDGET_SPECS[values.widgetType]
  const valueMap = Object.fromEntries(
    Object.entries(visual.valueMap)
      .filter(([, entry]) => entry.label.trim() || entry.color)
      .map(([key, entry]) => [
        key,
        { ...(entry.label.trim() ? { label: entry.label.trim() } : {}), ...(entry.color ? { color: entry.color } : {}) },
      ])
  )
  const thresholds = visual.thresholds.flatMap((line) =>
    line.value === null
      ? []
      : [{ value: line.value, ...(line.label.trim() ? { label: line.label.trim() } : {}), ...(line.color ? { color: line.color } : {}) }]
  )
  const rules = visual.conditionalRules.flatMap((rule) => (rule.value === null ? [] : [{ ...rule, value: rule.value }]))
  const columns = values.records
    ? values.columns.map((field) => ({ field, label: source?.fields.find((item) => item.key === field)?.label ?? field }))
    : []

  return {
    ...(visual.icon ? { icon: visual.icon } : {}),
    ...(visual.color ? { color: visual.color } : {}),
    ...(values.subtitle.trim() ? { subtitle: values.subtitle.trim() } : {}),
    ...(visual.colors.some(Boolean) ? { colors: visual.colors } : {}),
    ...(!visual.showLegend ? { showLegend: false } : {}),
    ...(spec.axes && !visual.showGrid ? { showGrid: false } : {}),
    ...(spec.axes && visual.showValues ? { showValues: true } : {}),
    ...(spec.axes && !visual.curved ? { curved: false } : {}),
    ...(spec.axes && visual.stacked ? { stacked: true } : {}),
    ...(values.widgetType === "bar_chart" && visual.horizontal !== null ? { horizontal: visual.horizontal } : {}),
    ...(visual.opacity !== 0.1 ? { opacity: visual.opacity } : {}),
    ...(visual.format !== "number" ? { format: visual.format } : {}),
    ...(visual.prefix ? { prefix: visual.prefix } : {}),
    ...(visual.suffix ? { suffix: visual.suffix } : {}),
    ...(visual.decimalPrecision !== null ? { decimalPrecision: visual.decimalPrecision } : {}),
    ...(visual.fontSize !== null ? { fontSize: visual.fontSize } : {}),
    ...(spec.figure && visual.comparisonLabel.trim() ? { comparisonLabel: visual.comparisonLabel.trim() } : {}),
    ...(spec.figure && !spec.goal ? { compare: visual.compare } : {}),
    ...(spec.figure && visual.goodWhen === "down" ? { goodWhen: "down" as const } : {}),
    ...(spec.goal && visual.goalValue ? { goalValue: visual.goalValue } : {}),
    ...(spec.goal && visual.goalLabel.trim() ? { goalLabel: visual.goalLabel.trim() } : {}),
    ...(visual.content.trim() ? { content: visual.content } : {}),
    ...(Object.keys(valueMap).length ? { valueMap } : {}),
    ...(thresholds.length ? { thresholds } : {}),
    ...(rules.length ? { conditionalRules: rules } : {}),
    ...(columns.length ? { columns } : {}),
    ...(values.widgetType === "table" && visual.showTotals ? { showTotals: true } : {}),
  }
}

function dimensionsFromEditor(values: EditorValues, source: DataSourceMeta | undefined): WidgetDimension[] {
  const grouping = WIDGET_SPECS[values.widgetType].grouping
  if (grouping === "none") return []

  const list: WidgetDimension[] = []
  if (values.granularity !== "none" && grouping !== "category") {
    const field = values.timeField ?? defaultDateField(source)
    if (field) list.push({ field, granularity: values.granularity })
  }
  if (values.breakdown && grouping !== "time") list.push({ field: values.breakdown })
  return list
}

function periodFromEditor(values: EditorValues): WidgetQuery["timeRange"] {
  // Agrupando por data, é ela que conta para o período: a consulta já sabe disso.
  const groupsByTime = values.granularity !== "none" && WIDGET_SPECS[values.widgetType].grouping !== "category"
  const field = values.dateField && !groupsByTime ? { field: values.dateField } : {}
  if (values.periodMode === "preset") return { ...field, preset: values.periodPreset }
  if (values.periodMode === "custom" && values.periodRange) {
    return { ...field, start: toDateInputValue(values.periodRange.from), end: toDateInputValue(values.periodRange.to) }
  }
  return "field" in field ? field : undefined
}

/** Do formulário ao que vai ser guardado, e ao que a prévia desenha. */
export function editorToWidget(
  values: EditorValues,
  source: DataSourceMeta | undefined
): Pick<DashboardWidget, "widgetType" | "title" | "dataSource" | "query" | "visualConfig"> {
  const spec = WIDGET_SPECS[values.widgetType]
  const visualConfig = visualFromEditor(values, source)

  if (!spec.needsData) {
    return { widgetType: values.widgetType, title: values.title.trim(), dataSource: null, query: {}, visualConfig }
  }

  const timeRange = periodFromEditor(values)
  const dimensions = dimensionsFromEditor(values, source)
  const common = {
    ...(dimensions.length ? { dimensions } : {}),
    ...(timeRange ? { timeRange } : {}),
  }

  if (values.useFormula) {
    const query: WidgetQuery = {
      ...common,
      compound: true,
      formulaSteps: values.formulaSteps,
      formula: values.formula,
      dataSource: values.formulaSteps[0]?.dataSource,
    }
    return {
      widgetType: values.widgetType,
      title: values.title.trim(),
      dataSource: values.formulaSteps[0]?.dataSource ?? null,
      query,
      visualConfig,
    }
  }

  const records = values.widgetType === "table" && values.records
  const query: WidgetQuery = {
    ...(records ? {} : common),
    ...(records && timeRange ? { timeRange } : {}),
    dataSource: values.dataSource ?? undefined,
    ...(records ? {} : { metrics: (spec.multipleMetrics ? values.metrics : values.metrics.slice(0, 1)).map(metricFromEditor) }),
    ...(values.filters.length ? { filters: values.filters } : {}),
    ...(values.sortField ? { sort: { field: values.sortField, direction: values.sortDirection } } : {}),
    ...(values.limit ? { limit: values.limit } : {}),
  }

  return { widgetType: values.widgetType, title: values.title.trim(), dataSource: values.dataSource, query, visualConfig }
}

/** Um rascunho novo, de um tipo, já com o que faz sentido: a prévia nasce com alguma coisa. */
export function newDraft(type: WidgetType, sources: DataSourceMeta[], title = ""): EditorValues {
  const source = WIDGET_SPECS[type].needsData ? sources[0] : undefined
  const base: EditorValues = {
    ...widgetToEditor({ widgetType: type, title, dataSource: source?.key ?? null, query: {}, visualConfig: {} }, source),
    title,
  }
  return WIDGET_SPECS[type].needsData ? adaptToType(base, type, source) : base
}

/**
 * Tempo e separação juntos pedem pilha: mostra o total e as partes, e 14 semanas com 4 canais lado a lado viram fiapos.
 * É o ponto de partida: quem prefere lado a lado desliga em "Aparência".
 */
export function shouldStack(values: Pick<EditorValues, "widgetType" | "granularity" | "breakdown">) {
  return (values.widgetType === "bar_chart" || values.widgetType === "area_chart") && values.granularity !== "none" && Boolean(values.breakdown)
}

/**
 * Trocar o tipo não pode largar o card num estado que não desenha. O que o tipo novo não usa sai do formulário; o que ele
 * exige ganha o valor mais provável. Medidas e filtros ficam.
 */
export function adaptToType(values: EditorValues, type: WidgetType, source: DataSourceMeta | undefined): EditorValues {
  const { grouping, multipleMetrics } = WIDGET_SPECS[type]
  const firstCategory = values.breakdown ?? categoryDimensions(source)[0]?.key ?? null
  const dateField = values.timeField ?? defaultDateField(source) ?? null
  const next: EditorValues = {
    ...values,
    widgetType: type,
    metrics: multipleMetrics ? values.metrics : values.metrics.slice(0, 1),
    visual: {
      ...values.visual,
      compare: type === "number_trend" ? true : values.visual.compare,
      stacked: values.visual.stacked || shouldStack({ ...values, widgetType: type }),
    },
  }

  switch (grouping) {
    case "none":
      return { ...next, granularity: "none", breakdown: null, records: false }
    case "time":
      return { ...next, granularity: values.granularity === "none" ? "day" : values.granularity, timeField: dateField, breakdown: null, records: false }
    case "category":
      return { ...next, granularity: "none", breakdown: firstCategory, records: false }
    case "grid":
      return {
        ...next,
        granularity: values.granularity === "none" ? "week" : values.granularity,
        timeField: dateField,
        breakdown: firstCategory,
        records: false,
      }
    case "table":
      return { ...next, breakdown: values.breakdown ?? (values.granularity === "none" ? firstCategory : null) }
    case "free":
      return values.granularity === "none" && !values.breakdown
        ? { ...next, granularity: "day", timeField: dateField, records: false }
        : { ...next, records: false }
  }
}

/** Trocar a fonte: o que era da fonte antiga não vale mais. */
export function adaptToSource(values: EditorValues, source: DataSourceMeta | undefined): EditorValues {
  const keepDate = isDateField(source, values.timeField ?? undefined)
  const base: EditorValues = {
    ...values,
    dataSource: source?.key ?? null,
    metrics: [emptyMetric()],
    filters: [],
    breakdown: null,
    timeField: keepDate ? values.timeField : (defaultDateField(source) ?? null),
    dateField: null,
    sortField: null,
    columns: [],
  }
  return adaptToType(base, values.widgetType, source)
}

/* ---------- a frase ---------- */

type Translate = (key: string, options?: Record<string, unknown>) => string

function lowerFirst(text: string) {
  // "CPF" continua "CPF": só a inicial de uma palavra comum desce.
  return text.length > 1 && text[1] === text[1].toUpperCase() && text[1] !== text[1].toLowerCase()
    ? text
    : text.charAt(0).toLocaleLowerCase() + text.slice(1)
}

function metricPhrase(metric: Pick<EditorMetric, "aggregation" | "field">, source: DataSourceMeta | undefined, t: Translate) {
  if (metric.aggregation === "count" || !metric.field) {
    return source
      ? t(`customDashboards.sources.${source.key}.howMany`, { defaultValue: t("customDashboards.sentence.howMany", { source: lowerFirst(source.label) }) })
      : t("customDashboards.sentence.howManyGeneric")
  }
  const field = source?.fields.find((item) => item.key === metric.field)?.label ?? metric.field
  return t(`customDashboards.sentence.${metric.aggregation}`, { field: lowerFirst(field) })
}

/**
 * O que a pessoa está montando, em uma frase ("Quantas conversas por semana, por canal"). Com `asTitle`, o mesmo em forma de
 * nome, para sugerir o título ("Conversas por semana, por canal").
 */
export function describeEditor(
  values: EditorValues,
  sources: DataSourceMeta[] | undefined,
  customFieldLabel: (field: string) => string | undefined,
  t: Translate,
  { asTitle = false }: { asTitle?: boolean } = {}
): string {
  const spec = WIDGET_SPECS[values.widgetType]
  if (!spec.needsData) return ""

  const source = sources?.find((item) => item.key === values.dataSource)
  if (values.useFormula) return asTitle ? "" : t("customDashboards.sentence.formula")
  if (values.widgetType === "table" && values.records) {
    return t("customDashboards.sentence.records", { source: source ? lowerFirst(source.label) : "" })
  }
  if (!source) return asTitle ? "" : t("customDashboards.sentence.pickSource")

  const metric = values.metrics[0] ?? emptyMetric()
  const parts = [asTitle && (metric.aggregation === "count" || !metric.field) ? source.label : metricPhrase(metric, source, t)]
  if (spec.grouping !== "category" && spec.grouping !== "none" && values.granularity !== "none") {
    parts.push(t(`customDashboards.sentence.by.${values.granularity}`))
  }
  const sentence = parts.join(" ")

  if (values.breakdown && spec.grouping !== "time" && spec.grouping !== "none") {
    const label =
      customFieldLabel(values.breakdown) ??
      categoryDimensions(source).find((item) => item.key === values.breakdown)?.label ??
      source.fields.find((item) => item.key === values.breakdown)?.label ??
      values.breakdown
    return t("customDashboards.sentence.splitBy", { sentence, dimension: lowerFirst(label) })
  }
  return sentence
}

/** A tabela de registros pede colunas para escolher: o que é da fonte e sai nas linhas. */
export function recordFields(source: DataSourceMeta | undefined) {
  return source?.fields.filter((field) => field.type !== "custom_attribute" && !field.virtual) ?? []
}
