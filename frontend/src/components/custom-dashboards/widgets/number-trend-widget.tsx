import { useId, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { useLanguage } from "@/lib/i18n"
import type { ChartModel } from "@/lib/custom-dashboards/chart-model"
import { formatCompactValue, formatValue } from "@/lib/custom-dashboards/format"
import type { VisualConfig } from "@/lib/custom-dashboards/types"
import { resolveColor } from "@/lib/custom-dashboards/palette"

import { matchRule } from "@/lib/custom-dashboards/rules"

import { DeltaLine, RuleBadge } from "./figure-parts"

type NumberTrendWidgetProps = {
  value: number | null
  previous?: number | null
  model: ChartModel | null
  config: VisualConfig
}

const WIDTH = 240
const HEIGHT = 64
const PADDING = 4

/** O número do período, com a variação e a linha do que aconteceu dentro dele. */
export function NumberTrendWidget({ value, previous, model, config }: NumberTrendWidgetProps) {
  const language = useLanguage()
  const series = model?.series[0]
  const points = useMemo(
    () => (series ? series.values.map((point, index) => ({ value: point ?? 0, category: model?.categories[index] })) : []),
    [model?.categories, series]
  )

  return (
    <div className="flex h-full min-h-0 flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p
            title={formatValue(value, config, language)}
            className="font-heading leading-tight font-semibold tracking-tight whitespace-nowrap"
            style={{ fontSize: config.fontSize ?? 26 }}
          >
            {formatCompactValue(value, config, language)}
          </p>
          <RuleBadge rule={matchRule(config.conditionalRules, value)} />
        </div>
        <DeltaLine current={value} previous={previous} config={config} />
      </div>
      {points.length > 1 ? <TrendLine points={points} config={config} /> : null}
    </div>
  )
}

type TrendPoint = { value: number; category?: { title: string } }

/** Só a forma da série: sem eixo, porque a leitura exata é do número ao lado e da tabela do card. */
function TrendLine({ points, config }: { points: TrendPoint[]; config: VisualConfig }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const fillId = useId()
  const [hovered, setHovered] = useState<number | null>(null)
  const color = resolveColor(config.color, "var(--viz-accent)")

  const coordinates = useMemo(() => {
    const values = points.map((point) => point.value)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const range = max - min || 1
    const step = (WIDTH - PADDING * 2) / (points.length - 1)
    return points.map((point, index) => ({
      x: PADDING + index * step,
      y: HEIGHT - PADDING - ((point.value - min) / range) * (HEIGHT - PADDING * 2),
    }))
  }, [points])

  const line = coordinates.map(({ x, y }) => `${x},${y}`).join(" ")
  const area = `${PADDING},${HEIGHT} ${line} ${WIDTH - PADDING},${HEIGHT}`
  const active = coordinates[hovered ?? coordinates.length - 1]
  const activePoint = hovered !== null ? points[hovered] : null

  return (
    <div className="relative h-12 min-w-24 flex-1">
      <svg
        role="img"
        aria-label={t("customDashboards.figure.trend", {
          first: formatValue(points[0].value, config, language),
          last: formatValue(points[points.length - 1].value, config, language),
        })}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        className="size-full touch-none overflow-visible"
        onPointerMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect()
          const ratio = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width))
          setHovered(Math.round(ratio * (points.length - 1)))
        }}
        onPointerLeave={() => setHovered(null)}
      >
        <polygon id={fillId} points={area} fill={color} fillOpacity={0.1} />
        <polyline
          points={line}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span
        aria-hidden
        className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card"
        style={{ left: `${(active.x / WIDTH) * 100}%`, top: `${(active.y / HEIGHT) * 100}%`, backgroundColor: color }}
      />
      {activePoint ? (
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-full z-10 mb-1 -translate-x-1/2 rounded-md bg-foreground px-1.5 py-0.5 text-xs whitespace-nowrap text-background tabular-nums"
          style={{ left: `${(active.x / WIDTH) * 100}%` }}
        >
          {formatValue(activePoint.value, config, language)}
          {activePoint.category ? ` · ${activePoint.category.title}` : ""}
        </span>
      ) : null}
    </div>
  )
}
