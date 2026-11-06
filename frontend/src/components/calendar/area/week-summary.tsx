import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import type { ScheduleDay } from "@/lib/calendar/types"
import { capitalizeFirstLetter } from "@/lib/date-format"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { formatDaySet, formatWindows, groupWeek } from "./week-schedule"

/** Quantas variações cabem num card antes de virar "e mais 2 variações". */
const MAX_GROUPS = 2

/** A semana em poucas linhas: "Seg. a sex.: 09:00 – 12:00 e 13:00 – 18:00". */
export function WeekSummary({
  days,
  emptyLabel,
  className,
}: {
  days: ScheduleDay[]
  emptyLabel: string
  className?: string
}) {
  const { t } = useTranslation()
  const language = useLanguage()
  const groups = useMemo(() => groupWeek(days), [days])

  if (groups.length === 0) {
    return <p className={cn("text-sm text-muted-foreground", className)}>{emptyLabel}</p>
  }

  const hidden = groups.length - MAX_GROUPS

  return (
    <ul className={cn("flex flex-col gap-0.5 text-sm", className)}>
      {groups.slice(0, MAX_GROUPS).map((group) => (
        <li key={group.days.join("-")} className="text-pretty">
          <span className="font-medium">
            {capitalizeFirstLetter(
              formatDaySet(group.days, language, (from, to) =>
                t("calendar.schedule.dayRange", { from, to })
              )
            )}
          </span>{" "}
          <span className="text-muted-foreground tabular-nums">
            {formatWindows(group.windows, language)}
          </span>
        </li>
      ))}
      {hidden > 0 ? (
        <li className="text-xs text-muted-foreground">
          {t("calendar.schedule.moreGroups", { count: hidden })}
        </li>
      ) : null}
    </ul>
  )
}
