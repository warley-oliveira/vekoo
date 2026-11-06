import { useMemo, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router"
import { AlertTriangle, MessagesSquare, RefreshCw } from "lucide-react"

import { Callout, EmptyState, ErrorState } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useAnyDashboardData, useDashboardReport } from "@/hooks/insights/use-dashboard"
import { useShownPeriod, type DashboardPeriod, type PeriodPreset } from "@/hooks/insights/use-dashboard-period"
import { useCan } from "@/hooks/use-can"
import { ApiError } from "@/lib/api"
import { formatNumber, formatPercent } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { CardBoundary } from "./card-boundary"
import { OverviewSkeleton } from "./dashboard-skeletons"
import { formatDuration } from "./format"
import { FunnelsSection } from "./funnels-section"
import { HeatMapCard } from "./heat-map-card"
import {
  AutomationTiles,
  AutonomyCard,
  ChannelMixCard,
  MessageVolumeCard,
  ResponseTimeCard,
  TeamRankingCard,
} from "./overview-cards"
import { KpiRow, TrendCard } from "./overview-trend"
import { sum } from "./series"
import { comparableReport, growth, type TrendMetric } from "./trend-metrics"
import type { DashboardReport } from "./types"

type OverviewTabProps = {
  period: DashboardPeriod
  onPreset: (preset: PeriodPreset) => void
}

export function OverviewTab({ period: requestedPeriod, onPreset }: OverviewTabProps) {
  const { t } = useTranslation()
  const { report, error, isLoading, reload } = useDashboardReport(requestedPeriod)
  const period = useShownPeriod(requestedPeriod, isLoading)
  // O período anterior só dá contexto. Se falhar, os números continuam, sem a variação.
  const { report: previousReport } = useDashboardReport(requestedPeriod.previous)
  const previous = comparableReport(previousReport, period)
  const [metric, setMetric] = useState<TrendMetric>("newChats")

  if (error && !report) {
    return (
      <ErrorState
        error={error}
        // `rangeTooLong` e companhia: a frase do servidor explica o que fazer.
        description={error instanceof ApiError && error.status === 422 ? error.serverMessage : undefined}
        onRetry={reload}
      />
    )
  }
  if (!report) return <OverviewSkeleton />
  if (!report.hasData) return <NoData period={period} onPreset={onPreset} />

  const guard = { resetKey: report, onRetry: reload }

  return (
    <div
      aria-busy={isLoading}
      // Trocou o período: o quadro anterior fica, mais apagado, até o novo chegar. Sem esqueleto piscando.
      className={cn("flex flex-col gap-6 transition-opacity duration-150 md:gap-8", isLoading && "opacity-60")}
    >
      {error ? (
        <Callout
          tone="warning"
          role="status"
          icon={<AlertTriangle className="size-4" />}
          title={t("dashboard.staleTitle")}
          action={
            <Button type="button" variant="outline" size="sm" onClick={reload}>
              <RefreshCw />
              {t("dashboard.retry")}
            </Button>
          }
        />
      ) : null}

      <div className="flex flex-col gap-4">
        <CardBoundary title={t("dashboard.summary.title")} {...guard}>
          <Summary report={report} previous={previous} period={period} />
        </CardBoundary>
        <CardBoundary title={t("dashboard.kpi.label")} {...guard}>
          <KpiRow report={report} previous={previous} metric={metric} onMetric={setMetric} />
        </CardBoundary>
        <div className="grid gap-4 lg:grid-cols-12">
          <CardBoundary title={t("dashboard.trend.title")} {...guard} className="lg:col-span-8">
            <TrendCard report={report} previous={previous} metric={metric} className="lg:col-span-8" />
          </CardBoundary>
          <CardBoundary title={t("dashboard.responseTime.title")} {...guard} className="lg:col-span-4">
            <ResponseTimeCard report={report} className="lg:col-span-4" />
          </CardBoundary>
        </div>
      </div>

      <Section title={t("dashboard.sections.messages")}>
        <div className="grid gap-4 lg:grid-cols-12">
          <CardBoundary title={t("dashboard.volume.title")} {...guard} className="lg:col-span-8">
            <MessageVolumeCard report={report} className="lg:col-span-8" />
          </CardBoundary>
          <CardBoundary title={t("dashboard.channels.title")} {...guard} className="lg:col-span-4">
            <ChannelMixCard report={report} className="lg:col-span-4" />
          </CardBoundary>
        </div>
      </Section>

      <Section title={t("dashboard.sections.automation")}>
        <div className="grid gap-4 lg:grid-cols-12">
          <CardBoundary title={t("dashboard.autonomy.title")} {...guard} className="lg:col-span-4">
            <AutonomyCard report={report} className="lg:col-span-4" />
          </CardBoundary>
          <CardBoundary title={t("dashboard.sections.automation")} {...guard} className="lg:col-span-8">
            <AutomationTiles report={report} className="lg:col-span-8" />
          </CardBoundary>
        </div>
      </Section>

      <Section title={t("dashboard.sections.team")}>
        <div className="grid gap-4 lg:grid-cols-12">
          <CardBoundary title={t("dashboard.team.title")} {...guard} className="lg:col-span-5">
            <TeamRankingCard report={report} className="lg:col-span-5" />
          </CardBoundary>
          <CardBoundary title={t("dashboard.heat.title")} {...guard} className="lg:col-span-7">
            <HeatMapCard report={report} period={period} className="lg:col-span-7" />
          </CardBoundary>
        </div>
      </Section>

      <Section title={t("dashboard.sections.funnels")}>
        <CardBoundary title={t("dashboard.sections.funnels")} {...guard}>
          <FunnelsSection funnels={report.funnels} />
        </CardBoundary>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-heading text-sm font-medium text-muted-foreground">{title}</h2>
      {children}
    </section>
  )
}

