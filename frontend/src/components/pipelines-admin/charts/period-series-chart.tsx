import { useMemo } from "react"
import { useReducedMotion } from "motion/react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { formatCompactNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { CHART_COLORS } from "./chart-tokens"

const HEIGHT = 208

export type SeriesPoint = {
  /** "2026-11-06" */
  date: string
  value: number
}

function parseLocalDate(date: string) {
  const [year, month, day] = date.split("-").map(Number)
  return new Date(year, month - 1, day)
}

type TooltipProps = {
  active?: boolean
  payload?: { payload: SeriesPoint }[]
  name: string
  formatValue: (value: number) => string
  formatDate: (date: string) => string
}

function SeriesTooltip({ active, payload, name, formatValue, formatDate }: TooltipProps) {
  const point = payload?.[0]?.payload
  if (!active || !point) return null

  return (
    <div className="rounded-lg bg-popover px-3 py-2 text-xs shadow-md ring-1 ring-foreground/10">
      <p className="mb-1 text-muted-foreground">{formatDate(point.date)}</p>
      <p className="flex items-center gap-2">
        <span aria-hidden className="h-0.5 w-3 rounded-full bg-primary" />
        <span className="font-medium tabular-nums">{formatValue(point.value)}</span>
        <span className="text-muted-foreground">{name}</span>
      </p>
    </div>
  )
}

/** Um indicador ao longo do período. Uma série, um eixo e uma cor: o título já diz o que é. */
export default function PeriodSeriesChart({
  points,
  name,
  bucket,
  formatValue,
}: {
  points: SeriesPoint[]
  name: string
  bucket: "day" | "week" | "month"
  formatValue: (value: number) => string
}) {
  const language = useLanguage()
  const reduced = useReducedMotion()

  const { tickFormat, tooltipFormat } = useMemo(() => {
    const short = new Intl.DateTimeFormat(
      language,
      bucket === "month" ? { month: "short", year: "2-digit" } : { day: "numeric", month: "short" }
    )
    const long = new Intl.DateTimeFormat(
      language,
      bucket === "month" ? { month: "long", year: "numeric" } : { dateStyle: "long" }
    )
    return {
      tickFormat: (date: string) => short.format(parseLocalDate(date)),
      tooltipFormat: (date: string) => long.format(parseLocalDate(date)),
    }
  }, [bucket, language])

  const lastIndex = points.length - 1

  return (
    <div style={{ height: HEIGHT }} className="w-full">
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 200 }}>
        <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
          <XAxis
            dataKey="date"
            axisLine={{ stroke: CHART_COLORS.grid }}
            tickLine={false}
            minTickGap={32}
            tick={{ fontSize: 12, fill: CHART_COLORS.axis }}
            tickFormatter={tickFormat}
          />
          <YAxis
            width={40}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
            tick={{ fontSize: 12, fill: CHART_COLORS.axis }}
            tickFormatter={(value: number) => formatCompactNumber(value, language)}
          />
          <Tooltip
            cursor={{ stroke: CHART_COLORS.axis, strokeWidth: 1 }}
            content={<SeriesTooltip name={name} formatValue={formatValue} formatDate={tooltipFormat} />}
          />
          <Area
            type="linear"
            dataKey="value"
            stroke={CHART_COLORS.accent}
            strokeWidth={2}
            fill={CHART_COLORS.accent}
            fillOpacity={0.1}
            isAnimationActive={!reduced}
            animationDuration={250}
            dot={(props) =>
              props.index === lastIndex ? (
                <circle
                  key={props.index}
                  cx={props.cx}
                  cy={props.cy}
                  r={4}
                  fill={CHART_COLORS.accent}
                  stroke={CHART_COLORS.surface}
                  strokeWidth={2}
                />
              ) : (
                <g key={props.index} />
              )
            }
            activeDot={{ r: 4, fill: CHART_COLORS.accent, stroke: CHART_COLORS.surface, strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
