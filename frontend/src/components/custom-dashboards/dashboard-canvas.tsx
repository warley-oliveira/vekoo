import { lazy, memo, Suspense, useMemo, type RefObject } from "react"

import { LoadingRegion } from "@/components/shared"
import { Skeleton } from "@/components/ui/skeleton"
import type { Snapshot } from "@/hooks/custom-dashboards/use-editor-store"
import type { DashboardPeriod } from "@/hooks/insights/use-dashboard-period"
import { useIsMobile } from "@/hooks/use-is-mobile"
import { GRID_COLS, GRID_MARGIN, GRID_ROW_HEIGHT } from "@/lib/custom-dashboards/catalog"
import { readingOrder, stackHeight, stackSpans } from "@/lib/custom-dashboards/layout"
import { cn } from "@/lib/utils"

import type { GridApi } from "./dashboard-grid"
import { WidgetCard } from "./widget-card"

// A biblioteca da grade só desce para quem vai usá-la: no celular os cards ficam empilhados, sem ela.
const DashboardGrid = lazy(() => import("./dashboard-grid"))

type DashboardCanvasProps = {
  dashboardId: string
  snapshot: Snapshot
  editing: boolean
  period: DashboardPeriod
  refreshInterval: number
  selectedId: string | null
  gridApi: RefObject<GridApi | null>
}

/** Os cards do painel: a grade no desktop, e a pilha no celular, na ordem de leitura. */
export const DashboardCanvas = memo(function DashboardCanvas(props: DashboardCanvasProps) {
  const isMobile = useIsMobile()

  return isMobile ? (
    <StackedCanvas {...props} />
  ) : (
    <Suspense fallback={<GridSkeleton snapshot={props.snapshot} />}>
      <DashboardGrid {...props} />
    </Suspense>
  )
})

function StackedCanvas({ snapshot, editing, period, refreshInterval, selectedId }: DashboardCanvasProps) {
  const widgets = useMemo(
    () => readingOrder(snapshot.order.map((id) => ({ ...snapshot.widgets[id], layout: snapshot.layouts[id] }))),
    [snapshot]
  )
  const spans = useMemo(() => stackSpans(widgets), [widgets])

  return (
    <div className="grid grid-cols-2 gap-3">
      {widgets.map((widget, index) => {
        const height = stackHeight(widget)
        return (
          <div
            key={widget.id}
            className={cn("min-w-0", spans[index] === 2 && "col-span-2")}
            style={height === "auto" ? undefined : { height }}
          >
            <WidgetCard
              widget={snapshot.widgets[widget.id]}
              period={period}
              editing={editing}
              refreshInterval={refreshInterval}
              presentation="stack"
              selected={selectedId === widget.id}
            />
          </div>
        )
      })}
    </div>
  )
}

/** O lugar de cada card, com o tamanho guardado, enquanto a biblioteca da grade não chega. */
export function GridSkeleton({ snapshot }: { snapshot: Snapshot }) {
  return (
    <LoadingRegion
      className="grid"
      style={{
        gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))`,
        gridAutoRows: GRID_ROW_HEIGHT,
        gap: GRID_MARGIN,
      }}
    >
      {snapshot.order.map((id) => {
        const layout = snapshot.layouts[id]
        return (
          <div
            key={id}
            className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10"
            style={{
              gridColumn: `${layout.x + 1} / span ${layout.w}`,
              gridRow: `${layout.y + 1} / span ${layout.h}`,
            }}
          >
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="w-full flex-1" />
          </div>
        )
      })}
    </LoadingRegion>
  )
}
