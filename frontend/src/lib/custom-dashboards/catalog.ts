import type { WidgetLayout, WidgetType } from "./types"

// O que cada tipo de card é, sem falar nenhuma língua: tamanho, de que dados precisa e o que dá para configurar. Os
// nomes moram em `customDashboards.types.<tipo>`.

/**
 * Como o card agrupa:
 * - `none`: um número só.
 * - `time`: uma série no tempo, sem separar por nada.
 * - `category`: uma dimensão, que não é data.
 * - `free`: tempo e separação, cada um opcional.
 * - `grid`: duas dimensões, uma em cada eixo.
 * - `table`: resumo agrupado ou lista de registros.
 */
export type GroupingMode = "none" | "time" | "category" | "free" | "grid" | "table"

export type WidgetSpec = {
  /** Tamanho ao entrar na grade, em colunas e linhas. */
  size: Pick<WidgetLayout, "w" | "h">
  minW: number
  minH: number
  needsData: boolean
  grouping: GroupingMode
  /** Compara com uma meta. */
  goal: boolean
  /** Um número grande: tem formato, tamanho e faixas. */
  figure: boolean
  /** Eixos de verdade: grade, linhas de referência. */
  axes: boolean
  /** Vale mais de uma medida. */
  multipleMetrics: boolean
  /** Fica sem moldura de card. */
  frameless?: boolean
}

export const WIDGET_SPECS: Record<WidgetType, WidgetSpec> = {
  kpi: { size: { w: 3, h: 2 }, minW: 2, minH: 2, needsData: true, grouping: "none", goal: false, figure: true, axes: false, multipleMetrics: false },
  number_trend: { size: { w: 4, h: 2 }, minW: 3, minH: 2, needsData: true, grouping: "time", goal: false, figure: true, axes: false, multipleMetrics: false },
  gauge: { size: { w: 3, h: 3 }, minW: 2, minH: 3, needsData: true, grouping: "none", goal: true, figure: true, axes: false, multipleMetrics: false },
  progress_bar: { size: { w: 4, h: 2 }, minW: 3, minH: 2, needsData: true, grouping: "none", goal: true, figure: true, axes: false, multipleMetrics: false },
  line_chart: { size: { w: 6, h: 4 }, minW: 3, minH: 3, needsData: true, grouping: "free", goal: false, figure: false, axes: true, multipleMetrics: true },
  bar_chart: { size: { w: 6, h: 4 }, minW: 3, minH: 3, needsData: true, grouping: "free", goal: false, figure: false, axes: true, multipleMetrics: true },
  area_chart: { size: { w: 6, h: 4 }, minW: 3, minH: 3, needsData: true, grouping: "free", goal: false, figure: false, axes: true, multipleMetrics: true },
  pie_chart: { size: { w: 4, h: 4 }, minW: 3, minH: 3, needsData: true, grouping: "category", goal: false, figure: false, axes: false, multipleMetrics: false },
  donut_chart: { size: { w: 4, h: 4 }, minW: 3, minH: 3, needsData: true, grouping: "category", goal: false, figure: false, axes: false, multipleMetrics: false },
  radar: { size: { w: 5, h: 5 }, minW: 3, minH: 4, needsData: true, grouping: "free", goal: false, figure: false, axes: false, multipleMetrics: true },
  heatmap: { size: { w: 6, h: 4 }, minW: 3, minH: 3, needsData: true, grouping: "grid", goal: false, figure: false, axes: false, multipleMetrics: false },
  table: { size: { w: 12, h: 5 }, minW: 3, minH: 3, needsData: true, grouping: "table", goal: false, figure: false, axes: false, multipleMetrics: true },
  funnel: { size: { w: 4, h: 5 }, minW: 3, minH: 3, needsData: true, grouping: "category", goal: false, figure: false, axes: false, multipleMetrics: false },
  rich_text: { size: { w: 6, h: 2 }, minW: 2, minH: 1, needsData: false, grouping: "none", goal: false, figure: false, axes: false, multipleMetrics: false },
  section_divider: { size: { w: 12, h: 1 }, minW: 2, minH: 1, needsData: false, grouping: "none", goal: false, figure: false, axes: false, multipleMetrics: false, frameless: true },
}

/** A ordem em que os tipos aparecem para escolher. */
export const WIDGET_CATEGORIES: { id: string; types: WidgetType[] }[] = [
  { id: "indicators", types: ["kpi", "number_trend", "gauge", "progress_bar"] },
  { id: "charts", types: ["line_chart", "bar_chart", "area_chart", "pie_chart", "donut_chart", "radar", "heatmap"] },
  { id: "tables", types: ["table", "funnel"] },
  { id: "layout", types: ["rich_text", "section_divider"] },
]

export const GRID_COLS = 12
export const GRID_ROW_HEIGHT = 80
export const GRID_MARGIN = 16

/** Quanto medir por todo o painel: o teto de `POST /custom-dashboards/query`. */
export const MAX_METRICS = 12
export const MAX_METRIC_FILTERS = 5
export const MAX_FILTERS = 30
/** As letras da fórmula vão de A a J. */
export const MAX_FORMULA_STEPS = 10
export const MAX_TABLE_COLUMNS = 10
export const MAX_ROWS = 10_000
export const MAX_WIDGETS = 60
export const MAX_DASHBOARDS = 100

export function columnLetter(index: number): string {
  return String.fromCharCode(65 + index)
}
