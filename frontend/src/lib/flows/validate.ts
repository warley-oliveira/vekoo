import { blockEntry, isTrigger } from "./catalog"
import { blockOutputs, DEFAULT_OUTPUT, normalizeHandle } from "./outputs"
import { missingKey } from "./summary"
import type { BlockData, ServerPublishIssue } from "./types"

// A conferência antes de publicar. A API recusa só o que quebra o motor (`DefinitionValidator`); aqui
// entra também o que faria o fluxo parar calado, como mensagem em branco. Erro impede publicar; aviso,
// não. Roda fora do que a pessoa digita: um resultado por pausa, e não por tecla.

export type IssueSeverity = "error" | "warning"

export type FlowIssue = {
  id: string
  severity: IssueSeverity
  /** Chave de tradução. Recebe `count` e `name` quando faz sentido. */
  messageKey: string
  params?: Record<string, unknown>
  /** O bloco que resolve. Sem ele, o problema é do fluxo inteiro. */
  nodeId?: string
}

type NodeLike = { id: string; type?: string; data?: BlockData }
type EdgeLike = { id: string; source: string; target: string; sourceHandle?: string | null }

function reachable(nodes: NodeLike[], edges: EdgeLike[]): Set<string> {
  const triggers = nodes.filter((node) => isTrigger(node.type)).map((node) => node.id)
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const next = new Map<string, string[]>()
  edges.forEach((edge) => {
    // Conexão por uma saída que o bloco não tem não aparece no quadro e o motor não segue: não é caminho.
    const source = byId.get(edge.source)
    const handle = normalizeHandle(edge.sourceHandle)
    if (!source || !blockOutputs(source.type ?? "", source.data).some((output) => output.id === handle)) return
    next.set(edge.source, [...(next.get(edge.source) ?? []), edge.target])
  })

  const seen = new Set<string>(triggers)
  const queue = [...triggers]
  while (queue.length) {
    const id = queue.shift() as string
    for (const target of next.get(id) ?? []) {
      if (!seen.has(target)) {
        seen.add(target)
        queue.push(target)
      }
    }
  }
  return seen
}

export function validateFlow(nodes: NodeLike[], edges: EdgeLike[]): FlowIssue[] {
  const issues: FlowIssue[] = []
  const triggers = nodes.filter((node) => isTrigger(node.type))
  const ids = new Set(nodes.map((node) => node.id))

  if (triggers.length === 0) {
    issues.push({ id: "no-trigger", severity: "error", messageKey: "flows.issues.noTrigger" })
  }
  triggers.slice(1).forEach((node) => {
    issues.push({
      id: `multiple-${node.id}`,
      severity: "error",
      messageKey: "flows.issues.multipleTriggers",
      nodeId: node.id,
    })
  })

  const outgoing = new Map<string, Set<string>>()
  edges.forEach((edge) => {
    if (!ids.has(edge.source) || !ids.has(edge.target)) {
      issues.push({ id: `broken-${edge.id}`, severity: "error", messageKey: "flows.issues.brokenEdge" })
      return
    }
    const handles = outgoing.get(edge.source) ?? new Set<string>()
    handles.add(normalizeHandle(edge.sourceHandle))
    outgoing.set(edge.source, handles)
  })

  const alive = reachable(nodes, edges)

  nodes.forEach((node) => {
    const type = node.type ?? ""
    const data = node.data ?? {}
    if (!blockEntry(type)) {
      issues.push({ id: `unknown-${node.id}`, severity: "error", messageKey: "flows.issues.unknownBlock", nodeId: node.id })
      return
    }

    // Bloco que nenhum caminho alcança não roda: pode estar guardado para depois, e não impede de publicar.
    if (!isTrigger(type) && !alive.has(node.id)) {
      issues.push({ id: `orphan-${node.id}`, severity: "warning", messageKey: "flows.issues.unreachable", nodeId: node.id })
      return
    }

    const missing = missingKey(type, data)
    if (missing) {
      issues.push({ id: `missing-${node.id}`, severity: "error", messageKey: missing, nodeId: node.id })
    }

    const handles = outgoing.get(node.id)
    if (isTrigger(type)) {
      if (!handles?.size) {
        issues.push({ id: `start-${node.id}`, severity: "error", messageKey: "flows.issues.triggerAlone", nodeId: node.id })
      }
      return
    }

    if (type === "loop" && !handles?.has("each")) {
      issues.push({ id: `loop-${node.id}`, severity: "error", messageKey: "flows.issues.loopBody", nodeId: node.id })
    }

    if (type === "ai_assistant" && Array.isArray(data.outputs)) {
      const loose = (data.outputs as { id: string }[]).filter((output) => !handles?.has(output.id)).length
      if (loose > 0) {
        issues.push({
          id: `ai-loose-${node.id}`,
          severity: "warning",
          messageKey: "flows.issues.aiLoose",
          params: { count: loose },
          nodeId: node.id,
        })
      }
      if (data.mode === "processing" && (data.outputs as unknown[]).length === 0) {
        issues.push({ id: `ai-out-${node.id}`, severity: "error", messageKey: "flows.issues.aiNoOutputs", nodeId: node.id })
      }
    }

    if (type === "condition") {
      const hasDefault = handles?.has(DEFAULT_OUTPUT)
      if (!hasDefault && !handles?.has("true") && !handles?.has("false")) {
        issues.push({ id: `cond-${node.id}`, severity: "warning", messageKey: "flows.issues.conditionLoose", nodeId: node.id })
      }
    }
  })

  return issues
}

/** Traduz o que a API recusou para o mesmo formato: os erros continuam clicáveis. */
export function issuesFromServer(serverIssues: ServerPublishIssue[]): FlowIssue[] {
  return serverIssues.map((issue, index) => ({
    id: `server-${index}-${issue.code}`,
    severity: "error" as const,
    messageKey: `flows.issues.${issue.code}`,
    nodeId: issue.nodeId,
  }))
}

/** A impressão digital do que muda o comportamento: arrastar um bloco não é "alteração não publicada". */
export function definitionFingerprint(definition: {
  nodes?: { id: string; type: string; data?: BlockData }[]
  edges?: EdgeLike[]
  fields?: unknown
  base_prompt?: string
}): string {
  const nodes = [...(definition.nodes ?? [])]
    .map((node) => [node.id, node.type, stable(node.data ?? {})])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
  const edges = [...(definition.edges ?? [])]
    .map((edge) => [edge.source, normalizeHandle(edge.sourceHandle), edge.target])
    .sort((a, b) => a.join("|").localeCompare(b.join("|")))
  return JSON.stringify([nodes, edges, stable(definition.fields ?? []), definition.base_prompt ?? ""])
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === "object") {
    return Object.keys(value as object)
      .sort()
      .reduce<Record<string, unknown>>((sorted, key) => {
        const inner = (value as Record<string, unknown>)[key]
        if (inner !== "" && inner != null) sorted[key] = stable(inner)
        return sorted
      }, {})
  }
  return value
}

/** Para o texto que pede para ligar uma saída: lê as saídas que existem no bloco. */
export function looseOutputIds(type: string, data: BlockData | undefined, connected: Set<string>): string[] {
  return blockOutputs(type, data)
    .map((output) => output.id)
    .filter((id) => id !== "onError" && !connected.has(id))
}
