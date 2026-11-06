import { useMemo, type ReactNode } from "react"
import { useReducedMotion } from "motion/react"
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts"

import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart"
import { formatCompactNumber, formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"

// Os gráficos do Dashboard, sobre a primitiva `chart`. As especificações são as da skill dataviz: marca
// fina, ponta arredondada e base reta, 2 px de folga na cor da superfície entre as peças, grade em fio
// sólido, e uma dica só por ponto, com valor na frente. Toque funciona: o Recharts trata o toque como
// o ponteiro, e a tabela do `ChartCard` garante que nenhum valor dependa da dica.

const GAP = 2
const RADIUS = 4
const MAX_BAR = 24

const AXIS_TICK = { fontSize: 11 }
const GRID_STROKE = "var(--border)"

export type TooltipRow = { key: string; label: string; value: string; color?: string }

type TooltipShellProps = {
  title: ReactNode
  rows: TooltipRow[]
  footer?: ReactNode
}

/** A dica: valor em destaque e nome em segundo plano, com um traço da cor da série. */
export function TooltipShell({ title, rows, footer }: TooltipShellProps) {
  return (
    <div className="grid min-w-32 gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <p className="font-medium">{title}</p>
      <ul className="grid gap-1">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center gap-2">
            {row.color ? (
              <span
                aria-hidden
                className="h-0.5 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: row.color }}
              />
            ) : null}
            <span className="font-medium text-foreground tabular-nums">{row.value}</span>
            <span className="text-muted-foreground">{row.label}</span>
          </li>
        ))}
      </ul>
      {footer ? <div className="border-t pt-1 text-muted-foreground">{footer}</div> : null}
    </div>
  )
}

function useAxisFormatter() {
  const language = useLanguage()
  return useMemo(
    () => (value: number) =>
      Math.abs(value) >= 10_000 ? formatCompactNumber(value, language) : formatNumber(value, language),
    [language]
  )
}

function chartConfig(series: { key: string; label: string; color: string }[]): ChartConfig {
  return Object.fromEntries(
    series.map((entry) => [entry.key, { label: entry.label, color: entry.color }])
  )
}

/* ---------- colunas empilhadas ---------- */

export type ColumnSeries = { key: string; label: string; color: string }
export type ColumnPoint = { id: string; tick: string; title: string } & Record<string, string | number>

type SegmentShapeProps = {
  x?: number
  y?: number
  width?: number
  height?: number
  fill?: string
}

/** Segmento da pilha: base reta, ponta arredondada só no topo, e a folga é da peça de baixo. */
function StackSegment({ x = 0, y = 0, width = 0, height = 0, fill, isTop }: SegmentShapeProps & { isTop: boolean }) {
  if (height <= 0 || width <= 0) return null
  const gap = isTop || height <= GAP + 1 ? 0 : GAP
  const top = y + gap
  const size = height - gap
  const radius = isTop ? Math.min(RADIUS, width / 2, size) : 0
  const path = radius
    ? `M${x},${top + size}V${top + radius}Q${x},${top} ${x + radius},${top}H${x + width - radius}Q${x + width},${top} ${x + width},${top + radius}V${top + size}Z`
    : `M${x},${top + size}V${top}H${x + width}V${top + size}Z`
  return <path d={path} fill={fill} />
}

type StackedColumnsProps = {
  data: ColumnPoint[]
  /** De baixo para cima. A cor segue a série, nunca a posição. */
  series: ColumnSeries[]
  height?: number
  /** Linha final da dica: o total do ponto. */
  totalLabel?: (total: string) => string
}

