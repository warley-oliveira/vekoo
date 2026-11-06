import { lazy, Suspense } from "react"
import { useTranslation } from "react-i18next"

import { Money } from "@/components/shared"
import { Skeleton } from "@/components/ui/skeleton"
import { useLanguage } from "@/lib/i18n"
import { formatMonthTitle } from "@/lib/pipelines-admin/format"
import type { GoalHistoryPoint } from "@/lib/pipelines-admin/types"
import { CHART_CLASSES } from "../charts/chart-tokens"
import { ChartFrame, ChartLegend } from "../charts/chart-frame"

const RevenueGoalChart = lazy(() => import("../charts/revenue-goal-chart"))

/** Receita contra meta, mês a mês. O Recharts vem só quando este gráfico aparece. */
export function RevenueGoalFigure({
  history,
  highlightMonth,
  title,
  description,
}: {
  history: GoalHistoryPoint[]
  highlightMonth: string
  title: string
  description?: string
}) {
  const { t } = useTranslation()
  const language = useLanguage()

  return (
    <ChartFrame
      title={title}
      description={description}
      legend={
        <ChartLegend
          items={[
            { id: "month", label: t("pipelinesAdmin.charts.selectedMonth"), mark: "bar", className: CHART_CLASSES.accent },
            { id: "others", label: t("pipelinesAdmin.charts.otherMonths"), mark: "bar", className: CHART_CLASSES.context },
            { id: "target", label: t("pipelinesAdmin.charts.target"), mark: "tick", className: CHART_CLASSES.target },
          ]}
        />
      }
      table={{
        columns: [
          t("pipelinesAdmin.charts.month"),
          t("pipelinesAdmin.charts.realized"),
          t("pipelinesAdmin.charts.target"),
        ],
        rows: history.map((point) => ({
          id: point.month,
          cells: [
            formatMonthTitle(point.month, language),
            <Money key="actual" value={point.actualValue} />,
            point.targetValue > 0 ? <Money key="target" value={point.targetValue} /> : "—",
          ],
        })),
      }}
    >
      <Suspense fallback={<Skeleton className="h-56 w-full" />}>
        <RevenueGoalChart history={history} highlightMonth={highlightMonth} />
      </Suspense>
    </ChartFrame>
  )
}
