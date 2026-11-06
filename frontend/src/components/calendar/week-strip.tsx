import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import { useMonthCounts } from "@/hooks/calendar/use-calendar-events"
import { instantRangeOfDays, startOfWeekKey } from "@/lib/calendar/calendar-view"
import { addDaysToKey, formatDayKey, gridDateOfDayKey } from "@/lib/calendar/timezone"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/** A semana do dia aberto, no celular: um toque troca o dia, e o ponto diz onde há algo marcado. */
export function WeekStrip({
  value,
  today,
  timeZone,
  onSelect,
}: {
  value: string
  today: string
  timeZone: string
  onSelect: (dayKey: string) => void
}) {
  const { t } = useTranslation()
  const language = useLanguage()
  const weekStart = startOfWeekKey(value)
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, offset) => addDaysToKey(weekStart, offset)),
    [weekStart]
  )
  const range = useMemo(
    () => instantRangeOfDays({ start: weekStart, end: addDaysToKey(weekStart, 7) }, [timeZone]),
    [timeZone, weekStart]
  )
  const { counts } = useMonthCounts(range)

  return (
    <div role="group" aria-label={t("calendar.toolbar.week")} className="grid grid-cols-7 px-2 pb-2">
      {days.map((day) => {
        const selected = day === value
        const isToday = day === today
        const count = counts?.[day] ?? 0
        const fullDate = formatDayKey(day, language)
        return (
          <button
            key={day}
            type="button"
            onClick={() => onSelect(day)}
            aria-current={selected ? "date" : undefined}
            aria-label={
              count > 0 ? t("calendar.mini.dayWithCount", { date: fullDate, count }) : fullDate
            }
            className="group/day flex min-h-14 flex-col items-center gap-0.5 rounded-lg py-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="text-[0.6875rem] text-muted-foreground uppercase">
              {formatDayKey(day, language, { weekday: "narrow" })}
            </span>
            <span
              className={cn(
                "flex size-8 items-center justify-center rounded-full text-sm tabular-nums transition-colors",
                selected
                  ? "bg-primary font-medium text-primary-foreground"
                  : isToday
                    ? "font-semibold text-primary"
                    : "group-active/day:bg-muted"
              )}
            >
              {gridDateOfDayKey(day).getUTCDate()}
            </span>
            <span
              aria-hidden
              className={cn(
                "size-1 rounded-full",
                count > 0 ? (selected ? "bg-primary" : "bg-muted-foreground/50") : "bg-transparent"
              )}
            />
          </button>
        )
      })}
    </div>
  )
}
