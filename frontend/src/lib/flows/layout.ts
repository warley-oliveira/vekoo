import { isTrigger } from "./catalog"
import { blockOutputs, normalizeHandle } from "./outputs"
import type { BlockData } from "./types"

// Geometria do quadro. Sem biblioteca: colunas por distância do gatilho, na ordem das saídas, é o
// bastante para um fluxo que se lê da esquerda para a direita.

export const BLOCK_WIDTH = 264
export const COLUMN_GAP = 96
export const ROW_GAP = 40
/** Altura de um bloco sem saídas nomeadas. O real vem medido pelo xyflow, quando já existe. */
export const BLOCK_BASE_HEIGHT = 76
export const OUTPUT_ROW_HEIGHT = 28

/**
 * Enquadrar o fluxo inteiro. `includeHiddenNodes` conta também o que ainda não foi medido: com muitos blocos só o
 * que está na tela existe no DOM, e sem isto o resto ficaria de fora.
 */
export const FIT_OPTIONS = { padding: 0.25, maxZoom: 1, includeHiddenNodes: true }

/** Abaixo disto o texto de um bloco não se lê: fluxo comprido abre no começo, e não inteiro e minúsculo. */
export const READABLE_ZOOM = 0.7

type NodeLike = {
  id: string
  type?: string
  data?: BlockData
  position: { x: number; y: number }
  measured?: { width?: number; height?: number }
}
type EdgeLike = { source: string; target: string; sourceHandle?: string | null }

export function estimatedHeight(node: NodeLike): number {
  if (node.measured?.height) return node.measured.height
  const outputs = blockOutputs(node.type ?? "", node.data)
  const single = outputs.length <= 1
  return BLOCK_BASE_HEIGHT + (single ? 0 : outputs.length * OUTPUT_ROW_HEIGHT + 8)
}

/** Organiza o fluxo inteiro: bloco sem caminho até o gatilho fica numa fileira embaixo. */
export function arrangeBlocks<N extends NodeLike>(nodes: N[], edges: EdgeLike[]): N[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))

  const outgoing = new Map<string, EdgeLike[]>()
  edges.forEach((edge) => outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge]))

  const orderOf = (node: N, edge: EdgeLike) => {
    const ids = blockOutputs(node.type ?? "", node.data).map((output) => output.id)
    const index = ids.indexOf(normalizeHandle(edge.sourceHandle))
    return index === -1 ? ids.length : index
  }

  // Coluna de cada bloco: a primeira visita pelo caminho mais curto a partir do gatilho.
  const column = new Map<string, number>()
  const order: string[] = []
  const queue = nodes.filter((node) => isTrigger(node.type)).map((node) => node.id)
  queue.forEach((id) => column.set(id, 0))

  while (queue.length) {
    const id = queue.shift() as string
    order.push(id)
    const node = byId.get(id) as N
    const next = [...(outgoing.get(id) ?? [])].sort((a, b) => orderOf(node, a) - orderOf(node, b))
    for (const edge of next) {
      if (!byId.has(edge.target) || column.has(edge.target)) continue
      column.set(edge.target, (column.get(id) ?? 0) + 1)
      queue.push(edge.target)
    }
  }

  const columns = new Map<number, string[]>()
  order.forEach((id) => {
    const index = column.get(id) ?? 0
    columns.set(index, [...(columns.get(index) ?? []), id])
  })

  const positions = new Map<string, { x: number; y: number }>()
  let tallest = 0
  const stepX = BLOCK_WIDTH + COLUMN_GAP

  columns.forEach((ids, index) => {
    const heights = ids.map((id) => estimatedHeight(byId.get(id) as N))
    const total = heights.reduce((sum, height) => sum + height, 0) + ROW_GAP * (ids.length - 1)
    tallest = Math.max(tallest, total)
    let y = -total / 2
    ids.forEach((id, row) => {
      positions.set(id, { x: index * stepX, y: Math.round(y) })
      y += heights[row] + ROW_GAP
    })
  })

  // Os soltos, numa fileira abaixo de tudo.
  const loose = nodes.filter((node) => !positions.has(node.id))
  loose.forEach((node, index) => {
    positions.set(node.id, { x: index * stepX, y: Math.round(tallest / 2 + 120) })
  })

  return nodes.map((node) => ({ ...node, position: positions.get(node.id) as { x: number; y: number } }))
}

/** Onde um bloco novo nasce, à direita de quem o chamou, sem ficar por cima de outro. */
export function placeAfter(
  source: NodeLike,
  nodes: NodeLike[],
  outputIndex: number,
  outputCount: number
): { x: number; y: number } {
  const width = source.measured?.width ?? BLOCK_WIDTH
  const offset = outputCount > 1 ? (outputIndex - (outputCount - 1) / 2) * 140 : 0
  return nudgeFree({ x: source.position.x + width + COLUMN_GAP, y: source.position.y + offset }, nodes)
}

/** Desce até achar um lugar livre. */
export function nudgeFree(position: { x: number; y: number }, nodes: NodeLike[]): { x: number; y: number } {
  const next = { ...position }
  const collides = () =>
    nodes.some(
      (node) =>
        Math.abs(node.position.x - next.x) < BLOCK_WIDTH - 40 &&
        next.y < node.position.y + estimatedHeight(node) + 16 &&
        next.y + BLOCK_BASE_HEIGHT + 16 > node.position.y
    )
  for (let attempts = 0; collides() && attempts < 40; attempts += 1) next.y += 48
  return next
}
