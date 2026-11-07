import { useTranslation } from "react-i18next"
import { ChevronDown } from "lucide-react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Skeleton } from "@/components/ui/skeleton"
import type { DaySummaryData } from "@/hooks/calendar/use-day-summary"
import { eventHeadline } from "@/lib/calendar/event-status"
import { dayKeyOf, formatDayKey, formatTimeInZone, safeTimeZone } from "@/lib/calendar/timezone"
import type { CalendarEvent } from "@/lib/calendar/types"
import { useLanguage } from "@/lib/i18n"
import { formatNumber } from "@/lib/format-number"
import { cn } from "@/lib/utils"

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

  // O próximo pode não ser hoje: sem o dia, "10:00" enganaria.
  const nextWhen = (event: CalendarEvent) => {
    const zone = safeTimeZone(zones.get(event.calendarId), primaryZone)
    const time = formatTimeInZone(event.start, zone, language)
    const eventDay = dayKeyOf(event.start, zone)
    return eventDay === today
      ? time
      : `${formatDayKey(eventDay, language, { weekday: "short" })} ${time}`
  }

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
        {summary.failed ? (
          <p className="pt-1 text-sm text-muted-foreground">{t("calendar.summary.failed")}</p>
        ) : summary.isLoading ? (
          <div aria-hidden className="space-y-2 py-1.5">
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-2/5" />
          </div>
        ) : (
          <dl className="flex flex-col gap-3 pt-1 text-sm">
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground first-letter:uppercase">{dayTitle}</dt>
              <dd className="tabular-nums">
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
              {summary.dayCount > 0 ? (
                <dd className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                  {t("calendar.summary.attendanceValue", {
                    show: summary.show,
                    noShow: summary.noShow,
                    pending: summary.pending,
                  })}
                </dd>
              ) : null}
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="truncate text-xs text-muted-foreground">{t("calendar.summary.week")}</dt>
              <dd className="shrink-0 font-medium tabular-nums">
                {formatNumber(summary.weekCount, language)}
              </dd>
            </div>
            {summary.next ? (
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">{t("calendar.summary.next")}</dt>
                <dd className="truncate">
                  <span className="tabular-nums">{nextWhen(summary.next)}</span>
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
