import { memo, useMemo, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { useReducedMotion } from "motion/react"
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts"

import { RankedBars } from "@/components/dashboard/bars"
import { ChartLegend } from "@/components/dashboard/chart-card"
import { TooltipShell } from "@/components/dashboard/charts"
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart"
import { useSteppedWidth } from "@/hooks/custom-dashboards/use-stepped-width"
import { formatPercent } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import type { ChartModel } from "@/lib/custom-dashboards/chart-model"
import { formatCompactValue, formatValue } from "@/lib/custom-dashboards/format"
import { resolveColor } from "@/lib/custom-dashboards/palette"
import type { VisualConfig, WidgetType } from "@/lib/custom-dashboards/types"

// Linha, barra e área, sobre o `ComposedChart`. As medidas são as da skill dataviz e as mesmas do Dashboard: barra de no
// máximo 24 px, ponta arredondada e base reta, 2 px de folga na cor da superfície entre as peças, linha de 2 px, grade em
// fio sólido. Um eixo só, sempre. Quem não enxerga cor ou quer o número exato tem a tabela do card.

const GAP = 2
const RADIUS = 4
const MAX_BAR = 24
const GRID_STROKE = "var(--border)"
const AXIS_TICK = { fontSize: 11 }
const CHART_CLASS =
  "aspect-auto size-full rounded-md [&_g]:outline-hidden has-[.recharts-surface:focus-visible]:ring-3 has-[.recharts-surface:focus-visible]:ring-ring/50"

/** Até aqui cabe um número em cada barra. Passou disso, só o maior: um número em cada ponto ninguém lê. */
const MAX_LABELLED_BARS = 16

/** O que o eixo e as margens tomam da largura do card. Não precisa ser exato: só decide a folga das barras. */
const AXIS_WIDTH = 36
const CROWDED_BELOW = 10
/** Largura média de uma letra no eixo, em 11 px, e o mínimo de letras para um rótulo ainda dizer alguma coisa. */
const TICK_CHAR_WIDTH = 6.4
const MIN_TICK_CHARS = 4

/**
 * A folga das barras. O Recharts trunca a largura de cada barra para inteiro: com 90 dias no celular, os 22% de folga e os
 * 2 px entre barras deixariam um fio de 1 px. Com pouco lugar, a folga encolhe e o que sobra vai para a barra.
 */
function barSpacing(width: number, slots: number, marksPerSlot: number) {
  const slot = width > AXIS_WIDTH && slots > 0 ? (width - AXIS_WIDTH) / slots : Number.POSITIVE_INFINITY
  const perMark = slot / marksPerSlot
  if (perMark >= CROWDED_BELOW) return { barCategoryGap: "22%", barGap: GAP }
  return { barCategoryGap: slot < 2 ? 0 : slot < 8 ? 0.5 : 1, barGap: perMark < 3 ? 0 : 1 }
}

function ellipsize(text: string, chars: number) {
  return text.length > chars ? `${text.slice(0, chars - 1)}…` : text
}

type ChartRow = { id: string; tick: string; title: string } & Record<string, unknown>

type ShapeProps = {
  x?: number
  y?: number
  width?: number
  height?: number
  fill?: string
  payload?: ChartRow
}

/** Base reta e ponta arredondada, na direção do valor. A folga de 2 px fica por conta da peça de baixo. */
function barPath(x: number, y: number, width: number, height: number, radius: number, horizontal: boolean) {
  if (radius <= 0) return `M${x},${y}H${x + width}V${y + height}H${x}Z`
  if (horizontal) {
    return `M${x},${y}H${x + width - radius}Q${x + width},${y} ${x + width},${y + radius}V${y + height - radius}Q${x + width},${y + height} ${x + width - radius},${y + height}H${x}Z`
  }
  return `M${x},${y + height}V${y + radius}Q${x},${y} ${x + radius},${y}H${x + width - radius}Q${x + width},${y} ${x + width},${y + radius}V${y + height}Z`
}

function BarMark({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  fill,
  horizontal,
  isEnd,
  gap,
}: ShapeProps & { horizontal: boolean; isEnd: boolean; gap: boolean }) {
  // Valor negativo vem com altura negativa, e uma fórmula pode dar isso.
  const left = width < 0 ? x + width : x
  const top = height < 0 ? y + height : y
  const w = Math.abs(width)
  const h = Math.abs(height)
  if (w <= 0 || h <= 0) return null

  const size = horizontal ? w : h
  const trim = gap && !isEnd && size > GAP + 1 ? GAP : 0
  const finalW = horizontal ? w - trim : w
  const finalH = horizontal ? h : h - trim
  const finalTop = horizontal ? top : top + trim
  const radius = isEnd ? Math.min(RADIUS, (horizontal ? h : w) / 2, horizontal ? finalW : finalH) : 0

  return <path d={barPath(left, finalTop, finalW, finalH, radius, horizontal)} fill={fill} />
}

type CartesianChartProps = {
  type: Extract<WidgetType, "line_chart" | "bar_chart" | "area_chart">
  model: ChartModel
  config: VisualConfig
  animate: boolean
  /** Barras em ordem de tamanho, com o nome ao lado: precisa de largura, e não no card pequeno. */
  allowRanked?: boolean
}

export const CartesianChart = memo(function CartesianChart({ type, model, config, animate, allowRanked = true }: CartesianChartProps) {
  const language = useLanguage()
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const animated = animate && !reduced

  const { categories, series } = model
  const showLegend = config.showLegend !== false && series.length > 1
  const horizontal = type === "bar_chart" && (config.horizontal ?? model.kind !== "time")
  const stacked = type !== "line_chart" && Boolean(config.stacked) && series.length > 1
  const valueMap = config.valueMap
  const perCategoryColor = series.length === 1 && categories.some((category) => valueMap?.[category.id]?.color)
  const thresholds = config.thresholds ?? []
  const allPositive = series.every((item) => item.values.every((value) => (value ?? 0) >= 0))
  const measured = useSteppedWidth(!horizontal && (type === "bar_chart" || model.kind !== "time"))
  // Data pula rótulo sem perder o sentido. Categoria não: "WhatsApp" e "Instagram" com duas barras sem nome no meio não
  // dizem de quem são. Cabendo pelo menos o começo do nome, todas aparecem, e o nome inteiro fica na dica e na tabela.
  const plotWidth = measured.width - AXIS_WIDTH
  const tickChars = plotWidth > 0 && categories.length ? Math.floor(plotWidth / categories.length / TICK_CHAR_WIDTH) : 0
  const labelEveryCategory = model.kind !== "time" && tickChars >= MIN_TICK_CHARS

  const rows = useMemo<ChartRow[]>(
    () =>
      categories.map((category, index) => {
        const row: ChartRow = { id: category.id, tick: category.tick, title: category.title }
        series.forEach((item, seriesIndex) => {
          row[`s${seriesIndex}`] = item.values[index]
        })
        return row
      }),
    [categories, series]
  )

  const chartConfig = useMemo<ChartConfig>(
    () => Object.fromEntries(series.map((item, index) => [`s${index}`, { label: item.label, color: item.color }])),
    [series]
  )

  /** A peça de cima muda de ponto a ponto: num dia sem campanha, o topo é outra série. */
  const endSeries = (row: ChartRow) => {
    for (let index = series.length - 1; index >= 0; index -= 1) {
      if (Number(row[`s${index}`] ?? 0) !== 0) return index
    }
    return -1
  }

  // O eixo só tem inteiros, e casa decimal nele é ruído: "R$ 5.500,00" ao lado de "R$ 17 mil", "105,0%".
  const formatAxis = (value: number) => formatCompactValue(value, { ...config, decimalPrecision: 0 }, language)

  const legend = showLegend ? (
    <ChartLegend
      className="shrink-0"
      items={series.map((item) => ({
        key: item.key,
        label: item.label,
        color: item.color,
        mark: type === "bar_chart" ? ("bar" as const) : ("line" as const),
        value: model.additive ? formatCompactValue(item.total, config, language) : undefined,
      }))}
    />
  ) : null

  // Uma série por categoria, deitada: o nome é longo e varia de tamanho. Em HTML, como no Dashboard, cada linha quebra bem.
  if (allowRanked && horizontal && series.length === 1 && !perCategoryColor && thresholds.length === 0) {
    const item = series[0]
    const total = model.additive && model.partition ? item.total : 0
    return (
      // `data-cd-grows`: na pilha do celular, o card acompanha a lista em vez de rolar dentro da página.
      <div data-cd-grows className="h-full min-h-0 overflow-y-auto pr-1">
        <RankedBars
          color={item.color}
          items={categories.map((category, index) => {
            const value = item.values[index] ?? 0
            return {
              id: category.id,
              label: category.title,
              title: category.title,
              value: Math.max(value, 0),
              valueLabel: formatValue(value, config, language),
              shareLabel: total > 0 ? formatPercent(value / total, language) : undefined,
            }
          })}
        />
      </div>
    )
  }

  const valueAxis = (
    <YAxis
      width="auto"
      tickLine={false}
      axisLine={false}
      tick={AXIS_TICK}
      tickCount={4}
      allowDecimals={false}
      tickFormatter={formatAxis}
      {...(allPositive ? { domain: [0, "auto"] as [number, string] } : {})}
    />
  )

  const seriesElements: ReactNode[] = series.map((item, index) => {
    const dataKey = `s${index}`

    if (type === "bar_chart") {
      return (
        <Bar
          key={item.key}
          dataKey={dataKey}
          name={item.label}
          fill={item.color}
          {...(stacked ? { stackId: "stack" } : {})}
          maxBarSize={MAX_BAR}
          isAnimationActive={animated}
          animationDuration={250}
          shape={(props: unknown) => {
            const shape = props as ShapeProps
            const isEnd = !stacked || (shape.payload ? endSeries(shape.payload) === index : false)
            return <BarMark {...shape} horizontal={horizontal} isEnd={isEnd} gap={stacked} />
          }}
        >
          {perCategoryColor
            ? categories.map((category) => (
                <Cell key={category.id} fill={valueMap?.[category.id]?.color ? resolveColor(valueMap[category.id].color) : item.color} />
              ))
            : null}
          {config.showValues && !stacked ? (
            <LabelList
              dataKey={dataKey}
              position={horizontal ? "right" : "top"}
              content={(label) => <SelectiveLabel label={label} values={item.values} config={config} language={language} bars />}
            />
          ) : null}
        </Bar>
      )
    }

    if (type === "area_chart") {
      return (
        <Area
          key={item.key}
          dataKey={dataKey}
          name={item.label}
          type={config.curved === false ? "linear" : "monotone"}
          stroke={item.color}
          strokeWidth={2}
          fill={item.color}
          fillOpacity={config.opacity ?? 0.1}
          connectNulls
          {...(stacked ? { stackId: "stack" } : {})}
          dot={categories.length === 1 ? { r: 4, fill: item.color, stroke: "var(--card)", strokeWidth: 2 } : false}
          activeDot={{ r: 4, fill: item.color, stroke: "var(--card)", strokeWidth: 2 }}
          isAnimationActive={animated}
          animationDuration={250}
        >
          {config.showValues && !stacked ? (
            <LabelList
              dataKey={dataKey}
              position="top"
              content={(label) => <SelectiveLabel label={label} values={item.values} config={config} language={language} />}
            />
          ) : null}
        </Area>
      )
    }

    return (
      <Line
        key={item.key}
        dataKey={dataKey}
        name={item.label}
        type={config.curved === false ? "linear" : "monotone"}
        stroke={item.color}
        strokeWidth={2}
        connectNulls
        dot={categories.length === 1 ? { r: 4, fill: item.color, stroke: "var(--card)", strokeWidth: 2 } : false}
        activeDot={{ r: 4, fill: item.color, stroke: "var(--card)", strokeWidth: 2 }}
        isAnimationActive={animated}
        animationDuration={250}
      >
        {config.showValues ? (
          <LabelList
            dataKey={dataKey}
            position="top"
            content={(label) => <SelectiveLabel label={label} values={item.values} config={config} language={language} />}
          />
        ) : null}
      </Line>
    )
  })

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {legend}
      <div ref={measured.ref} className="min-h-0 flex-1">
        <ChartContainer config={chartConfig} className={CHART_CLASS}>
          <ComposedChart
            data={rows}
            layout={horizontal ? "vertical" : "horizontal"}
            margin={{ top: config.showValues ? 18 : 6, right: horizontal && config.showValues ? 36 : 6, bottom: 0, left: 0 }}
            {...(horizontal ? { barCategoryGap: "22%", barGap: GAP } : barSpacing(measured.width, categories.length, stacked ? 1 : series.length))}
          >
            {config.showGrid !== false ? <CartesianGrid vertical={horizontal} horizontal={!horizontal} stroke={GRID_STROKE} /> : null}
            {horizontal ? (
              <>
                <XAxis type="number" tickLine={false} axisLine={false} tick={AXIS_TICK} tickCount={4} tickFormatter={formatAxis} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="tick"
                  width="auto"
                  tickLine={false}
                  axisLine={{ stroke: GRID_STROKE }}
                  tick={AXIS_TICK}
                  interval={0}
                />
              </>
            ) : (
              <>
                <XAxis
                  dataKey="tick"
                  tickLine={false}
                  axisLine={{ stroke: GRID_STROKE }}
                  tick={AXIS_TICK}
                  tickMargin={6}
                  interval={labelEveryCategory ? 0 : "preserveStartEnd"}
                  minTickGap={24}
                  {...(labelEveryCategory ? { tickFormatter: (tick: string) => ellipsize(tick, tickChars) } : {})}
                />
                {valueAxis}
              </>
            )}
            <ChartTooltip
              cursor={type === "bar_chart" ? { fill: "var(--muted)" } : { stroke: "var(--viz-context)", strokeWidth: 1 }}
              isAnimationActive={false}
              content={(props) => {
                const row = props.payload?.[0]?.payload as ChartRow | undefined
                if (!props.active || !row) return null
                const total = series.reduce((sum, _, index) => sum + Number(row[`s${index}`] ?? 0), 0)
                return (
                  <TooltipShell
                    title={row.title}
                    rows={series.map((item, index) => ({
                      key: item.key,
                      label: item.label,
                      color: item.color,
                      value: formatValue(row[`s${index}`] as number | null, config, language),
                    }))}
                    footer={
                      stacked && model.additive
                        ? t("customDashboards.chart.total", { value: formatValue(total, config, language) })
                        : undefined
                    }
                  />
                )
              }}
            />
            {seriesElements}
            {thresholds.map((threshold, index) => {
              const color = resolveColor(threshold.color, "var(--muted-foreground)")
              return (
                <ReferenceLine
                  key={index}
                  {...(horizontal ? { x: threshold.value } : { y: threshold.value })}
                  stroke={color}
                  strokeDasharray="4 3"
                  ifOverflow="extendDomain"
                  label={
                    threshold.label
                      ? {
                          value: threshold.label,
                          // No tempo, o movimento costuma estar no fim; em categorias, na maior barra, a primeira.
                          position: model.kind === "time" ? "insideTopLeft" : "insideTopRight",
                          fontSize: 11,
                          fill: "var(--muted-foreground)",
                        }
                      : undefined
                  }
                />
              )
            })}
          </ComposedChart>
        </ChartContainer>
      </div>
    </div>
  )
})

