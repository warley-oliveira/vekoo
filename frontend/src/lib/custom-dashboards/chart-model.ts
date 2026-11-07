import { FORMULA_VALUE } from "./formula-series"
import { evaluateScalar, parseFormula, type ASTNode } from "./formula-engine"
import { assignSlots, categoricalColor, resolveColor } from "./palette"
import { effectiveMetrics, isDateField, isFormulaQuery, metricKeys, splitDimensions } from "./query"
import { bucketStart, bucketTick, bucketTitle, enumerateBuckets, formatCellDate } from "./time"
import { columnLetter } from "./catalog"
import type {
  DashboardWidget,
  DataSourceMeta,
  Granularity,
  QueryResult,
  QueryRow,
  ValueMapEntry,
  WidgetDimension,
} from "./types"

// O resultado de uma consulta vira um modelo só: categorias e séries. O gráfico, a tabela gêmea, o resumo para leitor
// de tela e o CSV leem daqui, e por isso os números nunca discordam.

export type ModelContext = {
  language: string
  timeZone?: string
  /** O texto que este módulo precisa, vindo da tela: ele não fala nenhuma língua. */
  text: {
    none: string
    removed: string
    other: string
    total: string
    week: (date: string) => string
  }
  source?: DataSourceMeta
}

export type ModelCategory = { id: string; tick: string; title: string; raw: unknown }
export type ModelSeries = {
  key: string
  label: string
  color: string
  values: (number | null)[]
  total: number
}

export type ChartModel = {
  kind: "time" | "category" | "metrics"
  categories: ModelCategory[]
  series: ModelSeries[]
  dimensionLabel: string
  breakdownLabel: string | null
  granularity: Granularity | null
  /** Há mais linhas do que o limite: o card precisa dizer. */
  truncated: boolean
  /** Quantos valores viraram "Outros". */
  folded: number
  /** Pode somar: ponto vazio vale zero. Média e maior valor não têm zero, e ficam em branco. */
  additive: boolean
  /** As categorias dividem um todo? Uma conversa tem várias etiquetas: aí "12% do total" não quer dizer nada. */
  partition: boolean
}

/** Dimensões em que um registro cai em mais de um valor. */
const MULTI_VALUE_DIMENSIONS = new Set(["chat_tag_name"])

export const MAX_SERIES = 8
export const MAX_SLICES = 6

