import { blockEntry, isTrigger } from "./catalog"
import type { BlockData, DefinitionEdge } from "./types"

// As saídas de um bloco. A saída padrão é `next`: aresta sem `sourceHandle` vale o mesmo, e é por
// isso que tudo aqui normaliza antes de comparar. Cada saída leva a um bloco só.

export const DEFAULT_OUTPUT = "next"

export type BlockOutput = {
  id: string
  /** Texto que a pessoa escreveu (botão, intenção, caso). */
  label?: string
  /** Chave de tradução, quando a saída é fixa. */
  labelKey?: string
  tone?: "danger"
}

/** O que a pessoa lê numa saída: o texto que ela escreveu, ou o rótulo fixo. */
export function outputLabel(output: BlockOutput, t: (key: string) => string): string {
  return output.label || (output.labelKey ? t(output.labelKey) : output.id)
}

export function normalizeHandle(handle: string | null | undefined): string {
  return handle || DEFAULT_OUTPUT
}

type LabeledOutput = { id?: unknown; label?: unknown; title?: unknown; value?: unknown }

function list(value: unknown): LabeledOutput[] {
  return Array.isArray(value) ? (value as LabeledOutput[]) : []
}

function text(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value)
}

const SENTIMENT_LABELS: Record<string, string> = {
  positive: "flows.outputs.positive",
  neutral: "flows.outputs.neutral",
  negative: "flows.outputs.negative",
}

const ERROR_OUTPUT: BlockOutput = { id: "onError", labelKey: "flows.outputs.onError", tone: "danger" }

/**
 * Tudo por onde um bloco pode seguir. É o que desenha as linhas com rótulo no bloco e o que o
 * inspetor oferece em "Para onde vai".
 */
export function blockOutputs(type: string, data: BlockData | undefined): BlockOutput[] {
  const entry = blockEntry(type)
  if (!entry) return [{ id: DEFAULT_OUTPUT, labelKey: "flows.outputs.next" }]
  if (entry.terminal) return []
  if (isTrigger(type)) return [{ id: DEFAULT_OUTPUT, labelKey: "flows.outputs.next" }]

  const source = data ?? {}
  let outputs: BlockOutput[]

  switch (type) {
    case "send_interactive":
      outputs = list(source.buttons).map((button) => ({ id: text(button.id), label: text(button.title) }))
      if (outputs.length > 0) outputs.push({ id: DEFAULT_OUTPUT, labelKey: "flows.outputs.otherReply" })
      else outputs = [{ id: DEFAULT_OUTPUT, labelKey: "flows.outputs.next" }]
      break
    case "switch":
      outputs = list(source.cases).map((item) => ({ id: text(item.id), label: text(item.value) }))
      outputs.push({ id: "default", labelKey: "flows.outputs.default" })
      break
    case "ai_intent_classification":
      outputs = list(source.outputs).map((item) => ({ id: text(item.id), label: text(item.label) }))
      outputs.push({ id: "default", labelKey: "flows.outputs.noneOfThem" })
      break
    case "ai_sentiment":
      outputs = list(source.outputs).map((item) => {
        const id = text(item.id)
        const label = text(item.label)
        return label || !SENTIMENT_LABELS[id] ? { id, label } : { id, labelKey: SENTIMENT_LABELS[id] }
      })
      break
    case "ai_assistant":
      outputs = list(source.outputs).map((item) => ({ id: text(item.id), label: text(item.label) }))
      if (source.mode !== "processing" && Number(source.max_turns) > 0) {
        outputs.push({ id: "maxTurns", labelKey: "flows.outputs.maxTurns" })
      }
      break
    default:
      outputs = entry.outputs
        ? entry.outputs.map((output) => ({ ...output }))
        : [{ id: DEFAULT_OUTPUT, labelKey: "flows.outputs.next" }]
  }

  return entry.errorOutput ? [...outputs, ERROR_OUTPUT] : outputs
}

/** Só a saída padrão: o bloco mostra a bolinha no título, sem linha de rótulo. */
export function hasSingleOutput(outputs: BlockOutput[]): boolean {
  return outputs.length === 1 && outputs[0].id === DEFAULT_OUTPUT
}

const RESERVED_IDS = new Set(["next", "onerror", "default", "true", "false", "maxturns"])

/** Em minúsculas, sem acento e com sublinhado: é o nome que o motor e o modelo enxergam. */
export function slugify(label: string, fallback = "saida"): string {
  const slug = label
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40)
  if (!slug) return fallback
  return /^\d/.test(slug) ? `${fallback}_${slug}` : slug
}

export function uniqueOutputId(label: string, taken: Iterable<string>, fallback = "saida"): string {
  const used = new Set(Array.from(taken, (id) => id.toLowerCase()))
  const base = slugify(label, fallback)
  let candidate = base
  for (let n = 2; used.has(candidate) || RESERVED_IDS.has(candidate); n += 1) candidate = `${base}_${n}`
  return candidate
}

/** Mantém a última conexão de cada saída: fluxo antigo pode ter acumulado mais de uma. */
export function dedupeEdges(edges: DefinitionEdge[]): DefinitionEdge[] {
  const seen = new Map<string, DefinitionEdge>()
  for (const edge of edges) seen.set(`${edge.source}|${normalizeHandle(edge.sourceHandle)}`, edge)
  return Array.from(seen.values())
}
