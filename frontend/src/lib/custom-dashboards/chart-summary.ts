import type { ChartModel } from "./chart-model"
import { formatValue } from "./format"
import type { VisualConfig } from "./types"

type Translate = (key: string, options?: Record<string, unknown>) => string

/**
 * O que um leitor de tela diz do gráfico: as séries e o valor que a pessoa procuraria de olho. Os outros ficam na tabela do
 * card, que é a alternativa de verdade.
 */
export function chartSummary(model: ChartModel, config: VisualConfig, language: string, t: Translate): string | undefined {
  let peak: { value: number; series: string; at: string } | null = null

  for (const series of model.series) {
    for (const [index, value] of series.values.entries()) {
      if (value === null || value === undefined) continue
      if (!peak || value > peak.value) {
        peak = { value, series: series.label, at: model.categories[index]?.title ?? "" }
      }
    }
  }

  if (!peak) return undefined

  const max = formatValue(peak.value, config, language)
  if (model.series.length === 1) return t("customDashboards.chart.summaryOne", { series: peak.series, max, maxAt: peak.at })

  const names = new Intl.ListFormat(language, { style: "long", type: "conjunction" }).format(model.series.map((series) => series.label))
  return t("customDashboards.chart.summaryMany", { names, max, series: peak.series, maxAt: peak.at })
}