const ID_LIKE = /^([0-9a-f]{24}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i

export function displayValue(
  raw: unknown,
  field: string,
  result: Pick<QueryResult, "labels">,
  valueMap: Record<string, ValueMapEntry> | undefined,
  text: ModelContext["text"]
): string {
  if (raw === null || raw === undefined || raw === "") {
    return valueMap?.[""]?.label || result.labels?.[field]?.[""] || text.none
  }
  const key = String(raw)
  const known = valueMap?.[key]?.label || result.labels?.[field]?.[key]
  if (known) return known
  // Id sem nome: a pessoa ou o cadastro saiu da organização.
  return ID_LIKE.test(key) ? text.removed : key
}

function numeric(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function metricColumns(widget: DashboardWidget, result: QueryResult): { key: string; label: string; additive: boolean }[] {
  if (isFormulaQuery(widget.query)) {
    return [{ key: FORMULA_VALUE, label: widget.title, additive: false }]
  }

  const metrics = effectiveMetrics(widget.query)
  const keys = metricKeys(metrics)
  const columns = metrics.flatMap((metric, index) =>
    metric.formula === undefined
      ? [{ key: keys[index], label: keys[index], additive: !metric.aggregation || ["count", "sum"].includes(metric.aggregation) }]
      : []
  )
  // Card que nunca deu nome à medida: a coluna é a letra, e quem conta para a pessoa é o título.
  if (columns.length === 1 && columns[0].key === columnLetter(0)) {
    columns[0].label = widget.title
  }
  const present = columns.filter((column) => result.columns.includes(column.key) || !result.rows.length)
  return present.length ? present : columns
}

function dimensionsOf(widget: DashboardWidget, result: QueryResult): WidgetDimension[] {
  const stored = widget.query.dimensions ?? []
  if (!stored.length) return []
  // Fórmula: a coluna tem o nome da dimensão guardada. Consulta comum: a API usa o próprio campo.
  return stored.filter((dimension) => result.columns.includes(dimension.field) || !result.rows.length)
}

function fieldLabel(field: string, result: QueryResult, source: DataSourceMeta | undefined) {
  return (
    result.fieldLabels?.[field] ??
    source?.fields.find((item) => item.key === field)?.label ??
    source?.relatedDimensions.find((item) => item.key === field)?.label ??
    field
  )
}

function timeCategories(
  rows: QueryRow[],
  dimension: WidgetDimension,
  result: QueryResult,
  context: ModelContext
): { categories: ModelCategory[]; bucketOf: (raw: unknown) => string; granularity: Granularity } {
  const granularity = dimension.granularity ?? "day"
  const { language, timeZone, text } = context
  const range = result.meta?.timeRange
  const present = rows.map((row) => numeric(row[dimension.field])).filter((value): value is number => value !== null)

  const from = range?.from ?? Math.min(...present)
  const to = range?.to ?? Math.max(...present)
  const buckets = Number.isFinite(from) && Number.isFinite(to) ? enumerateBuckets(from, to, granularity, timeZone) : []

  const toCategory = (value: number): ModelCategory => {
    const title = bucketTitle(value, granularity, language, timeZone)
    return {
      id: String(value),
      tick: bucketTick(value, granularity, language, timeZone),
      title: granularity === "week" ? text.week(title) : title,
      raw: value,
    }
  }

  // Linha fora do período (a API corta pela data do filtro, e o agrupamento pode ser por outra): não some.
  const known = new Set(buckets)
  for (const value of present) known.add(bucketStart(value, granularity, timeZone))

  return {
    categories: [...known].sort((left, right) => left - right).map(toCategory),
    bucketOf: (raw) => {
      const value = numeric(raw)
      return value === null ? "" : String(bucketStart(value, granularity, timeZone))
    },
    granularity,
  }
}

function plainCategories(rows: QueryRow[], dimension: WidgetDimension, result: QueryResult, widget: DashboardWidget, context: ModelContext) {
  const seen = new Map<string, ModelCategory>()
  for (const row of rows) {
    const raw = row[dimension.field]
    const id = String(raw ?? "")
    if (!seen.has(id)) {
      const label = displayValue(raw, dimension.field, result, widget.visualConfig.valueMap, context.text)
      seen.set(id, { id, tick: label, title: label, raw })
    }
  }
  return [...seen.values()]
}

/** O total do ponto é a soma, só quando faz sentido somar. */
function totalOf(values: (number | null)[]) {
  return values.reduce<number>((sum, value) => sum + (value ?? 0), 0)
}

/**
 * Duas dimensões: a primeira é o eixo, e a segunda vira uma série por valor. A nona série nunca ganha cor nova: as
 * menores viram "Outros", e a média, que não soma, só mostra as maiores.
 */
function pivot(
  widget: DashboardWidget,
  result: QueryResult,
  metric: { key: string; label: string; additive: boolean },
  x: WidgetDimension,
  breakdown: WidgetDimension,
  categories: ModelCategory[],
  bucketOf: (raw: unknown) => string,
  context: ModelContext
): { series: ModelSeries[]; folded: number } {
  const valueMap = widget.visualConfig.valueMap
  const byEntity = new Map<string, { raw: unknown; values: Map<string, number> }>()

  for (const row of result.rows) {
    const raw = row[breakdown.field]
    const entity = String(raw ?? "")
    let entry = byEntity.get(entity)
    if (!entry) {
      entry = { raw, values: new Map() }
      byEntity.set(entity, entry)
    }
    const category = bucketOf(row[x.field])
    entry.values.set(category, (entry.values.get(category) ?? 0) + (numeric(row[metric.key]) ?? 0))
  }

  const ranked = [...byEntity.entries()]
    .map(([entity, entry]) => ({
      entity,
      entry,
      total: [...entry.values.values()].reduce((sum, value) => sum + value, 0),
    }))
    .sort((left, right) => right.total - left.total)

  const fold = ranked.length > MAX_SERIES
  const kept = fold ? ranked.slice(0, MAX_SERIES - 1) : ranked
  const rest = fold ? ranked.slice(MAX_SERIES - 1) : []
  const slots = assignSlots(`${widget.id}:${breakdown.field}`, kept.map((item) => item.entity))
  const fill = metric.additive ? 0 : null

  const series: ModelSeries[] = kept.map(({ entity, entry }) => {
    const values = categories.map((category) => entry.values.get(category.id) ?? fill)
    return {
      key: `s:${entity}`,
      label: displayValue(entry.raw, breakdown.field, result, valueMap, context.text),
      color: valueMap?.[entity]?.color
        ? resolveColor(valueMap[entity].color)
        : categoricalColor(slots.get(entity) ?? 0),
      values,
      total: totalOf(values),
    }
  })

  if (rest.length && metric.additive) {
    const values = categories.map((category) =>
      rest.reduce((sum, { entry }) => sum + (entry.values.get(category.id) ?? 0), 0)
    )
    series.push({ key: "s:__other__", label: context.text.other, color: "var(--viz-context)", values, total: totalOf(values) })
  }

  return { series, folded: rest.length }
}

export function buildChartModel(widget: DashboardWidget, result: QueryResult, context: ModelContext): ChartModel {
  const { source } = context
  const config = widget.visualConfig
  const metrics = metricColumns(widget, result)
  const dimensions = dimensionsOf(widget, result)
  const truncated = result.meta?.truncated ?? false
  const additive = metrics.every((metric) => metric.additive)
  const { time, category } = splitDimensions(dimensions, source)

  // Sem dimensão: cada medida é uma barra.
  if (dimensions.length === 0) {
    const row = result.rows[0] ?? {}
    return {
      kind: "metrics",
      categories: metrics.map((metric) => ({ id: metric.key, tick: metric.label, title: metric.label, raw: metric.key })),
      series: [
        {
          key: "value",
          label: widget.title,
          color: resolveColor(config.color, "var(--viz-ink)"),
          values: metrics.map((metric) => numeric(row[metric.key])),
          total: metrics.reduce((sum, metric) => sum + (numeric(row[metric.key]) ?? 0), 0),
        },
      ],
      dimensionLabel: "",
      breakdownLabel: null,
      granularity: null,
      truncated,
      folded: 0,
      additive,
      partition: false,
    }
  }

  const xDimension = time ?? category ?? dimensions[0]
  const breakdown = time && category ? category : dimensions[1] && dimensions[1] !== xDimension ? dimensions[1] : null

  let categories: ModelCategory[]
  let bucketOf: (raw: unknown) => string
  let granularity: Granularity | null = null

  if (time) {
    const built = timeCategories(result.rows, time, result, context)
    categories = built.categories
    bucketOf = built.bucketOf
    granularity = built.granularity
  } else {
    categories = plainCategories(result.rows, xDimension, result, widget, context)
    bucketOf = (raw) => String(raw ?? "")
  }

  const base = {
    kind: (time ? "time" : "category") as ChartModel["kind"],
    categories,
    dimensionLabel: fieldLabel(xDimension.field, result, source),
    breakdownLabel: breakdown ? fieldLabel(breakdown.field, result, source) : null,
    granularity,
    truncated,
    additive,
    partition: !MULTI_VALUE_DIMENSIONS.has(xDimension.field),
  }

  if (breakdown) {
    const { series, folded } = pivot(widget, result, metrics[0], xDimension, breakdown, categories, bucketOf, context)
    return { ...base, series, folded }
  }

  const single = metrics.length === 1
  const series = metrics.map((metric, index) => {
    const byCategory = new Map<string, number | null>()
    for (const row of result.rows) {
      const id = bucketOf(row[xDimension.field])
      const value = numeric(row[metric.key])
      const current = byCategory.get(id)
      // Linhas no mesmo balde só existem se o período cortou em fuso diferente: somam.
      byCategory.set(id, current === undefined || current === null ? value : current + (value ?? 0))
    }
    const fill = metric.additive && time ? 0 : null
    const values = categories.map((item) => (byCategory.has(item.id) ? (byCategory.get(item.id) ?? fill) : fill))
    return {
      key: metric.key,
      label: metric.label,
      color: seriesColor(widget, index, single, Boolean(time)),
      values,
      total: totalOf(values),
    }
  })

  return { ...base, series, folded: 0 }
}

/**
 * A cor de uma medida. Uma série só, em tinta neutra (barra) ou no acento (linha e área): é o que o Dashboard faz. Mais
 * de uma, pela paleta, em ordem. A cor escolhida pela pessoa vale acima de tudo.
 */
function seriesColor(widget: DashboardWidget, index: number, single: boolean, isTime: boolean) {
  const { colors, color } = widget.visualConfig
  if (colors?.[index]) return resolveColor(colors[index])
  if (!single) return categoricalColor(index)
  if (color) return resolveColor(color)
  return widget.widgetType === "bar_chart" && !isTime ? "var(--viz-ink)" : "var(--viz-accent)"
}

/* ---------- partes de um todo ---------- */

export type Part = { key: string; label: string; value: number; color: string; share: number }

/** Pizza e rosca: no máximo seis partes. A cauda vira "Outros": ninguém lê uma fatia de 1%. */
export function buildParts(widget: DashboardWidget, model: ChartModel, context: ModelContext): Part[] {
  const series = model.series[0]
  if (!series) return []

  const items = model.categories
    .map((category, index) => ({ category, value: series.values[index] ?? 0 }))
    .filter((item) => item.value > 0)
    .sort((left, right) => right.value - left.value)

  const total = items.reduce((sum, item) => sum + item.value, 0)
  const kept = items.length > MAX_SLICES ? items.slice(0, MAX_SLICES - 1) : items
  const rest = items.length > MAX_SLICES ? items.slice(MAX_SLICES - 1) : []
  const slots = assignSlots(`${widget.id}:parts`, kept.map((item) => item.category.id))
  const valueMap = widget.visualConfig.valueMap

  const parts: Part[] = kept.map(({ category, value }) => ({
    key: category.id,
    label: category.title,
    value,
    share: total ? value / total : 0,
    color: valueMap?.[category.id]?.color
      ? resolveColor(valueMap[category.id].color)
      : categoricalColor(slots.get(category.id) ?? 0),
  }))

  if (rest.length) {
    const value = rest.reduce((sum, item) => sum + item.value, 0)
    parts.push({ key: "__other__", label: context.text.other, value, share: total ? value / total : 0, color: "var(--viz-context)" })
  }

  return parts
}

/* ---------- tabela do card ---------- */

export type TableColumn = {
  key: string
  label: string
  kind: "text" | "number" | "date"
  /** Medida: entra na soma, e o formato do card vale para ela. */
  metric: boolean
}

export type TableRowData = { id: string } & Record<string, unknown>

export type TableModel = {
  columns: TableColumn[]
  rows: TableRowData[]
  totals: Record<string, number | null> | null
  truncated: boolean
}

function hiddenRawField(key: string) {
  return key === "custom_attributes" || key === "_id"
}

function evaluateFormulaColumns(widget: DashboardWidget, rows: QueryRow[]): QueryRow[] {
  const metrics = widget.query.metrics ?? []
  if (!metrics.some((metric) => metric.formula !== undefined)) return rows

  const keys = metricKeys(metrics)
  const asts: (ASTNode | null)[] = metrics.map((metric) => {
    if (metric.formula === undefined) return null
    try {
      return parseFormula(metric.formula)
    } catch {
      return null
    }
  })

  return rows.map((row) => {
    const values: Record<string, number> = {}
    const output: QueryRow = { ...row }
    metrics.forEach((metric, index) => {
      const letter = columnLetter(index)
      if (metric.formula === undefined) {
        values[letter] = numeric(row[keys[index]]) ?? 0
        return
      }
      const ast = asts[index]
      try {
        const value = ast ? evaluateScalar(ast, values) : null
        output[keys[index]] = value
        if (value !== null) values[letter] = value
      } catch {
        output[keys[index]] = null
      }
    })
    return output
  })
}

/**
 * O total de cada coluna é o que aquela conta permite. Quantidade e soma somam. Média não: a média das médias engana, e a
 * coluna fica sem total. Maior e menor valem o maior e o menor. A coluna calculada refaz a conta em cima dos totais: o total
 * de um percentual é o percentual dos totais, e não a soma das linhas (a origem somava, e mostrava "353%").
 */
function buildTotals(widget: DashboardWidget, columns: TableColumn[], rows: TableRowData[]): Record<string, number | null> {
  const totals: Record<string, number | null> = {}
  const metrics = isFormulaQuery(widget.query) ? [] : effectiveMetrics(widget.query)
  const keys = metricKeys(metrics)
  const letters: Record<string, number> = {}

  const numbersOf = (key: string) => rows.map((row) => row[key]).filter((value): value is number => typeof value === "number")

  metrics.forEach((metric, index) => {
    if (metric.formula !== undefined) return

    const numbers = numbersOf(keys[index])
    let total: number | null = null
    if (numbers.length) {
      if (metric.aggregation === "min") total = Math.min(...numbers)
      else if (metric.aggregation === "max") total = Math.max(...numbers)
      else if (metric.aggregation !== "avg") total = numbers.reduce((sum, value) => sum + value, 0)
    }
    totals[keys[index]] = total
    if (total !== null) letters[columnLetter(index)] = total
  })

  metrics.forEach((metric, index) => {
    if (metric.formula === undefined) return

    try {
      const value = evaluateScalar(parseFormula(metric.formula), letters)
      totals[keys[index]] = value
      letters[columnLetter(index)] = value
    } catch {
      totals[keys[index]] = null
    }
  })

  for (const column of columns) {
    if (column.kind === "number" && !(column.key in totals)) {
      const numbers = numbersOf(column.key)
      totals[column.key] = numbers.length ? numbers.reduce((sum, value) => sum + value, 0) : null
    }
  }

  return totals
}

/**
 * A tabela: resumo (dimensões e medidas) ou registros (uma linha por documento). Coluna de fórmula é calculada aqui,
 * linha a linha, e a letra aponta para a medida naquela posição, como no editor.
 */
export function buildTableModel(widget: DashboardWidget, result: QueryResult, context: ModelContext): TableModel {
  const { source, language, timeZone, text } = context
  const config = widget.visualConfig
  const dimensions = widget.query.dimensions ?? []
  const summary = Boolean(widget.query.metrics?.length || dimensions.length)
  const rows = evaluateFormulaColumns(widget, result.rows)

  let columns: TableColumn[]
  if (isFormulaQuery(widget.query)) {
    columns = [
      ...dimensions.map((dimension) => ({
        key: dimension.field,
        label: fieldLabel(dimension.field, result, source),
        kind: (dimension.granularity ? "date" : "text") as TableColumn["kind"],
        metric: false,
      })),
      { key: FORMULA_VALUE, label: widget.title, kind: "number", metric: true },
    ]
  } else if (summary) {
    const metrics = effectiveMetrics(widget.query)
    const keys = metricKeys(metrics)
    columns = [
      ...dimensions.map((dimension) => ({
        key: dimension.field,
        label: fieldLabel(dimension.field, result, source),
        kind: (dimension.granularity || isDateField(source, dimension.field) ? "date" : "text") as TableColumn["kind"],
        metric: false,
      })),
      ...metrics.map((_, index) => ({ key: keys[index], label: keys[index], kind: "number" as const, metric: true })),
    ]
  } else {
    const chosen = config.columns?.length ? config.columns.map((column) => column.field) : (result.columns.length ? result.columns : Object.keys(rows[0] ?? {}))
    columns = chosen
      .filter((key) => !hiddenRawField(key))
      .map((key) => {
        const field = source?.fields.find((item) => item.key === key)
        return {
          key,
          label: config.columns?.find((column) => column.field === key)?.label || fieldLabel(key, result, source),
          kind: field?.type === "date" ? "date" : field?.type === "number" ? "number" : "text",
          metric: false,
        } satisfies TableColumn
      })
  }

  const dateGranularity = (key: string) => dimensions.find((dimension) => dimension.field === key)?.granularity

  const tableRows: TableRowData[] = rows.map((row, index) => {
    const cells: TableRowData = { id: String(index) }
    for (const column of columns) {
      const raw = row[column.key]
      if (column.kind === "date") {
        const value = numeric(raw)
        const granularity = dateGranularity(column.key)
        cells[column.key] =
          value === null
            ? text.none
            : granularity
              ? bucketTitle(value, granularity, language, timeZone)
              : formatCellDate(value, language, timeZone)
        cells[`${column.key}__sort`] = value
      } else if (column.kind === "number") {
        cells[column.key] = numeric(raw)
      } else if (Array.isArray(raw)) {
        cells[column.key] = raw.join(", ")
      } else {
        cells[column.key] = displayValue(raw, column.key, result, config.valueMap, text)
      }
    }
    return cells
  })

  const totals = config.showTotals && summary && tableRows.length ? buildTotals(widget, columns, tableRows) : null

  return { columns, rows: tableRows, totals, truncated: result.meta?.truncated ?? false }
}