export function StackedColumns({ data, series, height = 240, totalLabel }: StackedColumnsProps) {
  const language = useLanguage()
  const reduced = useReducedMotion()
  const formatAxis = useAxisFormatter()
  const config = useMemo(() => chartConfig(series), [series])

  /** A peça de cima muda de ponto a ponto: num dia sem campanha, o topo é outra série. */
  const topOf = (point: ColumnPoint) => {
    for (let index = series.length - 1; index >= 0; index -= 1) {
      if (Number(point[series[index].key]) > 0) return series[index].key
    }
    return null
  }

  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke={GRID_STROKE} />
        <XAxis
          dataKey="tick"
          tickLine={false}
          axisLine={{ stroke: GRID_STROKE }}
          tick={AXIS_TICK}
          tickMargin={6}
          interval="preserveStartEnd"
          minTickGap={20}
        />
        <YAxis
          width="auto"
          tickLine={false}
          axisLine={false}
          tick={AXIS_TICK}
          tickCount={4}
          allowDecimals={false}
          tickFormatter={formatAxis}
        />
        <ChartTooltip
          cursor={{ fill: "var(--muted)" }}
          isAnimationActive={false}
          content={(props) => {
            const point = props.payload?.[0]?.payload as ColumnPoint | undefined
            if (!props.active || !point) return null
            const total = series.reduce((sum, entry) => sum + Number(point[entry.key] ?? 0), 0)
            return (
              <TooltipShell
                title={point.title}
                rows={[...series].reverse().map((entry) => ({
                  key: entry.key,
                  label: entry.label,
                  color: entry.color,
                  value: formatNumber(Number(point[entry.key] ?? 0), language),
                }))}
                footer={totalLabel ? totalLabel(formatNumber(total, language)) : undefined}
              />
            )
          }}
        />
        {series.map((entry) => (
          <Bar
            key={entry.key}
            dataKey={entry.key}
            stackId="stack"
            fill={entry.color}
            maxBarSize={MAX_BAR}
            isAnimationActive={!reduced}
            animationDuration={250}
            shape={(props: unknown) => {
              const shape = props as SegmentShapeProps & { payload: ColumnPoint }
              return <StackSegment {...shape} isTop={topOf(shape.payload) === entry.key} />
            }}
          />
        ))}
      </BarChart>
    </ChartContainer>
  )
}

/* ---------- colunas com um destaque ---------- */

export type HighlightPoint = { id: string; tick: string; title: string; value: number }

type HighlightColumnsProps = {
  data: HighlightPoint[]
  /** A coluna em destaque: o pico. As outras ficam em contexto. */
  highlightId?: string | null
  unitLabel: (value: number) => string
  height?: number
}

