import { useEffect, useImperativeHandle, useMemo, useRef, useState, type RefObject } from "react"
import { useTranslation } from "react-i18next"
import GridLayout, {
  moveElement,
  useContainerWidth,
  verticalCompactor,
  type Layout,
  type LayoutItem,
} from "react-grid-layout"
import "react-grid-layout/css/styles.css"
import "react-resizable/css/styles.css"
import "./grid.css"

import { useEditorStore, type Snapshot } from "@/hooks/custom-dashboards/use-editor-store"
import type { DashboardPeriod } from "@/hooks/insights/use-dashboard-period"
import { useIsTouch } from "@/hooks/use-media-query"
import { GRID_COLS, GRID_MARGIN, GRID_ROW_HEIGHT, WIDGET_SPECS } from "@/lib/custom-dashboards/catalog"
import { readingOrder } from "@/lib/custom-dashboards/layout"
import type { WidgetLayout } from "@/lib/custom-dashboards/types"

import { WidgetCard } from "./widget-card"

export type GridApi = {
  moveBy: (widgetId: string, dx: number, dy: number) => void
  resizeBy: (widgetId: string, dw: number, dh: number) => void
  wasJustDragged: () => boolean
}

type DashboardGridProps = {
  dashboardId: string
  snapshot: Snapshot
  editing: boolean
  period: DashboardPeriod
  refreshInterval: number
  selectedId: string | null
  gridApi: RefObject<GridApi | null>
}

const GRID_CONFIG = {
  cols: GRID_COLS,
  rowHeight: GRID_ROW_HEIGHT,
  margin: [GRID_MARGIN, GRID_MARGIN],
  containerPadding: [0, 0],
} as const

const WIDTH_OPTIONS = { measureBeforeMount: true }
const RESIZE_DISABLED = { enabled: false }
const DRAG_DISABLED = { enabled: false }
const RESIZE_ENABLED = { enabled: true, handles: ["se"] as const }
// O que está dentro do card e responde ao clique não pode virar arraste.
const NO_DRAG = "button, a, input, textarea, select, [role=menu], .cd-no-drag"
/** O clique que encerra um arraste chega logo depois dele. */
const CLICK_AFTER_DRAG_MS = 120

function toRecord(layout: Layout): Record<string, WidgetLayout> {
  return Object.fromEntries(layout.map(({ i, x, y, w, h }) => [i, { x, y, w, h }]))
}

/**
 * A grade: 12 colunas a partir do celular. A origem mudava o número de colunas por largura e só guardava a de 12, então o
 * que se arrastava numa tela média sumia ao salvar. Aqui a grade é uma só, e o card estreita.
 *
 * O desenho de cada card fica fora do arraste: a posição mora no `GridItem`, e o card vai como filho, com a mesma
 * identidade. Só o que muda de lugar passa pelo `GridItem`, e nenhum gráfico desenha de novo. Medido em `__cdRenders`.
 */
export default function DashboardGrid({
  dashboardId,
  snapshot,
  editing,
  period,
  refreshInterval,
  selectedId,
  gridApi,
}: DashboardGridProps) {
  const { t } = useTranslation()
  const isTouch = useIsTouch()
  const commitLayouts = useEditorStore((state) => state.commitLayouts)
  const { width, containerRef, mounted } = useContainerWidth(WIDTH_OPTIONS)
  const lastDragEnd = useRef(0)
  const [announcement, setAnnouncement] = useState("")

  const { widgets, layouts, order } = snapshot

  const layout = useMemo<Layout>(
    () =>
      order.map((id) => {
        const widget = widgets[id]
        const spec = WIDGET_SPECS[widget.widgetType]
        return {
          i: id,
          ...layouts[id],
          minW: spec.minW,
          minH: spec.minH,
          static: Boolean(widget.visualConfig.locked),
        }
      }),
    [layouts, order, widgets]
  )

  // A ordem do DOM é a de leitura, porque é por ela que o teclado anda.
  const orderedIds = useMemo(
    () => readingOrder(order.map((id) => ({ id, layout: layouts[id] }))).map((item) => item.id),
    [layouts, order]
  )

  const latestLayout = useRef(layout)
  useEffect(() => {
    latestLayout.current = layout
  }, [layout])

  useImperativeHandle(
    gridApi,
    () => ({
      moveBy: (widgetId, dx, dy) => {
        const current = latestLayout.current
        const item = current.find((entry) => entry.i === widgetId)
        if (!item || item.static) return

        const moved = moveElement(
          current.map((entry) => ({ ...entry })),
          { ...item },
          Math.max(0, Math.min(GRID_COLS - item.w, item.x + dx)),
          Math.max(0, item.y + dy),
          true,
          false,
          "vertical",
          GRID_COLS
        )
        const next = verticalCompactor.compact(moved, GRID_COLS)
        commitLayouts(dashboardId, toRecord(next))

        const placed = next.find((entry) => entry.i === widgetId)
        if (placed) {
          setAnnouncement(t("customDashboards.grid.moved", { column: placed.x + 1, row: placed.y + 1, title: widgets[widgetId]?.title }))
        }
      },
      resizeBy: (widgetId, dw, dh) => {
        const current = latestLayout.current
        const item = current.find((entry) => entry.i === widgetId)
        if (!item || item.static) return

        const resized = current.map((entry) =>
          entry.i === widgetId
            ? {
                ...entry,
                w: Math.max(item.minW ?? 1, Math.min(GRID_COLS - item.x, item.w + dw)),
                h: Math.max(item.minH ?? 1, item.h + dh),
              }
            : { ...entry }
        )
        const next = verticalCompactor.compact(resized, GRID_COLS)
        commitLayouts(dashboardId, toRecord(next))

        const placed = next.find((entry) => entry.i === widgetId)
        if (placed) {
          setAnnouncement(t("customDashboards.grid.resized", { columns: placed.w, rows: placed.h, title: widgets[widgetId]?.title }))
        }
      },
      wasJustDragged: () => Date.now() - lastDragEnd.current < CLICK_AFTER_DRAG_MS,
    }),
    [commitLayouts, dashboardId, t, widgets]
  )

  const dragConfig = useMemo(
    () =>
      editing
        ? {
            enabled: true,
            threshold: 4,
            cancel: NO_DRAG,
            // Com dedo, só pelo pegador: em qualquer outro lugar o toque rola a tela.
            ...(isTouch ? { handle: ".cd-drag-handle", cancel: ".cd-no-drag" } : {}),
          }
        : DRAG_DISABLED,
    [editing, isTouch]
  )

  function onLayoutCommitted(next: Layout, _old: LayoutItem | null, _item: LayoutItem | null) {
    lastDragEnd.current = Date.now()
    commitLayouts(dashboardId, toRecord(next))
  }

  return (
    <div ref={containerRef} className="cd-grid-root">
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {mounted ? (
        <GridLayout
          className="cd-grid"
          width={width}
          layout={layout}
          gridConfig={GRID_CONFIG}
          dragConfig={dragConfig}
          resizeConfig={editing ? RESIZE_ENABLED : RESIZE_DISABLED}
          compactor={verticalCompactor}
          onDragStop={onLayoutCommitted}
          onResizeStop={onLayoutCommitted}
        >
          {orderedIds.map((id) => (
            <div key={id}>
              <WidgetCard
                widget={widgets[id]}
                period={period}
                editing={editing}
                refreshInterval={refreshInterval}
                selected={selectedId === id}
              />
            </div>
          ))}
        </GridLayout>
      ) : null}
    </div>
  )
}
