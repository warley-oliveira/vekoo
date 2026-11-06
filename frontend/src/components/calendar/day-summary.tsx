import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { ChevronDown } from "lucide-react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Skeleton } from "@/components/ui/skeleton"
import { useCalendarEvents } from "@/hooks/calendar/use-calendar-events"
import { instantRangeOfDays, startOfWeekKey } from "@/lib/calendar/calendar-view"
import { countSituations, eventHeadline, isCanceled } from "@/lib/calendar/event-status"
import {
  addDaysToKey,
  dayKeyOf,
  formatDayKey,
  formatTimeInZone,
  safeTimeZone,
} from "@/lib/calendar/timezone"
import type { CalendarEvent } from "@/lib/calendar/types"
import { useLanguage } from "@/lib/i18n"
import { formatNumber } from "@/lib/format-number"
import { cn } from "@/lib/utils"

type DaySummaryData = {
  dayCount: number
  weekCount: number
  show: number
  noShow: number
  pending: number
  next: CalendarEvent | null
  isLoading: boolean
}

/**
 * O resumo do dia aberto, sobre a semana inteira dele, e não sobre o que está na grade: filtro de
 * situação e visão de um dia só não podem mudar a conta. Sem cancelados.
 */
export function useDaySummary({
  day,
  calendarIds,
  zones,
  selectedZones,
  primaryZone,
}: {
  day: string
  calendarIds: string[]
  zones: Map<string, string>
  selectedZones: string[]
  primaryZone: string
}): DaySummaryData {
  const weekStart = startOfWeekKey(day)
  const range = useMemo(
    () =>
      calendarIds.length
        ? instantRangeOfDays(
            { start: weekStart, end: addDaysToKey(weekStart, 7) },
            selectedZones
          )
        : null,
    [calendarIds.length, selectedZones, weekStart]
  )
  const filters = useMemo(() => ({ calendarIds }), [calendarIds])
  const { events, isLoading } = useCalendarEvents(range, filters)

  // "Próximo" muda sozinho conforme o relógio anda.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])

  return useMemo(() => {
    const zoneFor = (event: CalendarEvent) => safeTimeZone(zones.get(event.calendarId), primaryZone)
    const active = (events ?? []).filter((event) => !isCanceled(event))
    const ofWeek = active.filter((event) => {
      const key = dayKeyOf(event.start, zoneFor(event))
      return key >= weekStart && key < addDaysToKey(weekStart, 7)
    })
    const ofDay = ofWeek.filter((event) => dayKeyOf(event.start, zoneFor(event)) === day)
    const counts = countSituations(ofDay)
    const next = active.find((event) => event.start > now) ?? null

    return {
      dayCount: ofDay.length,
      weekCount: ofWeek.length,
      show: counts.show,
      noShow: counts.no_show,
      pending: counts.pending,
      next,
      isLoading: isLoading && !events,
    }
  }, [day, events, isLoading, now, primaryZone, weekStart, zones])
}

/** Quanto o dia pesa. Sempre em texto, sem cor: é só um recado para quem organiza o dia. */
function loadLabel(count: number): "heavy" | "moderate" | "light" {
  if (count > 8) return "heavy"
  if (count > 4) return "moderate"
  return "light"
}

export function DaySummary({
  summary,
  day,
  today,
  zones,
  primaryZone,
  className,
}: {
  summary: DaySummaryData
  day: string
  today: string
  zones: Map<string, string>
  primaryZone: string
  className?: string
}) {
  const { t } = useTranslation()
  const language = useLanguage()
  const dayTitle =
    day === today
      ? t("calendar.days.today")
      : formatDayKey(day, language, { weekday: "short", day: "numeric", month: "short" })

  return (
    <Collapsible defaultOpen className={cn("min-w-0", className)}>
      <CollapsibleTrigger
        render={
          <button
            type="button"
            className="group/collapse -ml-1 flex h-9 w-full items-center gap-1 rounded-md px-1 text-left text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:h-10"
          />
        }
      >
        <ChevronDown
          aria-hidden
          className="size-4 shrink-0 -rotate-90 text-muted-foreground transition-transform group-data-panel-open/collapse:rotate-0"
        />
        {t("calendar.summary.title")}
      </CollapsibleTrigger>
      <CollapsibleContent>
        {summary.isLoading ? (
          <div aria-hidden className="space-y-2 py-1.5">
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-2/5" />
          </div>
        ) : (
          <dl className="flex flex-col gap-2 pt-1 text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <dt className="truncate text-muted-foreground">{dayTitle}</dt>
              <dd className="shrink-0 tabular-nums">
                <span className="font-medium">
                  {t("calendar.summary.events", {
                    count: summary.dayCount,
                    value: formatNumber(summary.dayCount, language),
                  })}
                </span>
                {summary.dayCount > 0 ? (
                  <span className="text-muted-foreground">
                    {" · "}
                    {t(`calendar.summary.load.${loadLabel(summary.dayCount)}`)}
                  </span>
                ) : null}
              </dd>
            </div>
            {summary.dayCount > 0 ? (
              <div className="flex items-baseline justify-between gap-2">
                <dt className="truncate text-muted-foreground">
                  {t("calendar.summary.attendance")}
                </dt>
                <dd className="shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                  {t("calendar.summary.attendanceValue", {
                    show: summary.show,
                    noShow: summary.noShow,
                    pending: summary.pending,
                  })}
                </dd>
              </div>
            ) : null}
            <div className="flex items-baseline justify-between gap-2">
              <dt className="truncate text-muted-foreground">{t("calendar.summary.week")}</dt>
              <dd className="shrink-0 font-medium tabular-nums">
                {formatNumber(summary.weekCount, language)}
              </dd>
            </div>
            {summary.next ? (
              <div className="min-w-0">
                <dt className="text-muted-foreground">{t("calendar.summary.next")}</dt>
                <dd className="truncate">
                  <span className="tabular-nums">
                    {formatTimeInZone(
                      summary.next.start,
                      safeTimeZone(zones.get(summary.next.calendarId), primaryZone),
                      language
                    )}
                  </span>
                  {" · "}
                  {eventHeadline(summary.next).title || t("calendar.event.untitled")}
                </dd>
              </div>
            ) : null}
          </dl>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}
