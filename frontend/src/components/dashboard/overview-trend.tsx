import { useMemo } from "react"
import { Toggle } from "@base-ui/react/toggle"
import { ToggleGroup } from "@base-ui/react/toggle-group"
import { useTranslation } from "react-i18next"

import { StatTile } from "@/components/shared"
import { useIsMobile } from "@/hooks/use-is-mobile"
import { formatNumber, formatPercent } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { CardEmpty, ChartCard, ChartLegend } from "./chart-card"
import { TrendChart, type TrendPoint } from "./charts"
import { formatBucket, formatDayTick } from "./format"
import { bucketize, bucketSize, compactSeries, sum } from "./series"
import { growth, metricRows, TREND_METRICS, type TrendMetric } from "./trend-metrics"
import type { DashboardReport } from "./types"

type KpiRowProps = {
  report: DashboardReport
  previous: DashboardReport | null
  metric: TrendMetric
  onMetric: (metric: TrendMetric) => void
}

/**
 * Os quatro números do topo. Cada um também escolhe o que a tendência logo abaixo mostra: um gráfico só,
 * de uma cor só, no lugar de quatro séries disputando a mesma área.
 */
export function KpiRow({ report, previous, metric, onMetric }: KpiRowProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  // Em 390 px, duas colunas não comportam rótulo longo nem o número ao lado da linha. A tendência
  // está logo abaixo: o tile fica só com o que se lê de relance.
  const isMobile = useIsMobile()

  return (
    <ToggleGroup
      aria-label={t("dashboard.kpi.label")}
      value={[metric]}
      onValueChange={(next) => {
        if (next[0]) onMetric(next[0] as TrendMetric)
      }}
      className="grid grid-cols-2 gap-3 lg:grid-cols-4"
    >
      {TREND_METRICS.map((key) => {
        const total = sum(metricRows(report, key).map((row) => row.value))
        const change = previous ? growth(total, sum(metricRows(previous, key).map((row) => row.value))) : null
        return (
          <Toggle
            key={key}
            value={key}
            nativeButton={false}
            render={<div />}
            aria-label={t(change === null ? "dashboard.kpi.select" : "dashboard.kpi.selectDelta", {
              metric: t(`dashboard.kpi.${key}`),
              value: formatNumber(total, language),
              delta: change === null ? "" : formatPercent(change, language, { signed: true }),
            })}
            className="group min-w-0 cursor-pointer rounded-xl outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <StatTile
              label={t(isMobile ? `dashboard.kpi.short.${key}` : `dashboard.kpi.${key}`)}
              value={total}
              sparkline={isMobile ? undefined : compactSeries(metricRows(report, key).map((row) => row.value))}
              delta={
                change === null
                  ? undefined
                  : {
                      value: change,
                      label: t(isMobile ? "dashboard.kpi.vsPreviousShort" : "dashboard.kpi.vsPrevious"),
                      // Só "contatos novos" tem direção boa: mais mensagens não é melhor nem pior.
                      goodWhen: key === "newChats" ? "up" : "neutral",
                    }
              }
              className="h-full transition-shadow group-hover:ring-foreground/25 group-data-pressed:ring-2 group-data-pressed:ring-primary"
            />
          </Toggle>
        )
      })}
    </ToggleGroup>
  )
}

type TrendCardProps = {
  report: DashboardReport
  previous: DashboardReport | null
  metric: TrendMetric
  className?: string
}

export function TrendCard({ report, previous, metric, className }: TrendCardProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const isMobile = useIsMobile()

  const rows = useMemo(() => metricRows(report, metric), [metric, report])
  const size = bucketSize(rows.length, isMobile)
  const data = useMemo<TrendPoint[]>(() => {
    const current = bucketize(rows, ["value"], size)
    const before = previous ? bucketize(metricRows(previous, metric), ["value"], size) : []
    // Alinha pelo fim: o último ponto de cada período é o último dia dele.
    const offset = before.length - current.length

    return current.map((point, index) => {
      const earlier = before[index + offset]
      return {
        id: point.to,
        tick: formatDayTick(point.from, language),
        title: formatBucket(point.from, point.to, language),
        current: point.value,
        previous: earlier ? earlier.value : null,
        previousTitle: earlier ? formatBucket(earlier.from, earlier.to, language) : null,
      }
    })
  }, [language, metric, previous, rows, size])

  const metricLabel = t(`dashboard.kpi.${metric}`)
  const granularity = t(`dashboard.granularity.${size === 1 ? "day" : size === 7 ? "week" : "month"}`)
  const hasPrevious = data.some((point) => point.previous !== null)
  const currentLabel = t("dashboard.trend.current")
  const previousLabel = t("dashboard.trend.previous")

  return (
    <ChartCard
      title={t("dashboard.trend.title")}
      description={t("dashboard.trend.description", { metric: metricLabel, granularity })}
      className={className}
      summary={
        data.length > 1
          ? t("dashboard.trend.summary", {
              metric: metricLabel,
              first: formatNumber(data[0].current, language),
              firstDate: data[0].title,
              last: formatNumber(data[data.length - 1].current, language),
              lastDate: data[data.length - 1].title,
            })
          : undefined
      }
      table={
        data.length > 1
          ? {
              columns: [
                { key: "date", label: t("dashboard.table.date") },
                { key: "current", label: currentLabel, align: "right" },
                ...(hasPrevious ? [{ key: "previous", label: previousLabel, align: "right" as const }] : []),
              ],
              rows: data.map((point) => ({
                id: point.id,
                cells: {
                  date: point.title,
                  current: formatNumber(point.current, language),
                  previous: point.previous === null ? "–" : formatNumber(point.previous, language),
                },
              })),
            }
          : undefined
      }
    >
      {data.length > 1 ? (
        <div className="flex flex-col gap-3">
          {hasPrevious ? (
            <ChartLegend
              items={[
                { key: "current", label: currentLabel, color: "var(--viz-accent)", mark: "line" },
                { key: "previous", label: previousLabel, color: "var(--viz-context)", mark: "line" },
              ]}
            />
          ) : null}
          <TrendChart
            data={data}
            currentLabel={metricLabel}
            previousLabel={previousLabel}
            height={isMobile ? 200 : 240}
          />
        </div>
      ) : (
        <CardEmpty
          title={t("dashboard.trend.singleDay")}
          description={t("dashboard.trend.singleDayHint")}
        />
      )}
    </ChartCard>
  )
}
