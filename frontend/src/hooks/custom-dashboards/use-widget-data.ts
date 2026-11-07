import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import useSWR from "swr"

import type { DashboardPeriod } from "@/hooks/insights/use-dashboard-period"
import { apiPost } from "@/lib/api"
import { MAX_FORMULA_STEPS, WIDGET_SPECS } from "@/lib/custom-dashboards/catalog"
import { FormulaError } from "@/lib/custom-dashboards/formula-engine"
import { allStepsEmpty, evaluateCompound, evaluateCompoundScalar, FORMULA_VALUE } from "@/lib/custom-dashboards/formula-series"
import {
  buildCompoundSteps,
  buildQueryPayload,
  cardRange,
  effectiveMetrics,
  isFormulaQuery,
  metricKeys,
  previousRange,
  scalarPayload,
  wantsComparison,
  type QueryPayload,
} from "@/lib/custom-dashboards/query"
import type {
  DashboardWidget,
  DataSourceMeta,
  FormulaStep,
  QueryResult,
  VisualConfig,
  WidgetQuery,
  WidgetType,
} from "@/lib/custom-dashboards/types"

// A consulta de cada card. A chave do SWR é o corpo da consulta: dois cards iguais pedem uma vez, mover um card não pede
// nada, e mudar a aparência também não. O que a fórmula calcula sai da resposta guardada, sem ir ao servidor de novo.

const QUERY_PATH = "/custom-dashboards/query"
const COMPOUND_PATH = "/custom-dashboards/compound-query"

const SWR_OPTIONS = {
  revalidateOnFocus: false,
  revalidateOnReconnect: true,
  // 403, 422 e prazo estourado não melhoram sozinhos. Quem insiste é a pessoa, no "tentar de novo" do card.
  shouldRetryOnError: false,
}

// Um card que chega à tela, ou a prévia que abre, com a mesma consulta de outro não pergunta de novo: esmaeceria os dois à
// toa. Com o "atualizar a cada 30 s" ligado, a janela encurta, senão ela engoliria a própria atualização.
const DEDUPE_MS = 60_000
const DEDUPE_REFRESHING_MS = 5_000

type CompoundResponse = { results: Record<string, QueryResult> }
type WidgetResponse = QueryResult | CompoundResponse

type WidgetRequest =
  | { kind: "query"; key: string; body: QueryPayload }
  | { kind: "compound"; key: string; steps: QueryPayload[] }

export type WidgetData = {
  /** As linhas que o card desenha: a série, ou o número do período. */
  result: QueryResult
  /** O número do período inteiro. Só existe quando o card pediu à parte. */
  current?: number | null
  previous?: number | null
  /** A fórmula guardada não dá conta. */
  formulaError?: FormulaError
}

type RequestWidget = {
  widgetType: WidgetType
  dataSource: string | null
  query: WidgetQuery
  visualConfig: Pick<VisualConfig, "compare">
}

const CURRENT = "current"
const PREVIOUS = "previous"
const SERIES = "series"

function stepsRequest(steps: QueryPayload[]): WidgetRequest {
  return { kind: "compound", key: `${COMPOUND_PATH}#${JSON.stringify(steps)}`, steps }
}

function withPrefix(steps: QueryPayload[], prefix: string) {
  return steps.map((step) => ({ ...step, id: `${prefix}:${step.id}` }))
}

/**
 * Número que compara, ou que tem linha de tendência, precisa de mais de uma consulta: a série, o período e o anterior. Vão
 * numa chamada só, para o card não piscar um pedaço de cada vez. O número do período é pedido sem dimensão: a média do
 * período não é a média das médias de cada dia.
 */
