import { lazy, Suspense, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { SegmentedControl } from "@/components/shared"
import { Skeleton } from "@/components/ui/skeleton"
import { formatCurrency, formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import type { PeriodMetrics, PeriodPoint } from "@/lib/pipelines-admin/types"
import { ChartFrame } from "../charts/chart-frame"

const PeriodSeriesChart = lazy(() => import("../charts/period-series-chart"))

type Measure = "createdCount" | "wonCount" | "wonValue"

function parseLocalDate(date: string) {
  const [year, month, day] = date.split("-").map(Number)
  return new Date(year, month - 1, day)
}

/**
 * A tendência do período, um indicador por vez: valores em reais e contagens não dividem eixo, e
 * trocar de indicador é mais honesto que dois eixos no mesmo desenho.
 */
export function PeriodSeriesFigure({ period, isCrm }: { period: PeriodMetrics; isCrm: boolean }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const [measure, setMeasure] = useState<Measure>("createdCount")

  const active = isCrm ? measure : "createdCount"
  const name = t(`pipelinesAdmin.metrics.series.${active}`)

  const format = useMemo(
    () =>
      active === "wonValue"
        ? (value: number) => formatCurrency(value, language, { maximumFractionDigits: 0 })
        : (value: number) => formatNumber(value, language),
    [active, language]
  )

  const points = useMemo(
    () => period.series.map((point: PeriodPoint) => ({ date: point.date, value: point[active] })),
    [active, period.series]
  )

  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(
        language,
        period.bucket === "month" ? { month: "long", year: "numeric" } : { dateStyle: "medium" }
      ),
    [language, period.bucket]
  )

  return (
    <ChartFrame
      title={t("pipelinesAdmin.metrics.trend.title")}
      description={t(`pipelinesAdmin.metrics.trend.bucket.${period.bucket}`)}
      actions={
        isCrm ? (
          <SegmentedControl<Measure>
            aria-label={t("pipelinesAdmin.metrics.trend.measure")}
            value={measure}
            onChange={setMeasure}
            options={[
              { value: "createdCount", label: t("pipelinesAdmin.metrics.series.createdCount") },
              { value: "wonCount", label: t("pipelinesAdmin.metrics.series.wonCount") },
              { value: "wonValue", label: t("pipelinesAdmin.metrics.series.wonValue") },
            ]}
          />
        ) : undefined
      }
      table={{
        columns: [t("pipelinesAdmin.charts.date"), name],
        rows: points.map((point) => ({
          id: point.date,
          cells: [dateFormat.format(parseLocalDate(point.date)), format(point.value)],
        })),
      }}
    >
      <Suspense fallback={<Skeleton className="h-52 w-full" />}>
        <PeriodSeriesChart points={points} name={name} bucket={period.bucket} formatValue={format} />
      </Suspense>
    </ChartFrame>
  )
}
