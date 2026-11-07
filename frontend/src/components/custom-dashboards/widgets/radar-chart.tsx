import { memo, useMemo } from "react"
import { useReducedMotion } from "motion/react"
import { PolarAngleAxis, PolarGrid, Radar, RadarChart } from "recharts"

import { ChartLegend } from "@/components/dashboard/chart-card"
import { TooltipShell } from "@/components/dashboard/charts"
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart"
import { useLanguage } from "@/lib/i18n"
import type { ChartModel } from "@/lib/custom-dashboards/chart-model"
import { formatValue } from "@/lib/custom-dashboards/format"
import type { VisualConfig } from "@/lib/custom-dashboards/types"

type RadarWidgetProps = {
  model: ChartModel
  config: VisualConfig
  animate: boolean
}

type RadarRow = { id: string; tick: string; title: string } & Record<string, unknown>

/** Vários aspectos de uma coisa, num desenho só. Precisa de três eixos ou mais: abaixo disso não forma figura. */
export const RadarWidget = memo(function RadarWidget({ model, config, animate }: RadarWidgetProps) {
  const language = useLanguage()
  const reduced = useReducedMotion()
  const { categories, series } = model

  const rows = useMemo<RadarRow[]>(
    () =>
      categories.map((category, index) => {
        const row: RadarRow = { id: category.id, tick: category.tick, title: category.title }
        series.forEach((item, seriesIndex) => {
          row[`s${seriesIndex}`] = item.values[index] ?? 0
        })
        return row
      }),
    [categories, series]
  )

  const chartConfig = useMemo<ChartConfig>(
    () => Object.fromEntries(series.map((item, index) => [`s${index}`, { label: item.label, color: item.color }])),
    [series]
  )

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {config.showLegend !== false && series.length > 1 ? (
        <ChartLegend
          className="shrink-0"
          items={series.map((item) => ({ key: item.key, label: item.label, color: item.color, mark: "line" as const }))}
        />
      ) : null}
      <div className="min-h-0 flex-1">
        <ChartContainer config={chartConfig} className="aspect-auto size-full [&_g]:outline-hidden">
          <RadarChart data={rows} outerRadius="72%">
            <PolarGrid stroke="var(--border)" />
            <PolarAngleAxis dataKey="tick" tick={{ fontSize: 11 }} />
            <ChartTooltip
              isAnimationActive={false}
              content={(props) => {
                const row = props.payload?.[0]?.payload as RadarRow | undefined
                if (!props.active || !row) return null
                return (
                  <TooltipShell
                    title={row.title}
                    rows={series.map((item, index) => ({
                      key: item.key,
                      label: item.label,
                      color: item.color,
                      value: formatValue(row[`s${index}`] as number, config, language),
                    }))}
                  />
                )
              }}
            />
            {series.map((item, index) => (
              <Radar
                key={item.key}
                dataKey={`s${index}`}
                name={item.label}
                stroke={item.color}
                strokeWidth={2}
                fill={item.color}
                fillOpacity={config.opacity ?? 0.1}
                dot={{ r: 3, fill: item.color, fillOpacity: 1 }}
                isAnimationActive={animate && !reduced}
                animationDuration={250}
              />
            ))}
          </RadarChart>
        </ChartContainer>
      </div>
    </div>
  )
})
