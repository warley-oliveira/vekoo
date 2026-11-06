import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router"
import { AlertTriangle, ArrowRight, CalendarSearch, Check, RefreshCw, X } from "lucide-react"

import {
  Callout,
  EmptyState,
  ErrorState,
  KeyValueList,
  StatTile,
  StatusBadge,
  type StatusTone,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useCalendarStats } from "@/hooks/insights/use-dashboard"
import type { DashboardPeriod } from "@/hooks/insights/use-dashboard-period"
import { useIsMobile } from "@/hooks/use-is-mobile"
import { formatTime } from "@/lib/date-format"
import { formatNumber, formatPercent } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { Meter, SegmentBar, type SegmentPart } from "./bars"
import { CardBoundary } from "./card-boundary"
import { CardEmpty, ChartCard, ChartLegend } from "./chart-card"
import { HighlightColumns, StackedColumns, type ColumnPoint, type ColumnSeries, type HighlightPoint } from "./charts"
import { AgendaSkeleton } from "./dashboard-skeletons"
import { formatBucket, formatDayTick, formatRate, weekdayName } from "./format"
import { bucketize, bucketSize, fillDays } from "./series"
import type { CalendarStats, ProfessionalStat, UpcomingBooking } from "./types"

/** Segunda primeiro, como no mapa de calor. A API manda a partir do domingo. */
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]
const PROFESSIONALS_VISIBLE = 8
/** Com menos que isto, "melhor comparecimento" é só sorte. Vem da origem. */
const BEST_PROFESSIONAL_MIN = 2
const DAILY_KEYS = ["show", "noShow"] as const

export function AgendaTab({ period }: { period: DashboardPeriod }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { stats, error, isLoading, reload } = useCalendarStats(period, true)

  if (error && !stats) return <ErrorState error={error} onRetry={reload} />
  if (!stats) return <AgendaSkeleton />

  if (stats.total <= 0) {
    return (
      <EmptyState
        icon={<CalendarSearch className="size-5" />}
        title={t("dashboard.agenda.emptyTitle")}
        description={t("dashboard.agenda.emptyHint")}
        action={{ label: t("dashboard.agenda.open"), onClick: () => navigate("/calendar") }}
      />
    )
  }

  const guard = { resetKey: stats, onRetry: reload }

  return (
    <div
      aria-busy={isLoading}
      className={cn("flex flex-col gap-4 transition-opacity duration-150", isLoading && "opacity-60")}
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

      <AgendaTiles stats={stats} />

      <CardBoundary title={t("dashboard.agenda.daily.title")} {...guard}>
        <DailyCard stats={stats} period={period} />
      </CardBoundary>

      <div className="grid gap-4 lg:grid-cols-3">
        <CardBoundary title={t("dashboard.agenda.attendance.title")} {...guard}>
          <AttendanceCard stats={stats} />
        </CardBoundary>
        <CardBoundary title={t("dashboard.agenda.cancellation.title")} {...guard}>
          <CancellationCard stats={stats} />
        </CardBoundary>
        <CardBoundary title={t("dashboard.agenda.highlights.title")} {...guard}>
          <HighlightsCard stats={stats} />
        </CardBoundary>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <CardBoundary title={t("dashboard.agenda.professionals.title")} {...guard} className="lg:col-span-7">
          <ProfessionalsCard stats={stats} className="lg:col-span-7" />
        </CardBoundary>
        <CardBoundary title={t("dashboard.agenda.upcoming.title")} {...guard} className="lg:col-span-5">
          <UpcomingCard upcoming={stats.upcoming} className="lg:col-span-5" />
        </CardBoundary>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <CardBoundary title={t("dashboard.agenda.hours.title")} {...guard}>
          <HoursCard stats={stats} />
        </CardBoundary>
        <CardBoundary title={t("dashboard.agenda.weekdays.title")} {...guard}>
          <WeekdaysCard stats={stats} />
        </CardBoundary>
      </div>
    </div>
  )
}

function AgendaTiles({ stats }: { stats: CalendarStats }) {
  const { t } = useTranslation()
  const language = useLanguage()

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <StatTile label={t("dashboard.agenda.kpi.total")} value={stats.total} />
      <StatTile label={t("dashboard.agenda.kpi.show")} value={stats.show} />
      <StatTile label={t("dashboard.agenda.kpi.noShow")} value={stats.noShow} />
      <StatTile label={t("dashboard.agenda.kpi.canceled")} value={stats.canceled} />
      <StatTile
        className="col-span-2 lg:col-span-1"
        label={t("dashboard.agenda.kpi.attendanceRate")}
        value={stats.attendanceRate === null ? "–" : formatRate(stats.attendanceRate, language)}
        hint={
          stats.attendanceRate === null
            ? t("dashboard.agenda.attendance.noBase")
            : t("dashboard.agenda.attendance.detail", {
                show: formatNumber(stats.show, language),
                total: formatNumber(stats.show + stats.noShow, language),
              })
        }
      />
    </div>
  )
}

