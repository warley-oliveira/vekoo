import { evaluateScalar, evaluateSeries, extractStepIds, parseFormula } from "./formula-engine"
import type { FormulaStep, QueryResult, QueryRow } from "./types"

// Junta o resultado de vários passos numa linha só, para todo tipo de card desenhar como se fosse uma consulta comum.
//
// Na origem, um passo que não agrupa (a fonte dele não tem aquela dimensão) virava uma série cujo eixo eram os próprios
// valores, e a conta dava lixo. Aqui ele vale o mesmo número em todo ponto: "conversas por canal, sobre o total".

/** O nome da coluna do resultado de uma fórmula. Toda fórmula devolve uma coluna só. */
export const FORMULA_VALUE = "value"

function metricColumn(result: QueryResult): string {
  return result.columns.includes(FORMULA_VALUE) ? FORMULA_VALUE : (result.columns.at(-1) ?? FORMULA_VALUE)
}

function dimensionColumn(result: QueryResult): string | null {
  const metric = metricColumn(result)
  return result.columns.find((column) => column !== metric && column !== "_id") ?? null
}

function asNumber(value: unknown): number {
  const number = Number(value ?? 0)
  return Number.isFinite(number) ? number : 0
}

function scalarOf(result: QueryResult | undefined): number {
  if (!result?.rows.length) return 0
  return asNumber(result.rows[0][metricColumn(result)])
}

function mergeLabels(results: QueryResult[]) {
  const merged: Record<string, Record<string, string>> = {}
  for (const result of results) {
    for (const [field, map] of Object.entries(result.labels ?? {})) {
      merged[field] = { ...merged[field], ...map }
    }
  }
  return merged
}

/** Sem agrupar: uma linha, com um número. */
export function evaluateCompoundScalar(formula: string, stepResults: Record<string, QueryResult>, steps: FormulaStep[]): QueryResult {
  const values: Record<string, number> = {}
  for (const step of steps) values[step.id.toUpperCase()] = scalarOf(stepResults[step.id])

  return {
    rows: [{ [FORMULA_VALUE]: evaluateScalar(parseFormula(formula), values) }],
    columns: [FORMULA_VALUE],
    meta: { total: 1, truncated: false },
  }
}

/**
 * Agrupando: uma linha por valor da dimensão, a união de todos os passos. Cada passo tem a própria coluna (`created_at`
 * numa fonte, `day` em outra), e o valor é o que alinha: data sai em milissegundos, no começo do dia da organização.
 */
export function evaluateCompoundSeries(
  formula: string,
  stepResults: Record<string, QueryResult>,
  steps: FormulaStep[],
  dimensionField: string
): QueryResult {
  const ast = parseFormula(formula)
  const used = extractStepIds(ast)
  const stepMaps: Record<string, Map<string, number>> = {}
  const scalars: Record<string, number> = {}
  const raws = new Map<string, unknown>()
  let truncated = false

  for (const step of steps) {
    const id = step.id.toUpperCase()
    if (!used.has(id)) continue

    const result = stepResults[step.id]
    if (!result) {
      scalars[id] = 0
      continue
    }

    truncated ||= result.meta?.truncated ?? false
    const dimension = dimensionColumn(result)
    if (!dimension) {
      scalars[id] = scalarOf(result)
      continue
    }

    const metric = metricColumn(result)
    const map = new Map<string, number>()
    for (const row of result.rows) {
      const key = String(row[dimension] ?? "")
      map.set(key, asNumber(row[metric]))
      if (!raws.has(key)) raws.set(key, row[dimension] ?? null)
    }
    stepMaps[id] = map
  }

  // O passo sem dimensão entra em todo ponto, com o mesmo valor.
  const dimensionValues = [...raws.keys()]
  for (const [id, value] of Object.entries(scalars)) {
    stepMaps[id] = new Map(dimensionValues.map((dimension) => [dimension, value]))
  }

  const evaluated = evaluateSeries(ast, stepMaps, dimensionValues)
  const rows: QueryRow[] = dimensionValues.map((dimension) => ({
    [dimensionField]: raws.get(dimension) ?? null,
    [FORMULA_VALUE]: evaluated.get(dimension) ?? 0,
  }))
  rows.sort((left, right) => compareDimension(left[dimensionField], right[dimensionField]))

  const results = Object.values(stepResults)
  const labels = mergeLabels(results)
  const fieldLabels = Object.assign({}, ...results.map((result) => result.fieldLabels ?? {}))

  // Cada passo pode ter dado nome numa coluna diferente: o rótulo fica no nome que a tela conhece.
  const labelsForDimension = Object.assign({}, ...Object.values(labels))

  return {
    rows,
    columns: [dimensionField, FORMULA_VALUE],
    labels: Object.keys(labelsForDimension).length ? { ...labels, [dimensionField]: labelsForDimension } : undefined,
    fieldLabels,
    meta: { total: rows.length, truncated },
  }
}

function compareDimension(left: unknown, right: unknown) {
  if (typeof left === "number" && typeof right === "number") return left - right
  return String(left ?? "").localeCompare(String(right ?? ""))
}

export function evaluateCompound(
  formula: string,
  stepResults: Record<string, QueryResult>,
  steps: FormulaStep[],
  dimensionField?: string | null
): QueryResult {
  return dimensionField
    ? evaluateCompoundSeries(formula, stepResults, steps, dimensionField)
    : evaluateCompoundScalar(formula, stepResults, steps)
}
