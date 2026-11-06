import { useMemo, useState, type ComponentProps } from "react"
import { useTranslation } from "react-i18next"
import { getDefaultClassNames } from "react-day-picker"

import { useCalendarLocale } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { monthCountsKey, useMonthCounts } from "@/hooks/calendar/use-calendar-events"
import { instantRangeOfDays, startOfMonthKey, visibleDays } from "@/lib/calendar/calendar-view"
import { dayKeyOfLocal, localDateOfDayKey } from "@/lib/calendar/timezone"
import type { MonthCounts } from "@/lib/calendar/types"
import { useLanguage } from "@/lib/i18n"
import { formatNumber } from "@/lib/format-number"
import { cn } from "@/lib/utils"

const MAX_DOTS = 3

/** A cor dos pontos diz o peso do dia, sempre com o número no rótulo: leve, cheio, lotado. */
function dotTone(count: number): string {
  if (count > 6) return "bg-status-danger"
  if (count > 3) return "bg-status-warning"
  return "bg-primary"
}

export type MiniMonthProps = {
  /** O dia aberto. */
  value: string
  today: string
  timeZone: string
  onSelect: (dayKey: string) => void
  className?: string
}

/**
 * O mês à mão: clicar num dia leva a grade até ele. Folhear aqui não mexe na grade, só traz a
 * contagem do mês que apareceu.
 */
export function MiniMonth({ value, today, timeZone, onSelect, className }: MiniMonthProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const locale = useCalendarLocale()

  // O mês exibido acompanha o dia aberto, até a pessoa folhear por conta própria.
  const [browsed, setBrowsed] = useState<{ month: string; from: string } | null>(null)
  const followed = startOfMonthKey(value)
  const shownMonth = browsed && browsed.from === followed ? browsed.month : followed

  const range = useMemo(
    () => instantRangeOfDays(visibleDays("month", shownMonth), [timeZone]),
    [shownMonth, timeZone]
  )
  const { counts } = useMonthCounts(range)

  const monthTotal = useMemo(() => {
    if (!counts) return null
    const prefix = shownMonth.slice(0, 7)
    return Object.entries(counts).reduce(
      (total, [day, count]) => (day.startsWith(prefix) ? total + count : total),
      0
    )
  }, [counts, shownMonth])

  const monthName = new Intl.DateTimeFormat(language, { month: "long", timeZone: "UTC" }).format(
    new Date(`${shownMonth}T12:00:00Z`)
  )

  return (
    <div data-slot="mini-month" data-key={monthCountsKey(range)} className={cn("min-w-0", className)}>
      <Calendar
        mode="single"
        locale={locale}
        required
        selected={localDateOfDayKey(value)}
        today={localDateOfDayKey(today)}
        month={localDateOfDayKey(shownMonth)}
        onMonthChange={(month) =>
          setBrowsed({ month: dayKeyOfLocal(month), from: followed })
        }
        onSelect={(day) => {
          if (!day) return
          setBrowsed(null)
          onSelect(dayKeyOfLocal(day))
        }}
        components={{ DayButton: (props) => <DayWithDots {...props} counts={counts} /> }}
        className="w-full p-0 [--cell-size:--spacing(10)] md:[--cell-size:--spacing(8)]"
        classNames={{ root: cn("w-full", getDefaultClassNames().root) }}
      />
      <p className="mt-2 text-xs text-muted-foreground tabular-nums">
        {monthTotal === null
          ? " "
          : t("calendar.mini.monthTotal", {
              count: monthTotal,
              value: formatNumber(monthTotal, language),
              month: monthName,
            })}
      </p>
    </div>
  )
}

type DayButtonProps = Parameters<
  NonNullable<NonNullable<ComponentProps<typeof Calendar>["components"]>["DayButton"]>
>[0]

function DayWithDots({
  day,
  modifiers,
  counts,
  className,
  ...props
}: DayButtonProps & { counts: MonthCounts | undefined }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const dayKey = dayKeyOfLocal(day.date)
  const count = modifiers.outside ? 0 : (counts?.[dayKey] ?? 0)
  const fullDate = new Intl.DateTimeFormat(language, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(day.date)

  return (
    <Button
      variant="ghost"
      size="icon"
      data-today={modifiers.today || undefined}
      data-selected={modifiers.selected || undefined}
      aria-label={
        count > 0 ? t("calendar.mini.dayWithCount", { date: fullDate, count }) : fullDate
      }
      className={cn(
        "relative aspect-square size-auto w-full min-w-(--cell-size) rounded-md p-0 text-sm font-normal tabular-nums",
        modifiers.outside && "text-muted-foreground/60",
        modifiers.today && !modifiers.selected && "font-semibold text-primary",
        modifiers.selected &&
          "bg-primary font-medium text-primary-foreground hover:bg-primary hover:text-primary-foreground",
        className
      )}
      {...props}
    >
      {day.date.getDate()}
      {count > 0 ? (
        <span aria-hidden className="absolute inset-x-0 bottom-0.5 flex justify-center gap-0.5">
          {Array.from({ length: Math.min(count, MAX_DOTS) }, (_, index) => (
            <span
              key={index}
              className={cn(
                "size-1 rounded-full",
                modifiers.selected ? "bg-primary-foreground" : dotTone(count)
              )}
            />
          ))}
        </span>
      ) : null}
    </Button>
  )
}