function figureRequest(
  widget: RequestWidget,
  period: DashboardPeriod,
  source: DataSourceMeta | undefined,
  sources: DataSourceMeta[]
): WidgetRequest | null {
  const { query } = widget
  const trend = widget.widgetType === "number_trend"
  const range = cardRange(query, period)
  const previous = wantsComparison(widget) ? previousRange(query, period) : null

  if (isFormulaQuery(query)) {
    const flat = { ...query, dimensions: [] }
    const stepCount = query.formulaSteps?.length ?? 0
    const groups = (trend ? 1 : 0) + 1 + (previous ? 1 : 0)
    // A API aceita 10 passos por chamada. Sem espaço para a comparação, o card fica sem ela.
    const compare = previous && stepCount * groups <= MAX_FORMULA_STEPS ? previous : null
    if (!trend && !compare) return null

    return stepsRequest([
      ...(trend ? withPrefix(buildCompoundSteps(query, range, sources), SERIES) : []),
      ...withPrefix(buildCompoundSteps(flat, range, sources), CURRENT),
      ...(compare ? withPrefix(buildCompoundSteps(flat, compare, sources), PREVIOUS) : []),
    ])
  }

  if (!trend && !previous) return null
  const base = buildQueryPayload(widget, range, source)
  if (!base) return null

  return stepsRequest([
    ...(trend ? [{ ...base, id: SERIES }] : []),
    scalarPayload(base, range, CURRENT),
    ...(previous ? [scalarPayload(base, previous, PREVIOUS)] : []),
  ])
}

export function buildWidgetRequest(
  widget: RequestWidget,
  period: DashboardPeriod,
  source: DataSourceMeta | undefined,
  sources: DataSourceMeta[]
): WidgetRequest | null {
  if (!WIDGET_SPECS[widget.widgetType]?.needsData) return null

  const figure = figureRequest(widget, period, source, sources)
  if (figure) return figure

  const range = cardRange(widget.query, period)
  if (isFormulaQuery(widget.query)) return stepsRequest(buildCompoundSteps(widget.query, range, sources))

  const body = buildQueryPayload(widget, range, source)
  return body ? { kind: "query", key: `${QUERY_PATH}#${JSON.stringify(body)}`, body } : null
}

function scalarValue(result: QueryResult | undefined, key: string): number | null {
  const row = result?.rows[0]
  if (!row) return null
  const value = Number(row[key])
  return Number.isFinite(value) ? value : null
}

function isAdditive(query: WidgetQuery) {
  const aggregation = effectiveMetrics(query)[0]?.aggregation ?? "count"
  return aggregation === "count" || aggregation === "sum"
}

function groupOf(results: Record<string, QueryResult>, prefix: string) {
  const start = `${prefix}:`
  return Object.fromEntries(
    Object.entries(results)
      .filter(([id]) => id.startsWith(start))
      .map(([id, result]) => [id.slice(start.length), result])
  )
}

const EMPTY_RESULT: QueryResult = { rows: [], columns: [], meta: { total: 0, truncated: false } }

function formulaFigure(result: QueryResult, stepResults: Record<string, QueryResult>, steps: FormulaStep[]): number | null {
  const value = scalarValue(result, FORMULA_VALUE)
  return value === 0 && allStepsEmpty(stepResults, steps) ? null : value
}

function readFormula(query: WidgetQuery, results: Record<string, QueryResult>): WidgetData {
  const formula = query.formula ?? ""
  const steps = query.formulaSteps ?? []
  const dimension = query.dimensions?.[0]?.field ?? null

  const currentResults = groupOf(results, CURRENT)
  if (Object.keys(currentResults).length === 0) {
    const result = evaluateCompound(formula, results, steps, dimension)
    return dimension ? { result } : { result, current: formulaFigure(result, results, steps) }
  }

  const current = evaluateCompoundScalar(formula, currentResults, steps)
  const previousResults = groupOf(results, PREVIOUS)
  const seriesResults = groupOf(results, SERIES)

  return {
    result: Object.keys(seriesResults).length ? evaluateCompound(formula, seriesResults, steps, dimension) : current,
    current: formulaFigure(current, currentResults, steps),
    ...(Object.keys(previousResults).length
      ? { previous: formulaFigure(evaluateCompoundScalar(formula, previousResults, steps), previousResults, steps) }
      : {}),
  }
}

/** Da resposta guardada ao que o card desenha. A fórmula entra aqui, sem nova consulta. */
export function readWidgetData(query: WidgetQuery, response: WidgetResponse): WidgetData {
  if (!("results" in response)) return { result: response }

  try {
    if (isFormulaQuery(query)) return readFormula(query, response.results)

    const { results } = response
    const key = metricKeys(effectiveMetrics(query))[0]
    const zero = isAdditive(query) ? 0 : null

    return {
      result: results[SERIES] ?? results[CURRENT] ?? EMPTY_RESULT,
      current: scalarValue(results[CURRENT], key) ?? zero,
      ...(results[PREVIOUS] ? { previous: scalarValue(results[PREVIOUS], key) ?? zero } : {}),
    }
  } catch (error) {
    if (error instanceof FormulaError) return { result: EMPTY_RESULT, formulaError: error }
    throw error
  }
}

