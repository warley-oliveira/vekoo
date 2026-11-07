import { memo, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { useSteppedWidth } from "@/hooks/custom-dashboards/use-stepped-width"
import { useLanguage } from "@/lib/i18n"
import type { ChartModel } from "@/lib/custom-dashboards/chart-model"
import { formatValue } from "@/lib/custom-dashboards/format"
import type { VisualConfig } from "@/lib/custom-dashboards/types"
import { cn } from "@/lib/utils"

type HeatmapWidgetProps = {
  model: ChartModel
  config: VisualConfig
}

const STEPS = 6
/** Enquanto não mediu: passou disso, nem todo rótulo do eixo cabe. */
const MAX_TICKS = 12
/** O que a coluna dos nomes costuma tomar, e a largura de uma letra do eixo. Só decidem de quantas em quantas colunas há rótulo. */
const NAMES_WIDTH = 96
const TICK_CHAR_WIDTH = 6.4
const TICK_GAP = 8

function stepOf(value: number, max: number) {
  if (max <= 0 || value <= 0) return 0
  return Math.max(1, Math.ceil((value / max) * STEPS))
}

/**
 * Intensidade numa grade: uma linha por valor da segunda dimensão, ou uma linha só. Sequencial, um matiz só, do claro ao
 * acento. O número exato aparece abaixo, ao passar o mouse, e fica sempre na tabela do card.
 */
export const HeatmapWidget = memo(function HeatmapWidget({ model, config }: HeatmapWidgetProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const [hovered, setHovered] = useState<{ row: number; column: number } | null>(null)
  const { categories, series } = model

  const max = useMemo(
    () => Math.max(0, ...series.flatMap((item) => item.values.map((value) => value ?? 0))),
    [series]
  )

  const single = series.length === 1
  const { ref, width } = useSteppedWidth()
  const columnWidth = (width - (single ? 0 : NAMES_WIDTH)) / Math.max(1, categories.length)
  const longestTick = Math.max(0, ...categories.map((category) => category.tick.length))
  const tickEvery =
    columnWidth > 0
      ? Math.max(1, Math.ceil((longestTick * TICK_CHAR_WIDTH + TICK_GAP) / columnWidth))
      : Math.max(1, Math.ceil(categories.length / MAX_TICKS))
  // Cada rótulo ocupa as colunas dele até o próximo: não encosta no vizinho nem é cortado.
  const ticks = categories.flatMap((category, index) => {
    if (index % tickEvery !== 0) return []
    const span = Math.min(tickEvery, categories.length - index)
    return [{ key: category.id, span, tick: span === tickEvery ? category.tick : "" }]
  })
  const readout = hovered
    ? {
        category: categories[hovered.column].title,
        series: series[hovered.row].label,
        value: formatValue(series[hovered.row].values[hovered.column] ?? 0, config, language),
      }
    : null

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div
        ref={ref}
        role="img"
        aria-label={t("customDashboards.chart.heatmapSummary", {
          rows: series.length,
          columns: categories.length,
          max: formatValue(max, config, language),
        })}
        className="grid min-h-0 flex-1 gap-0.5"
        style={{
          gridTemplateColumns: `${single ? "" : "minmax(0, auto) "}repeat(${categories.length}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${series.length}, minmax(0, 1fr)) auto`,
        }}
        onPointerLeave={() => setHovered(null)}
      >
        {series.map((item, row) => (
          <div key={item.key} className="contents">
            {single ? null : (
              <span title={item.label} className="flex max-w-28 items-center truncate pr-2 text-xs text-muted-foreground">
                <span className="truncate">{item.label}</span>
              </span>
            )}
            {item.values.map((value, column) => {
              const step = stepOf(value ?? 0, max)
              return (
                <span
                  key={categories[column].id}
                  onPointerEnter={() => setHovered({ row, column })}
                  className={cn(
                    "min-h-3 rounded-[3px]",
                    hovered?.row === row && hovered.column === column && "ring-2 ring-foreground/40"
                  )}
                  style={{ backgroundColor: step ? `var(--viz-heat-${step})` : "var(--viz-track)" }}
                />
              )
            })}
          </div>
        ))}
        {single ? null : <span />}
        {ticks.map(({ key, span, tick }) => (
          <span key={key} className="truncate pt-1 text-[11px] text-muted-foreground" style={{ gridColumn: `span ${span}` }}>
            {tick}
          </span>
        ))}
      </div>

      <div className="flex h-4 shrink-0 items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">
          {readout ? (
            <>
              <span className="font-medium text-foreground tabular-nums">{readout.value}</span>
              {` · ${single ? readout.category : `${readout.series} · ${readout.category}`}`}
            </>
          ) : null}
        </span>
        <span aria-hidden className="flex shrink-0 items-center gap-1">
          {t("customDashboards.chart.less")}
          {Array.from({ length: STEPS }, (_, index) => (
            <span key={index} className="size-2.5 rounded-[2px]" style={{ backgroundColor: `var(--viz-heat-${index + 1})` }} />
          ))}
          {t("customDashboards.chart.more")}
        </span>
      </div>
    </div>
  )
})
