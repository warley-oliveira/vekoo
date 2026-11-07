import { createContext, useContext } from "react"

import type { DashboardWidget, WidgetAnnotation } from "@/lib/custom-dashboards/types"

/**
 * O que um card pede ao painel. Vem por contexto, com identidade fixa, para não fazer parte das props dos cards: mudar uma
 * função não pode desenhar todos de novo.
 */
export type WidgetActions = {
  edit: (widgetId: string) => void
  remove: (widget: DashboardWidget) => void
  duplicate: (widget: DashboardWidget) => void
  toggleLock: (widgetId: string) => void
  expand: (widget: DashboardWidget) => void
  setNotes: (widgetId: string, notes: WidgetAnnotation[]) => void
  /** Setas no pegador: move uma célula. */
  moveBy: (widgetId: string, dx: number, dy: number) => void
  /** Shift e setas no pegador: muda o tamanho em uma célula. */
  resizeBy: (widgetId: string, dw: number, dh: number) => void
  /** O clique que encerra um arraste não pode abrir o editor. */
  wasJustDragged: () => boolean
}

export const WidgetActionsContext = createContext<WidgetActions | null>(null)

export function useWidgetActions() {
  return useContext(WidgetActionsContext)
}
