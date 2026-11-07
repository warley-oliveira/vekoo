import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link, useNavigate, useSearchParams } from "react-router"
import { BarChart3, EyeOff } from "lucide-react"

import {
  Callout,
  CardGridSkeleton,
  DateRangePicker,
  EmptyState,
  ErrorState,
  ListSkeleton,
  Money,
  SectionCard,
  SegmentedControl,
  StatTile,
  useDateRangePresets,
  type DateRangePreset,
  type DateRangeValue,
  type StatDelta,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { BoardFrame } from "@/components/pipelines-admin/board-frame"
import { BarList, type BarListItem } from "@/components/pipelines-admin/metrics/bar-list"
import { DealSplit } from "@/components/pipelines-admin/metrics/deal-split"
import { ForecastList } from "@/components/pipelines-admin/metrics/forecast-list"
import { GoalMeter } from "@/components/pipelines-admin/metrics/goal-meter"
import { PeriodSeriesFigure } from "@/components/pipelines-admin/metrics/period-series-figure"
import { RankingList } from "@/components/pipelines-admin/metrics/ranking-list"
import { RevenueGoalFigure } from "@/components/pipelines-admin/metrics/revenue-goal-figure"
import { StageConversion } from "@/components/pipelines-admin/metrics/stage-conversion"
import { StageDot } from "@/components/pipelines-admin/settings/stages-section"
import { useGoalHistory, useGoalProgress } from "@/hooks/pipelines-admin/use-goals"
import { useBoardMetrics } from "@/hooks/pipelines-admin/use-metrics"
import { endOfDay, startOfDay, toDateInputValue } from "@/lib/date-format"
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { deltaRatio, formatDurationFromHours, formatMonth, monthOf } from "@/lib/pipelines-admin/format"
import type { Board, BoardMetrics, CardPriority, PeriodMetrics } from "@/lib/pipelines-admin/types"
import { cn } from "@/lib/utils"

const DEFAULT_DAYS = 30
const DAY_MS = 86_400_000
const HISTORY_MONTHS = 6
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const PRIORITIES: CardPriority[] = ["urgent", "high", "medium", "low"]

export default function MetricsPage() {
  const { t } = useTranslation()

  return (
    <BoardFrame
      area="metrics"
      skeleton={<MetricsSkeleton />}
      header={() => ({ description: t("pipelinesAdmin.metrics.description") })}
    >
      {(board) => <MetricsContent board={board} />}
    </BoardFrame>
  )
}

function MetricsSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-hidden>
      <Skeleton className="h-10 w-full max-w-xl" />
      <Skeleton className="h-9 w-56" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <StatTile key={index} label="" value={0} loading />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
      <CardGridSkeleton cards={2} />
    </div>
  )
}

function parseDate(value: string | null) {
  if (!value || !DATE_PATTERN.test(value)) return null
  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(year, month - 1, day)
  return Number.isNaN(date.getTime()) ? null : date
}

function defaultRange(): DateRangeValue {
  const now = new Date()
  return { from: startOfDay(new Date(now.getTime() - (DEFAULT_DAYS - 1) * DAY_MS)), to: endOfDay(now) }
}

function useMetricsPresets(): DateRangePreset[] {
  const { t } = useTranslation()
  const base = useDateRangePresets()

  return useMemo(() => {
    const pick = (id: string) => base.filter((preset) => preset.id === id)
    return [
      ...pick("7d"),
      ...pick("30d"),
      {
        id: "90d",
        label: t("pipelinesAdmin.metrics.presets.last90"),
        range: () => {
          const now = new Date()
          return { from: startOfDay(new Date(now.getTime() - 89 * DAY_MS)), to: endOfDay(now) }
        },
      },
      ...pick("month"),
      ...pick("last-month"),
      {
        id: "year",
        label: t("pipelinesAdmin.metrics.presets.thisYear"),
        range: () => {
          const now = new Date()
          return { from: new Date(now.getFullYear(), 0, 1), to: endOfDay(now) }
        },
      },
    ]
  }, [base, t])
}

/** Sem base de comparação não há variação: o tile não inventa um "+100%". */
function deltaOf(current: number, previous: number, label: string, goodWhen?: StatDelta["goodWhen"]): StatDelta | undefined {
  const value = deltaRatio(current, previous)
  return value === null ? undefined : { value, label, goodWhen }
}