/* ---------- comparecimento dia a dia ---------- */

function DailyCard({ stats, period }: { stats: CalendarStats; period: DashboardPeriod }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const isMobile = useIsMobile()

  const rows = useMemo(
    () => fillDays(stats.daily, DAILY_KEYS, period.dateStart, period.dateEnd),
    [period.dateEnd, period.dateStart, stats.daily]
  )
  const size = bucketSize(rows.length, isMobile)
  const data = useMemo<ColumnPoint[]>(
    () =>
      bucketize(rows, DAILY_KEYS, size).map((bucket) => ({
        id: bucket.to,
        tick: formatDayTick(bucket.from, language),
        title: formatBucket(bucket.from, bucket.to, language),
        show: bucket.show,
        noShow: bucket.noShow,
      })),
    [language, rows, size]
  )

  const series: ColumnSeries[] = [
    { key: "show", label: t("dashboard.agenda.show"), color: "var(--viz-show)" },
    { key: "noShow", label: t("dashboard.agenda.noShow"), color: "var(--viz-no-show)" },
  ]
  const granularity = t(`dashboard.granularity.${size === 1 ? "day" : size === 7 ? "week" : "month"}`)
  const empty = stats.show + stats.noShow === 0

  return (
    <ChartCard
      title={t("dashboard.agenda.daily.title")}
      description={t("dashboard.agenda.daily.description", { granularity })}
      summary={t("dashboard.agenda.daily.summary", {
        show: formatNumber(stats.show, language),
        noShow: formatNumber(stats.noShow, language),
      })}
      table={
        empty
          ? undefined
          : {
              columns: [
                { key: "date", label: t("dashboard.table.date") },
                ...series.map((entry) => ({ key: entry.key, label: entry.label, align: "right" as const })),
              ],
              rows: data.map((point) => ({
                id: point.id,
                cells: {
                  date: point.title,
                  show: formatNumber(Number(point.show), language),
                  noShow: formatNumber(Number(point.noShow), language),
                },
              })),
            }
      }
    >
      {empty ? (
        <CardEmpty title={t("dashboard.agenda.daily.emptyTitle")} description={t("dashboard.agenda.daily.emptyHint")} />
      ) : (
        <div className="flex flex-col gap-3">
          <ChartLegend
            items={[
              {
                key: "show",
                label: t("dashboard.agenda.show"),
                color: "var(--viz-show)",
                value: formatNumber(stats.show, language),
              },
              {
                key: "noShow",
                label: t("dashboard.agenda.noShow"),
                color: "var(--viz-no-show)",
                value: formatNumber(stats.noShow, language),
              },
            ]}
          />
          <StackedColumns data={data} series={series} height={isMobile ? 180 : 220} />
        </div>
      )}
    </ChartCard>
  )
}

/* ---------- comparecimento e cancelamento ---------- */

/** As faixas da origem: quanto é bom, em comparecimento. O texto acompanha a cor, sempre. */
function attendanceTone(rate: number): { tone: StatusTone; key: "good" | "attention" | "low"; color: string } {
  if (rate >= 70) return { tone: "success", key: "good", color: "var(--status-success)" }
  if (rate >= 40) return { tone: "warning", key: "attention", color: "var(--status-warning)" }
  return { tone: "danger", key: "low", color: "var(--status-danger)" }
}

function cancellationTone(rate: number): { tone: StatusTone; key: "low" | "attention" | "high"; color: string } {
  if (rate <= 10) return { tone: "success", key: "low", color: "var(--status-success)" }
  if (rate <= 25) return { tone: "warning", key: "attention", color: "var(--status-warning)" }
  return { tone: "danger", key: "high", color: "var(--status-danger)" }
}

