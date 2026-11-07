import { GRID_COLS, WIDGET_SPECS } from "./catalog"
import type { DashboardWidget, WidgetLayout, WidgetType } from "./types"

// A geometria da grade, sem a biblioteca: o que entra aqui serve também para a pilha do celular e para o que nem carrega
// o `react-grid-layout`.

/** O id de um card novo: tem a forma do id do Mongo, e o servidor o mantém ao salvar. */
export function newWidgetId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
}

function overlaps(a: WidgetLayout, b: WidgetLayout) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

/** O primeiro lugar livre em que o card cabe, de cima para baixo: um KPI novo entra ao lado dos outros. */
export function firstFreeSpot(layouts: WidgetLayout[], size: Pick<WidgetLayout, "w" | "h">): WidgetLayout {
  const w = Math.min(size.w, GRID_COLS)
  const bottom = layouts.reduce((max, item) => Math.max(max, item.y + item.h), 0)

  for (let y = 0; y <= bottom; y += 1) {
    for (let x = 0; x + w <= GRID_COLS; x += 1) {
      const candidate = { x, y, w, h: size.h }
      if (!layouts.some((item) => overlaps(candidate, item))) return candidate
    }
  }

  return { x: 0, y: bottom, w, h: size.h }
}

/** A ordem de leitura. É a do teclado e a da pilha do celular. */
export function readingOrder<T extends { layout: WidgetLayout }>(items: T[]): T[] {
  return [...items].sort((left, right) => left.layout.y - right.layout.y || left.layout.x - right.layout.x)
}

export function sanitizeLayout(layout: Partial<WidgetLayout> | null | undefined, type: WidgetType): WidgetLayout {
  const spec = WIDGET_SPECS[type]
  const number = (value: unknown, fallback: number) => {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }

  const w = Math.min(Math.max(number(layout?.w, spec.size.w), 1), GRID_COLS)
  return {
    x: Math.min(Math.max(number(layout?.x, 0), 0), GRID_COLS - w),
    y: Math.max(number(layout?.y, 0), 0),
    w,
    h: Math.max(number(layout?.h, spec.size.h), 1),
  }
}

/** O que a pilha do celular reserva para cada tipo, em pixels. Nada aqui depende do tamanho guardado na grade. */
const STACK_HEIGHT: Partial<Record<WidgetType, number>> = {
  kpi: 132,
  number_trend: 148,
  progress_bar: 148,
  gauge: 240,
}

export function stackHeight(widget: Pick<DashboardWidget, "widgetType">): number | "auto" {
  // Tabela vira lista empilhada no celular, e cresce com ela.
  if (widget.widgetType === "rich_text" || widget.widgetType === "section_divider" || widget.widgetType === "table") return "auto"
  return STACK_HEIGHT[widget.widgetType] ?? 320
}

/** KPIs vizinhos dividem a linha no celular; um número sozinho ocupa a largura toda. */
export function stackSpans<T extends Pick<DashboardWidget, "widgetType">>(widgets: T[]): (1 | 2)[] {
  const spans: (1 | 2)[] = widgets.map(() => 2)
  let index = 0

  while (index < widgets.length) {
    if (widgets[index].widgetType === "kpi" && widgets[index + 1]?.widgetType === "kpi") {
      spans[index] = 1
      spans[index + 1] = 1
      index += 2
    } else {
      index += 1
    }
  }

  return spans
}
