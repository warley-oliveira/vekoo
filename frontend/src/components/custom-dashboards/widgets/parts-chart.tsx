import { memo, useMemo } from "react"
import { useReducedMotion } from "motion/react"
import { Cell, Pie, PieChart } from "recharts"

import { TooltipShell } from "@/components/dashboard/charts"
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart"
import { formatPercent } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import type { Part } from "@/lib/custom-dashboards/chart-model"
import { formatCompactValue, formatValue } from "@/lib/custom-dashboards/format"
import type { VisualConfig } from "@/lib/custom-dashboards/types"

type PartsChartProps = {
  parts: Part[]
  donut: boolean
  config: VisualConfig
  animate: boolean
}

/**
 * Pizza e rosca, porque a pessoa pode preferir assim, com o que dá para fazer para serem bem lidas: no máximo seis partes,
 * 2 px de folga entre elas, e a legenda sempre com o valor e a parte. O editor sugere barras quando a comparação fica difícil.
 */
export const PartsChart = memo(function PartsChart({ parts, donut, config, animate }: PartsChartProps) {
  const language = useLanguage()
  const reduced = useReducedMotion()
  const total = parts.reduce((sum, part) => sum + part.value, 0)

  const chartConfig = useMemo<ChartConfig>(
    () => Object.fromEntries(parts.map((part) => [part.key, { label: part.label, color: part.color }])),
    [parts]
  )

  return (
    <div className="@container h-full min-h-0">
      <div className="flex h-full min-h-0 flex-col gap-3 @sm:flex-row @sm:items-center">
        <div className="relative min-h-24 flex-1 @sm:h-full">
          <ChartContainer config={chartConfig} className="aspect-auto size-full [&_g]:outline-hidden">
            <PieChart>
              <Pie
                data={parts}
                dataKey="value"
                nameKey="label"
                innerRadius={donut ? "64%" : 0}
                outerRadius="95%"
                stroke="var(--card)"
                strokeWidth={2}
                isAnimationActive={animate && !reduced}
                animationDuration={250}
              >
                {parts.map((part) => (
                  <Cell key={part.key} fill={part.color} />
                ))}
              </Pie>
              <ChartTooltip
                isAnimationActive={false}
                content={(props) => {
                  const part = props.payload?.[0]?.payload as Part | undefined
                  if (!props.active || !part) return null
                  return (
                    <TooltipShell
                      title={part.label}
                      rows={[
                        {
                          key: part.key,
                          label: formatPercent(part.share, language),
                          color: part.color,
                          value: formatValue(part.value, config, language),
                        },
                      ]}
                    />
                  )
                }}
              />
            </PieChart>
          </ChartContainer>
          {donut ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span
                title={formatValue(total, config, language)}
                className="font-heading text-lg leading-none font-semibold tracking-tight"
              >
                {formatCompactValue(total, config, language)}
              </span>
            </div>
          ) : null}
        </div>

        {config.showLegend !== false ? (
          <ul className="flex max-h-full shrink-0 flex-col gap-1.5 overflow-y-auto text-xs @sm:w-1/2">
            {parts.map((part) => (
              <li key={part.key} className="flex min-w-0 items-center gap-2">
                <span aria-hidden className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: part.color }} />
                <span title={part.label} className="min-w-0 flex-1 truncate text-muted-foreground">
                  {part.label}
                </span>
                <span className="font-medium tabular-nums">{formatCompactValue(part.value, config, language)}</span>
                <span className="w-10 shrink-0 text-right text-muted-foreground tabular-nums">
                  {formatPercent(part.share, language)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
})
