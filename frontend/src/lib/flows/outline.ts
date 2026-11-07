import { isTrigger } from "./catalog"
import { blockOutputs, normalizeHandle, type BlockOutput } from "./outputs"
import type { BlockData } from "./types"

// O fluxo lido como texto, de cima para baixo: é como se edita no celular e a alternativa ao quadro para
// quem usa teclado ou leitor de tela. Cada bloco aparece uma vez; quem volta a um que já apareceu vira uma
// referência, e é assim que `loop` e caminhos que se juntam não viram uma lista infinita. Saída sem ligação
// vira uma linha para continuar dali, menos a de erro, que é opcional e encheria a lista.

type NodeLike = { id: string; type?: string; data?: BlockData }
type EdgeLike = { source: string; target: string; sourceHandle?: string | null }

export type OutlineRow = {
  kind: "block"
  key: string
  nodeId: string
  depth: number
  /** A saída que trouxe até aqui, quando o bloco anterior tinha mais de uma. */
  via?: BlockOutput
}

export type OutlineReference = {
  kind: "reference"
  key: string
  nodeId: string
  depth: number
  via?: BlockOutput
}

export type OutlineLoose = {
  kind: "loose"
  key: string
  nodeId: string
  depth: number
}

export type OutlineFree = {
  kind: "free"
  key: string
  nodeId: string
  depth: number
  output: BlockOutput
  /** O bloco tem mais de uma saída, e a linha diz qual é esta. */
  named: boolean
}

export type OutlineEntry = OutlineRow | OutlineReference | OutlineLoose | OutlineFree

export function buildOutline(nodes: NodeLike[], edges: EdgeLike[]): OutlineEntry[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const outgoing = new Map<string, EdgeLike[]>()
  edges.forEach((edge) => outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge]))

  const rows: OutlineEntry[] = []
  const seen = new Set<string>()

  const visit = (id: string, depth: number, via?: BlockOutput) => {
    const node = byId.get(id)
    if (!node) return
    if (seen.has(id)) {
      rows.push({ kind: "reference", key: `ref-${rows.length}`, nodeId: id, depth, via })
      return
    }
    seen.add(id)
    rows.push({ kind: "block", key: id, nodeId: id, depth, via })

    const outputs = blockOutputs(node.type ?? "", node.data)
    const links = outgoing.get(id) ?? []
    const named = outputs.length > 1

    const free = (output: BlockOutput, at: number) =>
      rows.push({ kind: "free", key: `free-${id}-${output.id}`, nodeId: id, depth: at, output, named })

    if (!named) {
      links.forEach((edge) => visit(edge.target, depth))
      if (links.length === 0 && outputs[0]) free(outputs[0], depth)
      return
    }
    outputs.forEach((output) => {
      const edge = links.find((link) => normalizeHandle(link.sourceHandle) === output.id)
      if (edge) visit(edge.target, depth + 1, output)
      else if (output.id !== "onError") free(output, depth + 1)
    })
    // Conexão por uma saída que o bloco não mostra (a padrão, em quem tem saídas nomeadas).
    links
      .filter((link) => !outputs.some((output) => output.id === normalizeHandle(link.sourceHandle)))
      .forEach((edge) => visit(edge.target, depth + 1))
  }

  nodes.filter((node) => isTrigger(node.type)).forEach((node) => visit(node.id, 0))
  nodes
    .filter((node) => !seen.has(node.id))
    .forEach((node) => {
      seen.add(node.id)
      rows.push({ kind: "loose", key: `loose-${node.id}`, nodeId: node.id, depth: 0 })
    })

  return rows
}
