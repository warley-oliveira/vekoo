import { memo, useMemo } from "react"

import { formatPercent } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import type { ChartModel } from "@/lib/custom-dashboards/chart-model"
import { formatValue } from "@/lib/custom-dashboards/format"
import { resolveColor } from "@/lib/custom-dashboards/palette"
import type { VisualConfig } from "@/lib/custom-dashboards/types"

type FunnelWidgetProps = {
  model: ChartModel
  config: VisualConfig
}

const STEPS = 6

/** Etapas em ordem: um matiz só, do claro ao escuro, porque a ordem é o que importa. Do maior para o menor, como na origem. */
export const FunnelWidget = memo(function FunnelWidget({ model, config }: FunnelWidgetProps) {
  const language = useLanguage()
  const series = model.series[0]

  const items = useMemo(() => {
    if (!series) return []
    const list = model.categories
      .map((category, index) => ({ category, value: series.values[index] ?? 0 }))
      .sort((left, right) => right.value - left.value)
    const top = list[0]?.value ?? 0
    return list.map((item, index) => ({
      ...item,
      ratio: top > 0 ? item.value / top : 0,
      step: Math.min(STEPS, Math.round((index / Math.max(1, list.length - 1)) * (STEPS - 1)) + 1),
    }))
  }, [model.categories, series])

  return (
    // `center-safe`: com mais etapas do que cabem, o centro normal cortaria o topo, sem rolagem que chegue até ele.
    <ol className="flex h-full min-h-0 flex-col justify-center-safe gap-2.5 overflow-y-auto pr-1 [scrollbar-width:thin]">
      {items.map(({ category, value, ratio, step }) => {
        const custom = config.valueMap?.[category.id]?.color
        return (
          <li key={category.id} className="flex flex-col gap-1">
            <div className="flex items-baseline gap-2 text-sm">
              <span title={category.title} className="min-w-0 flex-1 truncate">
                {category.title}
              </span>
              <span className="font-medium tabular-nums">{formatValue(value, config, language)}</span>
              <span className="w-12 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                {formatPercent(ratio, language)}
              </span>
            </div>
            <div
              aria-hidden
              className="h-2 rounded-r-full"
              style={{
                width: `${Math.max(ratio * 100, value > 0 ? 1.5 : 0)}%`,
                backgroundColor: custom ? resolveColor(custom) : `var(--viz-step-${step})`,
              }}
            />
          </li>
        )
      })}
    </ol>
  )
})