export function HighlightColumns({ data, highlightId, unitLabel, height = 180 }: HighlightColumnsProps) {
  const language = useLanguage()
  const reduced = useReducedMotion()
  const formatAxis = useAxisFormatter()
  const config = useMemo<ChartConfig>(() => ({ value: { color: "var(--viz-context)" } }), [])

  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      <BarChart data={data} margin={{ top: 18, right: 4, bottom: 0, left: 0 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke={GRID_STROKE} />
        <XAxis
          dataKey="tick"
          tickLine={false}
          axisLine={{ stroke: GRID_STROKE }}
          tick={AXIS_TICK}
          tickMargin={6}
          interval="preserveStartEnd"
          minTickGap={12}
        />
        <YAxis
          width="auto"
          tickLine={false}
          axisLine={false}
          tick={AXIS_TICK}
          tickCount={3}
          allowDecimals={false}
          tickFormatter={formatAxis}
        />
        <ChartTooltip
          cursor={{ fill: "var(--muted)" }}
          isAnimationActive={false}
          content={(props) => {
            const point = props.payload?.[0]?.payload as HighlightPoint | undefined
            if (!props.active || !point) return null
            return (
              <TooltipShell
                title={point.title}
                rows={[{ key: "value", label: unitLabel(point.value), value: formatNumber(point.value, language) }]}
              />
            )
          }}
        />
        <Bar
          dataKey="value"
          maxBarSize={MAX_BAR}
          isAnimationActive={!reduced}
          animationDuration={250}
          shape={(props: unknown) => {
            const { x = 0, y = 0, width = 0, height: size = 0, payload } = props as SegmentShapeProps & {
              payload: HighlightPoint
            }
            if (size <= 0) return <g />
            const highlighted = payload.id === highlightId
            const radius = Math.min(RADIUS, width / 2, size)
            return (
              <g>
                <path
                  d={`M${x},${y + size}V${y + radius}Q${x},${y} ${x + radius},${y}H${x + width - radius}Q${x + width},${y} ${x + width},${y + radius}V${y + size}Z`}
                  fill={highlighted ? "var(--viz-accent)" : "var(--viz-context)"}
                />
                {highlighted ? (
                  <text
                    x={x + width / 2}
                    y={y - 6}
                    textAnchor="middle"
                    className="fill-foreground text-[11px] font-medium"
                  >
                    {formatNumber(payload.value, language)}
                  </text>
                ) : null}
              </g>
            )
          }}
        />
      </BarChart>
    </ChartContainer>
  )
}

/* ---------- tendência ---------- */

export type TrendPoint = {
  id: string
  tick: string
  title: string
  current: number
  /** O mesmo ponto no período anterior, quando ele existe. */
  previous: number | null
  previousTitle: string | null
}

type TrendChartProps = {
  data: TrendPoint[]
  currentLabel: string
  previousLabel: string
  height?: number
}

/**
 * Ênfase, e não paleta: a série do período em violeta, e o período anterior em cinza, como contexto.
 * Um eixo só: as duas são a mesma medida.
 */
export function TrendChart({ data, currentLabel, previousLabel, height = 240 }: TrendChartProps) {
  const language = useLanguage()
  const reduced = useReducedMotion()
  const formatAxis = useAxisFormatter()
  const hasPrevious = data.some((point) => point.previous !== null)
  const single = data.length === 1
  const config = useMemo<ChartConfig>(
    () => ({
      current: { label: currentLabel, color: "var(--viz-accent)" },
      previous: { label: previousLabel, color: "var(--viz-context)" },
    }),
    [currentLabel, previousLabel]
  )

  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID_STROKE} />
        <XAxis
          dataKey="tick"
          tickLine={false}
          axisLine={{ stroke: GRID_STROKE }}
          tick={AXIS_TICK}
          tickMargin={6}
          interval="preserveStartEnd"
          minTickGap={24}
        />
        <YAxis
          width="auto"
          tickLine={false}
          axisLine={false}
          tick={AXIS_TICK}
          tickCount={4}
          allowDecimals={false}
          domain={[0, "auto"]}
          tickFormatter={formatAxis}
        />
        <ChartTooltip
          cursor={{ stroke: "var(--viz-context)", strokeWidth: 1 }}
          isAnimationActive={false}
          content={(props) => {
            const point = props.payload?.[0]?.payload as TrendPoint | undefined
            if (!props.active || !point) return null
            const rows: TooltipRow[] = [
              {
                key: "current",
                label: point.title,
                color: "var(--viz-accent)",
                value: formatNumber(point.current, language),
              },
            ]
            if (point.previous !== null) {
              rows.push({
                key: "previous",
                label: point.previousTitle ?? previousLabel,
                color: "var(--viz-context)",
                value: formatNumber(point.previous, language),
              })
            }
            return <TooltipShell title={currentLabel} rows={rows} />
          }}
        />
        {hasPrevious ? (
          <Line
            dataKey="previous"
            type="monotone"
            stroke="var(--viz-context)"
            strokeWidth={2}
            dot={false}
            activeDot={false}
            connectNulls
            isAnimationActive={!reduced}
            animationDuration={250}
          />
        ) : null}
        <Area
          dataKey="current"
          type="monotone"
          stroke="var(--viz-accent)"
          strokeWidth={2}
          fill="var(--viz-accent)"
          fillOpacity={0.08}
          dot={single ? { r: 4, fill: "var(--viz-accent)", stroke: "var(--card)", strokeWidth: 2 } : false}
          activeDot={{ r: 4, fill: "var(--viz-accent)", stroke: "var(--card)", strokeWidth: 2 }}
          isAnimationActive={!reduced}
          animationDuration={250}
        />
      </ComposedChart>
    </ChartContainer>
  )
}
