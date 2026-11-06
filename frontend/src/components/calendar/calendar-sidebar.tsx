import { CalendarList, type CalendarListProps } from "./calendar-list"
import { DaySummary, type useDaySummary } from "./day-summary"
import { MiniMonth } from "./mini-month"

/** O mês, os calendários e o resumo do dia: inline no desktop, em painel no celular e no tablet. */
export function CalendarSidebar({
  day,
  today,
  timeZone,
  zones,
  summary,
  onSelectDay,
  calendarList,
}: {
  day: string
  today: string
  timeZone: string
  zones: Map<string, string>
  summary: ReturnType<typeof useDaySummary>
  onSelectDay: (dayKey: string) => void
  calendarList: CalendarListProps
}) {
  return (
    <div className="flex flex-col gap-5">
      <MiniMonth value={day} today={today} timeZone={timeZone} onSelect={onSelectDay} />
      <CalendarList {...calendarList} />
      <DaySummary
        summary={summary}
        day={day}
        today={today}
        zones={zones}
        primaryZone={timeZone}
      />
    </div>
  )
}
