import { memo } from "react"
import { BaseEdge, EdgeLabelRenderer, getBezierPath, useStore as useFlowStore, type EdgeProps } from "@xyflow/react"
import { useTranslation } from "react-i18next"
import { Unlink } from "lucide-react"

import { Button } from "@/components/ui/button"

import { useRun } from "./run-store"
import { useEditorApi } from "./store"

// A linha entre dois blocos: curva e suave. Selecionada, oferece desligar. Sem isso, só dava para
// apagar pela tecla Delete, o que ninguém adivinha.

export const LinkEdgeView = memo(function LinkEdgeView({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  selected,
}: EdgeProps) {
  const { t } = useTranslation()
  const api = useEditorApi()
  const lit = useRun((state) => Boolean(state.links[`${source}>${target}`]))

  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: 0.35,
  })

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        interactionWidth={22}
        style={lit ? { stroke: "var(--status-success)", strokeWidth: 2.25 } : undefined}
      />
      {selected ? (
        <EdgeLabelRenderer>
          <UnlinkButton
            x={labelX}
            y={labelY}
            label={t("flows.block.unlink")}
            onClick={() => api.getState().onEdgesChange([{ type: "remove", id }])}
          />
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
})

function UnlinkButton({ x, y, label, onClick }: { x: number; y: number; label: string; onClick: () => void }) {
  // O rótulo acompanha o zoom. Aqui ele compensa, para o botão continuar com o tamanho de um botão.
  const zoom = useFlowStore((state) => state.transform[2])
  return (
    <div
      className="nodrag nopan absolute"
      style={{
        transform: `translate(-50%, -50%) translate(${x}px, ${y}px) scale(${1 / Math.max(zoom, 0.5)})`,
        pointerEvents: "all",
      }}
    >
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        aria-label={label}
        title={label}
        onClick={onClick}
        className="rounded-full bg-popover text-status-danger shadow-sm hover:text-status-danger"
      >
        <Unlink />
      </Button>
    </div>
  )
}
