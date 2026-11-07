import { useMemo } from "react"

import { useDataSources } from "@/hooks/custom-dashboards/use-custom-dashboards"
import { figureValue, useWidgetData } from "@/hooks/custom-dashboards/use-widget-data"
import type { DashboardPeriod } from "@/hooks/insights/use-dashboard-period"
import { WIDGET_SPECS } from "@/lib/custom-dashboards/catalog"
import { buildChartModel, buildParts, buildTableModel } from "@/lib/custom-dashboards/chart-model"
import { isFormulaQuery } from "@/lib/custom-dashboards/query"
import type { DashboardWidget, WidgetType } from "@/lib/custom-dashboards/types"

import { useModelContext } from "./use-model-context"

const FIGURE_TYPES = new Set<WidgetType>(["kpi", "number_trend", "gauge", "progress_bar"])

// Dessas, o modelo sai de `query.dimensions`. KPI, medidor e progresso só leem um número.
function needsChartModel(type: WidgetType) {
  return type !== "table" && type !== "kpi" && type !== "gauge" && type !== "progress_bar" && WIDGET_SPECS[type].needsData
}

/** As fontes que o card precisa alcançar. Fórmula pode ter várias. */
function requiredSources(widget: Pick<DashboardWidget, "query" | "dataSource">): string[] {
  if (isFormulaQuery(widget.query)) {
    return [...new Set((widget.query.formulaSteps ?? []).map((step) => step.dataSource).filter(Boolean))]
  }
  const key = widget.query.dataSource || widget.dataSource
  return key ? [key] : []
}

type ViewOptions = { enabled?: boolean; refreshInterval?: number }

/**
 * Tudo o que um card precisa para aparecer: os dados e os modelos, calculados uma vez só. O gráfico, a tabela gêmea e o
 * CSV leem o mesmo modelo, e por isso os números nunca discordam.
 */
export function useWidgetView(widget: DashboardWidget, period: DashboardPeriod, { enabled = true, refreshInterval }: ViewOptions = {}) {
  const { dataSources, error: sourcesError, reload: reloadSources } = useDataSources()

  const spec = WIDGET_SPECS[widget.widgetType]
  const required = useMemo(() => requiredSources(widget), [widget])
  const source = dataSources?.find((item) => item.key === (widget.query.dataSource || widget.dataSource))
  // Fonte que a pessoa não alcança nem sai de `data-sources`: nem pergunta ao servidor, que responderia 403.
  const forbidden = Boolean(dataSources) && required.some((key) => !dataSources?.some((item) => item.key === key))
  const unconfigured = spec.needsData && required.length === 0

  const query = useWidgetData(widget, period, {
    enabled: enabled && spec.needsData && !forbidden && !unconfigured,
    refreshInterval,
    source,
    sources: dataSources,
  })

  const context = useModelContext(source)
  const shown = useMemo(
    () => (query.shownQuery === widget.query ? widget : { ...widget, query: query.shownQuery }),
    [query.shownQuery, widget]
  )
  const result = query.data?.result

  const chart = useMemo(
    () => (result && needsChartModel(widget.widgetType) ? buildChartModel(shown, result, context) : null),
    [context, result, shown, widget.widgetType]
  )
  const parts = useMemo(
    () => (chart && (widget.widgetType === "pie_chart" || widget.widgetType === "donut_chart") ? buildParts(shown, chart, context) : null),
    [chart, context, shown, widget.widgetType]
  )
  const table = useMemo(
    () => (result && widget.widgetType === "table" ? buildTableModel(shown, result, context) : null),
    [context, result, shown, widget.widgetType]
  )
  const figure = useMemo(
    () => (query.data && FIGURE_TYPES.has(widget.widgetType) ? figureValue(query.shownQuery, query.data) : null),
    [query.data, query.shownQuery, widget.widgetType]
  )

  return {
    ...query,
    source,
    chart,
    parts,
    table,
    figure,
    previous: query.data?.previous,
    forbidden,
    unconfigured,
    sourcesError,
    reloadSources,
    formulaError: query.data?.formulaError,
    isEmpty: Boolean(
      query.data &&
        !query.data.formulaError &&
        ((chart && widget.widgetType !== "number_trend" && (chart.categories.length === 0 || result?.rows.length === 0)) ||
          (parts && parts.length === 0) ||
          (table && table.rows.length === 0))
    ),
  }
}
