import { useMemo } from "react"
import { useReducedMotion } from "motion/react"
import { useTranslation } from "react-i18next"
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { formatCompactNumber, formatCurrency } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { formatMonth, formatMonthTitle } from "@/lib/pipelines-admin/format"
import type { GoalHistoryPoint } from "@/lib/pipelines-admin/types"
import { CHART_COLORS } from "./chart-tokens"

const HEIGHT = 224
const TICK_HALF_WIDTH = 13

type ChartPoint = GoalHistoryPoint & { label: string; target: number | null }

/** O risco da meta: uma marca sobre a coluna, que a pessoa lê como "chegou ou não chegou". */
function TargetTick({ cx, cy }: { cx?: number; cy?: number }) {
  if (cx === undefined || cy === undefined || cy === null) return null
  return (
    <line
      x1={cx - TICK_HALF_WIDTH}
      x2={cx + TICK_HALF_WIDTH}
      y1={cy}
      y2={cy}
      stroke={CHART_COLORS.target}
      strokeWidth={2}
      strokeLinecap="round"
    />
  )
}

type TooltipProps = {
  active?: boolean
  payload?: { payload: ChartPoint }[]
}

function GoalTooltip({ active, payload }: TooltipProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const point = payload?.[0]?.payload
  if (!active || !point) return null

  const money = (value: number) => formatCurrency(value, language, { maximumFractionDigits: 0 })
  const ratio = point.target ? point.actualValue / point.target : null

  return (
    <div className="rounded-lg bg-popover px-3 py-2 text-xs shadow-md ring-1 ring-foreground/10">
      <p className="mb-1 text-muted-foreground">{formatMonthTitle(point.month, language)}</p>
      <p className="flex items-center gap-2">
        <span aria-hidden className="h-0.5 w-3 rounded-full bg-primary" />
        <span className="font-medium tabular-nums">{money(point.actualValue)}</span>
        <span className="text-muted-foreground">{t("pipelinesAdmin.charts.realized")}</span>
      </p>
      <p className="flex items-center gap-2">
        <span aria-hidden className="h-0.5 w-3 rounded-full bg-foreground" />
        <span className="font-medium tabular-nums">{point.target ? money(point.target) : "—"}</span>
        <span className="text-muted-foreground">{t("pipelinesAdmin.charts.target")}</span>
      </p>
      {ratio !== null ? (
        <p className="mt-1 text-muted-foreground">
          {t("pipelinesAdmin.charts.ofTarget", { percent: Math.round(ratio * 100) })}
        </p>
      ) : null}
    </div>
  )
}

/**
 * Receita ganha por mês contra a meta. Um eixo só, porque as duas estão em reais. Quase sem cor: o mês
 * em destaque vai em violeta, os outros em cinza, e a meta é um risco, que dispensa uma segunda cor.
 */
export default function RevenueGoalChart({
  history,
  highlightMonth,
}: {
  history: GoalHistoryPoint[]
  highlightMonth: string
}) {
  const language = useLanguage()
  const reduced = useReducedMotion()

  const data = useMemo<ChartPoint[]>(
    () =>
      history.map((point) => ({
        ...point,
        label: formatMonth(point.month, language, { month: "short" }),
        // Mês sem meta não desenha risco no zero.
        target: point.targetValue > 0 ? point.targetValue : null,
      })),
    [history, language]
  )

  return (
    <div style={{ height: HEIGHT }} className="w-full">
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 200 }}>
        <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="30%">
          <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
          <XAxis
            dataKey="label"
            axisLine={{ stroke: CHART_COLORS.grid }}
            tickLine={false}
            tick={{ fontSize: 12, fill: CHART_COLORS.axis }}
          />
          <YAxis
            width={48}
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12, fill: CHART_COLORS.axis }}
            tickFormatter={(value: number) => formatCompactNumber(value, language)}
          />
          <Tooltip cursor={{ fill: "var(--muted)", fillOpacity: 0.6 }} content={<GoalTooltip />} />
          <Bar
            dataKey="actualValue"
            maxBarSize={24}
            radius={[4, 4, 0, 0]}
            isAnimationActive={!reduced}
            animationDuration={250}
          >
            {data.map((point) => (
              <Cell
                key={point.month}
                fill={point.month === highlightMonth ? CHART_COLORS.accent : CHART_COLORS.context}
              />
            ))}
          </Bar>
          <Line
            dataKey="target"
            stroke="transparent"
            connectNulls={false}
            isAnimationActive={false}
            activeDot={false}
            dot={(props) => (
              <TargetTick key={props.index} cx={props.cx} cy={props.value === null ? undefined : props.cy} />
            )}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