function AttendanceCard({ stats }: { stats: CalendarStats }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const rate = stats.attendanceRate
  const tone = rate === null ? null : attendanceTone(rate)

  const parts: SegmentPart[] = [
    { key: "show", label: t("dashboard.agenda.show"), value: stats.show, color: "var(--viz-show)" },
    { key: "noShow", label: t("dashboard.agenda.noShow"), value: stats.noShow, color: "var(--viz-no-show)" },
    { key: "pending", label: t("dashboard.agenda.pending"), value: stats.pending, color: "var(--viz-track)" },
  ]

  const splitText = parts
    .map((part) => `${part.label}: ${formatNumber(part.value, language)}`)
    .join(", ")

  return (
    <ChartCard
      title={t("dashboard.agenda.attendance.title")}
      description={t("dashboard.agenda.attendance.description")}
      actions={
        tone ? <StatusBadge tone={tone.tone}>{t(`dashboard.agenda.attendance.tone.${tone.key}`)}</StatusBadge> : undefined
      }
    >
      <div className="flex flex-col gap-3">
        <p className="font-heading text-3xl leading-none font-semibold tracking-tight">
          {rate === null ? "–" : formatRate(rate, language)}
        </p>
        <SegmentBar parts={parts} label={splitText} />
        <ul className="flex flex-col gap-1.5 text-sm">
          {parts.map((part) => (
            <li key={part.key} className="flex items-center gap-2">
              <span aria-hidden className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: part.color }} />
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{part.label}</span>
              <span className="font-medium tabular-nums">{formatNumber(part.value, language)}</span>
              <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">
                {stats.total > 0 ? formatPercent(part.value / stats.total, language, { maximumFractionDigits: 0 }) : "–"}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">{t("dashboard.agenda.pendingHint")}</p>
      </div>
    </ChartCard>
  )
}

function CancellationCard({ stats }: { stats: CalendarStats }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const rate = stats.cancellationRate
  const tone = rate === null ? null : cancellationTone(rate)

  return (
    <ChartCard
      title={t("dashboard.agenda.cancellation.title")}
      description={t("dashboard.agenda.cancellation.description")}
      actions={
        tone ? (
          <StatusBadge tone={tone.tone}>{t(`dashboard.agenda.cancellation.tone.${tone.key}`)}</StatusBadge>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-3">
        <p className="font-heading text-3xl leading-none font-semibold tracking-tight">
          {rate === null ? "–" : formatRate(rate, language)}
        </p>
        <Meter
          value={rate ?? 0}
          label={t("dashboard.agenda.cancellation.title")}
          valueText={rate === null ? undefined : formatRate(rate, language)}
          color={tone?.color}
        />
        <p className="text-xs text-muted-foreground">
          {t("dashboard.agenda.cancellation.detail", {
            canceled: formatNumber(stats.canceled, language),
            total: formatNumber(stats.total, language),
          })}
        </p>
      </div>
    </ChartCard>
  )
}

/* ---------- destaques ---------- */

function peakIndex(values: number[]): number | null {
  const max = Math.max(...values)
  return max > 0 ? values.indexOf(max) : null
}

function bestProfessional(list: ProfessionalStat[]): { professional: ProfessionalStat; rate: number } | null {
  let best: { professional: ProfessionalStat; rate: number } | null = null
  for (const professional of list) {
    if (professional.total < BEST_PROFESSIONAL_MIN) continue
    const rate = professional.show / professional.total
    if (!best || rate > best.rate) best = { professional, rate }
  }
  return best
}

function HighlightsCard({ stats }: { stats: CalendarStats }) {
  const { t } = useTranslation()
  const language = useLanguage()

  const busiest = peakIndex(stats.byDayOfWeek)
  const peakHour = peakIndex(stats.byHour)
  const best = bestProfessional(stats.byProfessional)

  return (
    <ChartCard title={t("dashboard.agenda.highlights.title")}>
      <KeyValueList
        items={[
          {
            label: t("dashboard.agenda.highlights.avgPerDay"),
            value: formatNumber(stats.avgPerDay, language, { maximumFractionDigits: 1 }),
          },
          {
            label: t("dashboard.agenda.highlights.busiestDay"),
            value: busiest === null ? null : weekdayName(busiest, language, "long"),
          },
          {
            label: t("dashboard.agenda.highlights.peakHour"),
            value: peakHour === null ? null : t("dashboard.hour", { hour: peakHour }),
          },
          {
            label: t("dashboard.agenda.highlights.best"),
            value: best
              ? t("dashboard.agenda.highlights.bestValue", {
                  name: best.professional.name,
                  value: formatPercent(best.rate, language, { maximumFractionDigits: 0 }),
                })
              : null,
          },
          {
            label: t("dashboard.agenda.highlights.pending"),
            value: stats.pending > 0 ? formatNumber(stats.pending, language) : null,
          },
        ]}
      />
    </ChartCard>
  )
}

/* ---------- profissionais ---------- */

function ProfessionalsCard({ stats, className }: { stats: CalendarStats; className?: string }) {
  const { t } = useTranslation()
  const language = useLanguage()

  const list = useMemo(
    () => [...stats.byProfessional].sort((a, b) => b.total - a.total).slice(0, PROFESSIONALS_VISIBLE),
    [stats.byProfessional]
  )
  const top = Math.max(...list.map((professional) => professional.total), 1)

  return (
    <ChartCard
      title={t("dashboard.agenda.professionals.title")}
      description={t("dashboard.agenda.professionals.description")}
      className={className}
      table={
        list.length
          ? {
              columns: [
                { key: "name", label: t("dashboard.agenda.professionals.name") },
                { key: "show", label: t("dashboard.agenda.show"), align: "right" },
                { key: "noShow", label: t("dashboard.agenda.noShow"), align: "right" },
                { key: "total", label: t("dashboard.agenda.kpi.total"), align: "right" },
              ],
              rows: list.map((professional) => ({
                id: professional.id,
                cells: {
                  name: professional.name,
                  show: formatNumber(professional.show, language),
                  noShow: formatNumber(professional.noShow, language),
                  total: formatNumber(professional.total, language),
                },
              })),
            }
          : undefined
      }
    >
      {list.length === 0 ? (
        <CardEmpty title={t("dashboard.agenda.professionals.emptyTitle")} />
      ) : (
        <div className="flex flex-col gap-4">
          <ChartLegend
            items={[
              { key: "show", label: t("dashboard.agenda.show"), color: "var(--viz-show)" },
              { key: "noShow", label: t("dashboard.agenda.noShow"), color: "var(--viz-no-show)" },
              { key: "pending", label: t("dashboard.agenda.pending"), color: "var(--viz-track)" },
            ]}
          />
          <ul className="flex flex-col gap-3">
            {list.map((professional) => {
              const pending = Math.max(professional.total - professional.show - professional.noShow, 0)
              return (
                <li key={professional.id} className="flex flex-col gap-1">
                  <div className="flex items-baseline gap-2 text-sm">
                    <span
                      aria-hidden
                      className="size-2.5 shrink-0 self-center rounded-full"
                      // Cor escolhida pela pessoa, como etiqueta.
                      style={{ backgroundColor: professional.color ?? "var(--viz-context)" }}
                    />
                    <span className="min-w-0 flex-1 truncate">{professional.name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {t("dashboard.agenda.professionals.counts", {
                        count: professional.show,
                        show: formatNumber(professional.show, language),
                        noShow: formatNumber(professional.noShow, language),
                      })}
                    </span>
                    <span className="w-8 text-right font-medium tabular-nums">
                      {formatNumber(professional.total, language)}
                    </span>
                  </div>
                  <div style={{ width: `${(professional.total / top) * 100}%` }}>
                    <SegmentBar
                      label={t("dashboard.agenda.professionals.split", {
                        name: professional.name,
                        show: professional.show,
                        noShow: professional.noShow,
                        total: professional.total,
                      })}
                      parts={[
                        { key: "show", label: "", value: professional.show, color: "var(--viz-show)" },
                        { key: "noShow", label: "", value: professional.noShow, color: "var(--viz-no-show)" },
                        { key: "pending", label: "", value: pending, color: "var(--viz-track)" },
                      ]}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </ChartCard>
  )
}

/* ---------- próximos ---------- */

function useUpcomingLabel() {
  const { t } = useTranslation()
  const language = useLanguage()

  return (start: number) => {
    const date = new Date(start)
    const today = new Date()
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
    const time = formatTime(date, language)
    if (date.toDateString() === today.toDateString()) return t("dashboard.agenda.upcoming.today", { time })
    if (date.toDateString() === tomorrow.toDateString()) return t("dashboard.agenda.upcoming.tomorrow", { time })
    return new Intl.DateTimeFormat(language, {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date)
  }
}

function UpcomingCard({ upcoming, className }: { upcoming: UpcomingBooking[]; className?: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const labelFor = useUpcomingLabel()

  return (
    <ChartCard
      title={t("dashboard.agenda.upcoming.title")}
      description={t("dashboard.agenda.upcoming.description")}
      className={className}
      actions={
        <Button type="button" variant="ghost" size="sm" onClick={() => navigate("/calendar")}>
          {t("dashboard.agenda.open")}
          <ArrowRight />
        </Button>
      }
    >
      {upcoming.length === 0 ? (
        <CardEmpty title={t("dashboard.agenda.upcoming.emptyTitle")} />
      ) : (
        <ul className="-my-1.5 divide-y">
          {upcoming.map((booking) => (
            <li key={booking.id} className="flex items-center gap-3 py-2.5">
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                // Cor escolhida pela pessoa, como etiqueta.
                style={{ backgroundColor: booking.color ?? "var(--viz-context)" }}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm" title={booking.title ?? undefined}>
                  {booking.title || t("dashboard.agenda.upcoming.untitled")}
                </p>
                <p className="text-xs text-muted-foreground">{labelFor(booking.start)}</p>
              </div>
              {booking.attendanceStatus ? (
                <StatusBadge
                  tone={booking.attendanceStatus === "show" ? "success" : "danger"}
                  icon={booking.attendanceStatus === "show" ? <Check /> : <X />}
                >
                  {t(booking.attendanceStatus === "show" ? "dashboard.agenda.show" : "dashboard.agenda.noShow")}
                </StatusBadge>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </ChartCard>
  )
}

/* ---------- horários e dias da semana ---------- */

function HoursCard({ stats }: { stats: CalendarStats }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const peak = peakIndex(stats.byHour)

  const data = useMemo<HighlightPoint[]>(() => {
    const withData = stats.byHour.flatMap((value, hour) => (value > 0 ? [hour] : []))
    if (withData.length === 0) return []
    // Sem as madrugadas vazias, e sempre com um respiro, para o pico não colar na borda.
    const first = Math.max(0, Math.min(withData[0], 8) - 1)
    const last = Math.min(23, Math.max(withData[withData.length - 1], 18) + 1)
    return stats.byHour.slice(first, last + 1).map((value, index) => {
      const hour = first + index
      return {
        id: String(hour),
        tick: t("dashboard.hour", { hour }),
        title: t("dashboard.hour", { hour }),
        value,
      }
    })
  }, [stats.byHour, t])

  return (
    <ChartCard
      title={t("dashboard.agenda.hours.title")}
      description={
        peak === null ? undefined : t("dashboard.agenda.hours.peak", { hour: t("dashboard.hour", { hour: peak }) })
      }
      summary={
        peak === null ? undefined : t("dashboard.agenda.hours.peak", { hour: t("dashboard.hour", { hour: peak }) })
      }
      table={
        data.length
          ? {
              columns: [
                { key: "hour", label: t("dashboard.table.hour") },
                { key: "value", label: t("dashboard.agenda.kpi.total"), align: "right" },
              ],
              rows: data.map((point) => ({
                id: point.id,
                cells: { hour: point.title, value: formatNumber(point.value, language) },
              })),
            }
          : undefined
      }
    >
      {data.length === 0 ? (
        <CardEmpty title={t("dashboard.agenda.hours.emptyTitle")} />
      ) : (
        <HighlightColumns
          data={data}
          highlightId={peak === null ? null : String(peak)}
          unitLabel={(value) => t("dashboard.agenda.bookings", { count: value })}
        />
      )}
    </ChartCard>
  )
}

function WeekdaysCard({ stats }: { stats: CalendarStats }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const peak = peakIndex(stats.byDayOfWeek)

  const data = useMemo<HighlightPoint[]>(
    () =>
      WEEKDAY_ORDER.map((weekday) => ({
        id: String(weekday),
        tick: weekdayName(weekday, language),
        title: weekdayName(weekday, language, "long"),
        value: stats.byDayOfWeek[weekday] ?? 0,
      })),
    [language, stats.byDayOfWeek]
  )
  const peakLabel = peak === null ? null : weekdayName(peak, language, "long")

  return (
    <ChartCard
      title={t("dashboard.agenda.weekdays.title")}
      description={peakLabel ? t("dashboard.agenda.weekdays.peak", { day: peakLabel }) : undefined}
      summary={peakLabel ? t("dashboard.agenda.weekdays.peak", { day: peakLabel }) : undefined}
      table={{
        columns: [
          { key: "day", label: t("dashboard.table.weekday") },
          { key: "value", label: t("dashboard.agenda.kpi.total"), align: "right" },
        ],
        rows: data.map((point) => ({
          id: point.id,
          cells: { day: point.title, value: formatNumber(point.value, language) },
        })),
      }}
    >
      <HighlightColumns
        data={data}
        highlightId={peak === null ? null : String(peak)}
        unitLabel={(value) => t("dashboard.agenda.bookings", { count: value })}
      />
    </ChartCard>
  )
}
