import { memo, useMemo } from "react"

import { blockFamily } from "@/lib/flows/catalog"
import type { FlowDefinition } from "@/lib/flows/types"
import { cn } from "@/lib/utils"

import "./flow-tokens.css"

// O desenho de um fluxo, em miniatura e sem biblioteca: é o que mostra um modelo sem precisar abrir. As linhas são
// só decoração: quem descreve o modelo é o texto do card, então o desenho fica escondido do leitor de tela.

const BLOCK_WIDTH = 264
const BLOCK_HEIGHT = 84
const PADDING = 48
/** Quanto do fluxo cabe na miniatura sem o bloco virar um risco. O resto some aos poucos, à direita. */
const MAX_VISIBLE_WIDTH = 1240

export const FlowMiniMap = memo(function FlowMiniMap({
  definition,
  className,
}: {
  definition: FlowDefinition
  className?: string
}) {
  const geometry = useMemo(() => {
    const nodes = (definition.nodes ?? []).map((node) => ({
      id: node.id,
      type: node.type,
      x: node.position?.x ?? 0,
      y: node.position?.y ?? 0,
    }))
    if (nodes.length === 0) return null

    const byId = new Map(nodes.map((node) => [node.id, node]))
    const minX = Math.min(...nodes.map((node) => node.x)) - PADDING
    const minY = Math.min(...nodes.map((node) => node.y)) - PADDING
    const maxX = Math.min(Math.max(...nodes.map((node) => node.x)) + BLOCK_WIDTH + PADDING, minX + MAX_VISIBLE_WIDTH)
    const maxY = Math.max(...nodes.map((node) => node.y)) + BLOCK_HEIGHT + PADDING
    const cropped = Math.max(...nodes.map((node) => node.x)) + BLOCK_WIDTH + PADDING > maxX

    const edges = (definition.edges ?? []).flatMap((edge) => {
      const from = byId.get(edge.source)
      const to = byId.get(edge.target)
      if (!from || !to) return []
      const x1 = from.x + BLOCK_WIDTH
      const y1 = from.y + BLOCK_HEIGHT / 2
      const x2 = to.x
      const y2 = to.y + BLOCK_HEIGHT / 2
      const bend = Math.max(40, Math.abs(x2 - x1) * 0.45)
      return [{ id: edge.id, d: `M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}` }]
    })

    return { nodes, edges, cropped, viewBox: `${minX} ${minY} ${maxX - minX} ${maxY - minY}` }
  }, [definition])

  if (!geometry) return null

  return (
    <svg
      aria-hidden
      viewBox={geometry.viewBox}
      preserveAspectRatio={geometry.cropped ? "xMinYMid meet" : "xMidYMid meet"}
      className={cn("block size-full", geometry.cropped && "mask-r-from-75%", className)}
    >
      {geometry.edges.map((edge) => (
        <path key={edge.id} d={edge.d} fill="none" stroke="var(--border)" strokeWidth={8} />
      ))}
      {geometry.nodes.map((node) => (
        <g key={node.id} className="flow-block" data-family={blockFamily(node.type)}>
          <rect
            x={node.x}
            y={node.y}
            width={BLOCK_WIDTH}
            height={BLOCK_HEIGHT}
            rx={16}
            fill="var(--card)"
            stroke="var(--border)"
            strokeWidth={4}
          />
          <rect x={node.x + 16} y={node.y + 20} width={44} height={44} rx={10} fill="var(--block-tint-soft)" />
          <rect x={node.x + 28} y={node.y + 32} width={20} height={20} rx={5} fill="var(--block-tint)" />
          <rect x={node.x + 76} y={node.y + 26} width={140} height={12} rx={6} fill="var(--muted-foreground)" opacity={0.45} />
          <rect x={node.x + 76} y={node.y + 48} width={160} height={10} rx={5} fill="var(--muted-foreground)" opacity={0.2} />
        </g>
      ))}
    </svg>
  )
})