/** A resposta em uma frase: "como está meu atendimento?", antes de qualquer gráfico. */
function Summary({
  report,
  previous,
  period,
}: {
  report: DashboardReport
  previous: DashboardReport | null
  period: DashboardPeriod
}) {
  const { t } = useTranslation()
  const language = useLanguage()

  const total = sum(report.newChats.map((point) => point.count))
  const change = previous ? growth(total, sum(previous.newChats.map((point) => point.count))) : null

  const when = useMemo(() => {
    if (period.preset === "today") return t("dashboard.summary.when.today")
    if (period.preset === "month") return t("dashboard.summary.when.month")
    if (period.preset) return t("dashboard.summary.when.last", { count: period.days })
    return t("dashboard.summary.when.range")
  }, [period.days, period.preset, t])

  const lead =
    total > 0
      ? t("dashboard.summary.newChats", { count: total, value: formatNumber(total, language), when })
      : t("dashboard.summary.noNewChats", { when })

  const comparison =
    change === null
      ? null
      : change === 0
        ? t("dashboard.summary.same")
        : t(change > 0 ? "dashboard.summary.more" : "dashboard.summary.less", {
            value: formatPercent(Math.abs(change), language),
          })

  const automation = report.firstResponseAutomationSeconds
  const human = report.firstResponseHumanSeconds
  const response =
    automation !== null && human !== null
      ? t("dashboard.summary.responseBoth", {
          automation: formatDuration(automation, language),
          human: formatDuration(human, language),
        })
      : automation !== null
        ? t("dashboard.summary.responseAutomation", { automation: formatDuration(automation, language) })
        : human !== null
          ? t("dashboard.summary.responseHuman", { human: formatDuration(human, language) })
          : null

  return (
    <div className="flex flex-col gap-1">
      <p className="max-w-4xl font-heading text-xl font-medium tracking-tight text-balance md:text-2xl">
        {lead}
        {comparison ? <span className="text-muted-foreground">{comparison}</span> : null}
      </p>
      <p className="max-w-4xl text-sm text-pretty text-muted-foreground">
        {response}
        {response && period.includesToday ? " " : null}
        {period.includesToday ? t("dashboard.summary.todayLag") : null}
      </p>
    </div>
  )
}

/** `hasData: false` é um estado de verdade, e tem dois sentidos: nada neste período, ou nada ainda. */
function NoData({ period, onPreset }: OverviewTabProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const canConnect = useCan("core_settings")
  const { hasAnyData, isChecking } = useAnyDashboardData(true)

  if (isChecking) return <OverviewSkeleton />

  if (hasAnyData) {
    return (
      <EmptyState
        icon={<MessagesSquare className="size-5" />}
        title={t("dashboard.empty.periodTitle")}
        description={t(
          period.preset === "today" ? "dashboard.empty.todayHint" : "dashboard.empty.periodHint"
        )}
        action={
          period.preset === "30d"
            ? undefined
            : { label: t("dashboard.empty.seeLast30"), onClick: () => onPreset("30d") }
        }
      />
    )
  }

  return (
    <EmptyState
      icon={<MessagesSquare className="size-5" />}
      title={t("dashboard.empty.firstTitle")}
      description={t("dashboard.empty.firstHint")}
      action={
        canConnect
          ? { label: t("dashboard.empty.connect"), onClick: () => navigate("/settings/integrations") }
          : undefined
      }
    />
  )
}