function MetricsContent({ board }: { board: Board }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const presets = useMetricsPresets()

  // O endereço guarda o período: dá para mandar o link, e voltar não perde o filtro.
  const fallback = useMemo(defaultRange, [])
  const fromParam = parseDate(params.get("from"))
  const toParam = parseDate(params.get("to"))
  const range: DateRangeValue =
    fromParam && toParam && fromParam <= toParam
      ? { from: startOfDay(fromParam), to: endOfDay(toParam) }
      : fallback

  const from = toDateInputValue(range.from)
  const to = toDateInputValue(range.to)
  const isCrm = board.boardType === "crm"
  const goalMonth = monthOf(range.to)

  const { metrics, error, isLoading, isValidating, reload } = useBoardMetrics(board.id, from, to)
  const { progress } = useGoalProgress(board.id, goalMonth, { enabled: isCrm })
  const { history } = useGoalHistory(board.id, goalMonth, HISTORY_MONTHS, { enabled: isCrm })

  function changeRange(next: DateRangeValue | null) {
    if (!next) return
    setParams(
      (current) => {
        const updated = new URLSearchParams(current)
        updated.set("from", toDateInputValue(next.from))
        updated.set("to", toDateInputValue(next.to))
        return updated
      },
      { replace: true }
    )
  }

  if (error && !metrics) {
    return <ErrorState error={error} onRetry={() => void reload()} />
  }

  if (isLoading || !metrics) {
    return (
      <div className="flex flex-col gap-5" aria-hidden>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <StatTile key={index} label="" value={0} loading />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
        <ListSkeleton rows={4} />
      </div>
    )
  }

  const period = metrics.period
  const summary = metrics.dealSummary
  const isEmpty =
    metrics.totalCards === 0 &&
    summary.wonCount === 0 &&
    summary.lostCount === 0 &&
    !period?.summary.createdCount

  if (isEmpty) {
    return (
      <EmptyState
        icon={<BarChart3 className="size-5" />}
        title={t("pipelinesAdmin.metrics.empty.title")}
        description={t("pipelinesAdmin.metrics.empty.description")}
        action={{
          label: t("pipelinesAdmin.metrics.empty.action"),
          onClick: () => navigate(`/pipelines/${board.id}`),
        }}
      />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {!board.viewerCanViewAllCards ? (
        <Callout tone="info" icon={<EyeOff />} role="status">
          {t("pipelinesAdmin.metrics.restricted")}
        </Callout>
      ) : null}

      {/* Só o que está abaixo depende desta data: "Agora no quadro" é outro bloco, com outro título. */}
      <section className="flex flex-col gap-4" aria-label={t("pipelinesAdmin.metrics.periodSection")}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 className="font-heading text-base font-medium">{t("pipelinesAdmin.metrics.periodSection")}</h2>
          <DateRangePicker
            label={t("pipelinesAdmin.metrics.period")}
            value={range}
            onChange={changeRange}
            presets={presets}
            required
            className="w-full sm:w-64"
          />
        </div>

        {period ? (
          <div
            className={cn(
              "flex flex-col gap-4 motion-safe:transition-opacity motion-safe:duration-150",
              isValidating && "opacity-60"
            )}
          >
            <PeriodTiles period={period} isCrm={isCrm} />
            <PeriodSeriesFigure period={period} isCrm={isCrm} />

            <div className="grid items-start gap-4 lg:grid-cols-2">
              <StageConversion conversion={period.stageConversion} isCrm={isCrm} />
              <StageTime period={period} />
            </div>

            {isCrm ? <RankingList ranking={period.ranking} /> : null}
          </div>
        ) : null}
      </section>

      {isCrm ? (
        <section className="flex flex-col gap-4 border-t pt-6" aria-label={t("pipelinesAdmin.metrics.goal.section")}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <h2 className="font-heading text-base font-medium">
              {t("pipelinesAdmin.metrics.goal.title", { month: formatMonth(goalMonth, language) })}
            </h2>
            <Button
              nativeButton={false}
              variant="link"
              size="sm"
              className="h-auto p-0 pointer-coarse:h-10"
              render={<Link to={`/pipelines/${board.id}/settings/goals?month=${goalMonth}`} />}
            >
              {t("pipelinesAdmin.metrics.goal.manage")}
            </Button>
          </div>
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <GoalSummary board={board} progress={progress} />
            {history?.some((point) => point.targetValue > 0 || point.actualValue > 0) ? (
              <RevenueGoalFigure
                history={history}
                highlightMonth={goalMonth}
                title={t("pipelinesAdmin.goals.history.title", { count: HISTORY_MONTHS })}
                description={t("pipelinesAdmin.goals.history.description")}
              />
            ) : null}
          </div>
        </section>
      ) : null}

      <NowSection board={board} metrics={metrics} isCrm={isCrm} />
    </div>
  )
}

function PeriodTiles({ period, isCrm }: { period: PeriodMetrics; isCrm: boolean }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const { summary, previous, series } = period
  const versus = t("pipelinesAdmin.metrics.versusPrevious")
  const money = (value: number) => formatCurrency(value, language, { maximumFractionDigits: 0 })

  return (
    <div className={cn("grid gap-3", isCrm && "grid-cols-2 lg:grid-cols-4")}>
      <StatTile
        label={t("pipelinesAdmin.metrics.tiles.created")}
        value={summary.createdCount}
        delta={deltaOf(summary.createdCount, previous.createdCount, versus)}
        sparkline={series.map((point) => point.createdCount)}
      />
      {isCrm ? (
        <>
          <StatTile
            label={t("pipelinesAdmin.metrics.tiles.won")}
            value={<Money value={summary.wonValue} compact />}
            delta={deltaOf(summary.wonValue, previous.wonValue, versus)}
            hint={t("pipelinesAdmin.metrics.tiles.deals", { count: summary.wonCount })}
            sparkline={series.map((point) => point.wonValue)}
            formatSparklineValue={money}
          />
          <StatTile
            label={t("pipelinesAdmin.metrics.tiles.lost")}
            value={<Money value={summary.lostValue} compact />}
            delta={deltaOf(summary.lostValue, previous.lostValue, versus, "down")}
            hint={t("pipelinesAdmin.metrics.tiles.deals", { count: summary.lostCount })}
            sparkline={series.map((point) => point.lostCount)}
          />
          <StatTile
            label={t("pipelinesAdmin.metrics.tiles.conversion")}
            value={
              summary.conversionRate === null
                ? "—"
                : formatPercent(summary.conversionRate / 100, language)
            }
            delta={
              summary.conversionRate !== null && previous.conversionRate !== null
                ? deltaOf(summary.conversionRate, previous.conversionRate, versus)
                : undefined
            }
            hint={summary.conversionRate === null ? t("pipelinesAdmin.metrics.tiles.nothingClosed") : undefined}
          />
        </>
      ) : null}
    </div>
  )
}

function StageTime({ period }: { period: PeriodMetrics }) {
  const { t } = useTranslation()
  const language = useLanguage()

  const items = useMemo<BarListItem[]>(() => {
    const slowest = Math.max(...period.avgTimePerStage.map((stage) => stage.avgHours ?? 0))
    return period.avgTimePerStage.map((stage) => ({
      id: stage.stageId,
      label: (
        <span className="flex min-w-0 items-center gap-2">
          <StageDot color={stage.color} />
          <span className="truncate">{stage.stageName}</span>
        </span>
      ),
      value: stage.avgHours,
      display: stage.avgHours === null ? "—" : formatDurationFromHours(stage.avgHours, language),
      detail: t("pipelinesAdmin.metrics.stageTime.passages", { count: stage.passages }),
      emphasized: stage.avgHours !== null && stage.avgHours > 0 && stage.avgHours === slowest,
    }))
  }, [language, period.avgTimePerStage, t])

  const hasData = period.avgTimePerStage.some((stage) => stage.passages > 0)

  return (
    <SectionCard
      title={t("pipelinesAdmin.metrics.stageTime.title")}
      description={t("pipelinesAdmin.metrics.stageTime.description")}
    >
      {hasData ? (
        <BarList items={items} aria-label={t("pipelinesAdmin.metrics.stageTime.title")} />
      ) : (
        <p className="text-sm text-muted-foreground">{t("pipelinesAdmin.metrics.stageTime.empty")}</p>
      )}
    </SectionCard>
  )
}

function GoalSummary({
  board,
  progress,
}: {
  board: Board
  progress: ReturnType<typeof useGoalProgress>["progress"]
}) {
  const { t } = useTranslation()

  if (!progress) {
    return <Skeleton className="h-40 w-full rounded-xl" />
  }

  return (
    <SectionCard title={t("pipelinesAdmin.goals.boardGoal")}>
      <div className="flex flex-col gap-4">
        {progress.funnel ? (
          <GoalMeter
            actual={progress.funnel.actualValue}
            target={progress.funnel.targetValue}
            percentage={progress.funnel.progressPercentage}
            label={t("pipelinesAdmin.goals.boardGoal")}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("pipelinesAdmin.metrics.goal.none")}{" "}
            <Link
              to={`/pipelines/${board.id}/settings/goals?month=${progress.month}`}
              className="underline underline-offset-2"
            >
              {t("pipelinesAdmin.goals.setBoardGoal")}
            </Link>
          </p>
        )}
        {progress.users.length > 0 ? (
          <ul className="flex flex-col gap-3 border-t pt-3">
            {progress.users.map((entry) => (
              <li key={entry.goalId} className="flex flex-col gap-1">
                <span className="truncate text-xs text-muted-foreground">{entry.user.name}</span>
                <GoalMeter
                  actual={entry.actualValue}
                  target={entry.targetValue}
                  percentage={entry.progressPercentage}
                  label={t("pipelinesAdmin.goals.goalOf", { name: entry.user.name })}
                />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </SectionCard>
  )
}

function NowSection({
  board,
  metrics,
  isCrm,
}: {
  board: Board
  metrics: BoardMetrics
  isCrm: boolean
}) {
  const { t } = useTranslation()
  const language = useLanguage()
  const [measure, setMeasure] = useState<"cards" | "value">("cards")

  const stageItems = useMemo<BarListItem[]>(() => {
    const values = new Map(metrics.dealValuePerStage.map((stage) => [stage.stageId, stage]))
    const sorted = [...metrics.cardsPerStage].sort((a, b) => a.position - b.position)
    return sorted.map((stage) => ({
      id: stage.stageId,
      label: (
        <span className="flex min-w-0 items-center gap-2">
          <StageDot color={stage.color} />
          <span className="truncate">{stage.stageName}</span>
        </span>
      ),
      value: measure === "cards" ? stage.count : (values.get(stage.stageId)?.totalValue ?? 0),
      display:
        measure === "cards" ? (
          formatNumber(stage.count, language)
        ) : (
          <Money value={values.get(stage.stageId)?.totalValue ?? 0} />
        ),
    }))
  }, [language, measure, metrics.cardsPerStage, metrics.dealValuePerStage])

  const priorityItems = useMemo<BarListItem[]>(() => {
    const known = PRIORITIES.reduce((sum, priority) => sum + (metrics.cardsByPriority[priority] ?? 0), 0)
    return [
      ...PRIORITIES.map((priority) => ({
        id: priority,
        label: t(`pipelinesAdmin.priorities.${priority}`),
        value: metrics.cardsByPriority[priority] ?? 0,
        display: formatNumber(metrics.cardsByPriority[priority] ?? 0, language),
      })),
      {
        id: "none",
        label: t("pipelinesAdmin.metrics.priorityNone"),
        value: Math.max(0, metrics.totalCards - known),
        display: formatNumber(Math.max(0, metrics.totalCards - known), language),
      },
    ]
  }, [language, metrics.cardsByPriority, metrics.totalCards, t])

  return (
    <section className="flex flex-col gap-4 border-t pt-6" aria-label={t("pipelinesAdmin.metrics.nowSection")}>
      <div className="space-y-0.5">
        <h2 className="font-heading text-base font-medium">{t("pipelinesAdmin.metrics.nowSection")}</h2>
        <p className="text-xs text-muted-foreground">{t("pipelinesAdmin.metrics.nowHint")}</p>
      </div>

      <div className={cn("grid grid-cols-2 gap-3", isCrm && "lg:grid-cols-4")}>
        <StatTile label={t("pipelinesAdmin.metrics.tiles.active")} value={metrics.totalCards} />
        {isCrm ? (
          <>
            <StatTile
              label={t("pipelinesAdmin.metrics.tiles.totalValue")}
              value={<Money value={metrics.totalDealValue} compact />}
            />
            <StatTile
              label={t("pipelinesAdmin.metrics.tiles.weighted")}
              value={<Money value={metrics.weightedPipelineValue} compact />}
              hint={t("pipelinesAdmin.metrics.tiles.weightedHint")}
            />
          </>
        ) : null}
        <StatTile label={t("pipelinesAdmin.metrics.tiles.overdue")} value={metrics.overdueCount} />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <SectionCard
          title={t("pipelinesAdmin.metrics.stages.title")}
          actions={
            isCrm ? (
              <SegmentedControl
                aria-label={t("pipelinesAdmin.metrics.stages.measure")}
                value={measure}
                onChange={setMeasure}
                options={[
                  { value: "cards", label: t("pipelinesAdmin.metrics.stages.cards") },
                  { value: "value", label: t("pipelinesAdmin.metrics.stages.value") },
                ]}
              />
            ) : undefined
          }
        >
          <BarList items={stageItems} aria-label={t("pipelinesAdmin.metrics.stages.title")} />
        </SectionCard>

        <SectionCard title={t("pipelinesAdmin.metrics.priority")}>
          <BarList items={priorityItems} aria-label={t("pipelinesAdmin.metrics.priority")} />
        </SectionCard>

        {isCrm ? <DealSplit summary={metrics.dealSummary} /> : null}
        {isCrm ? <ForecastList board={board} /> : null}
      </div>
    </section>
  )
}