/** O número de um card de número. Soma de nada é zero; média de nada não é número nenhum. */
export function figureValue(query: WidgetQuery, data: WidgetData): number | null {
  if (data.current !== undefined) return data.current

  const key = isFormulaQuery(query) ? FORMULA_VALUE : metricKeys(effectiveMetrics(query))[0]
  return scalarValue(data.result, key) ?? (isFormulaQuery(query) || isAdditive(query) ? 0 : null)
}

async function runRequest(request: WidgetRequest): Promise<WidgetResponse> {
  if (request.kind === "query") return apiPost<QueryResult>(QUERY_PATH, request.body)
  return apiPost<CompoundResponse>(COMPOUND_PATH, { steps: request.steps })
}

export type WidgetDataOptions = {
  /** O card ainda não apareceu na tela. */
  enabled?: boolean
  refreshInterval?: number
  source?: DataSourceMeta
  /** Fórmula e comparação precisam da lista inteira, para achar a data equivalente em cada fonte. */
  sources?: DataSourceMeta[]
}

export function useWidgetData(
  widget: Pick<DashboardWidget, "widgetType" | "dataSource" | "query" | "visualConfig">,
  period: DashboardPeriod,
  { enabled = true, refreshInterval = 0, source, sources }: WidgetDataOptions
) {
  const { widgetType, dataSource, query } = widget
  const compare = widget.visualConfig.compare

  const request = useMemo(
    () => (sources ? buildWidgetRequest({ widgetType, dataSource, query, visualConfig: { compare } }, period, source, sources) : null),
    [compare, dataSource, period, query, source, sources, widgetType]
  )

  const swr = useSWR<WidgetResponse>(enabled && request ? request.key : null, () => runRequest(request as WidgetRequest), {
    ...SWR_OPTIONS,
    refreshInterval,
    dedupingInterval: refreshInterval ? DEDUPE_REFRESHING_MS : DEDUPE_MS,
  })

  // Trocou a consulta (outro período, outro campo): o desenho anterior fica até o novo chegar, esmaecido. Ele foi feito
  // com a consulta de antes, e é com ela que precisa ser lido: as colunas têm os nomes daquelas medidas. Se a consulta
  // nova falhar, o que aparece é o erro, e não o desenho velho.
  const [last, setLast] = useState<{ response: WidgetResponse; query: WidgetQuery } | null>(null)
  if (swr.data && (last?.response !== swr.data || last.query !== query)) {
    setLast({ response: swr.data, query })
  }
  const lagging = !swr.data && swr.isLoading ? last : null
  const response = swr.data ?? lagging?.response
  const shownQuery = lagging?.query ?? query

  const data = useMemo(() => (response ? readWidgetData(shownQuery, response) : undefined), [response, shownQuery])

  const { mutate } = swr
  const retry = useCallback(() => {
    void mutate()
  }, [mutate])

  return {
    data,
    /** A consulta que produziu `data`. Durante a troca, é a anterior. */
    shownQuery,
    error: swr.error as unknown,
    // Sem chave não há busca: o card fica no esqueleto até aparecer na tela.
    isLoading: !data && !swr.error,
    isRefreshing: Boolean(data) && (swr.isValidating || swr.isLoading),
    hasRequest: Boolean(request),
    retry,
  }
}

/** A primeira vez que o elemento chega perto da tela. O painel de 60 cards não dispara 60 consultas de uma vez. */
export function useInViewOnce(active: boolean) {
  const [seen, setSeen] = useState(!active)
  const observer = useRef<IntersectionObserver | null>(null)

  const ref = useCallback(
    (node: HTMLElement | null) => {
      observer.current?.disconnect()
      observer.current = null
      if (!node || seen) return

      observer.current = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) setSeen(true)
        },
        { rootMargin: "240px" }
      )
      observer.current.observe(node)
    },
    [seen]
  )

  useEffect(() => () => observer.current?.disconnect(), [])

  return { ref, seen }
}