type LabelInput = {
  x?: number | string
  y?: number | string
  width?: number | string
  height?: number | string
  value?: unknown
  index?: number
}

/** Valor em cada barra só quando cabe. Em linha, o último ponto e o maior: é o que a pessoa procura. */
function SelectiveLabel({
  label,
  values,
  config,
  language,
  bars = false,
}: {
  label: unknown
  values: (number | null)[]
  config: VisualConfig
  language: string
  bars?: boolean
}) {
  const { x = 0, y = 0, width = 0, height = 0, value, index = 0 } = label as LabelInput
  if (value === null || value === undefined) return null

  const numbers = values.map((item) => item ?? 0)
  const peak = numbers.indexOf(Math.max(...numbers))
  const show = bars && values.length <= MAX_LABELLED_BARS ? true : index === peak || index === values.length - 1
  if (!show) return null

  const left = Number(x)
  const top = Number(y)
  const barWidth = Number(width)
  const barHeight = Number(height)
  const horizontal = bars && barWidth > barHeight && barHeight <= MAX_BAR

  return (
    <text
      x={horizontal ? left + barWidth + 4 : left + barWidth / 2}
      y={horizontal ? top + barHeight / 2 : top - 6}
      textAnchor={horizontal ? "start" : "middle"}
      dominantBaseline={horizontal ? "central" : "auto"}
      className="fill-foreground text-[11px] font-medium"
    >
      {formatCompactValue(Number(value), config, language)}
    </text>
  )
}
