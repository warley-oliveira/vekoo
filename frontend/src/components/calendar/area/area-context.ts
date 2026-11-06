import { createContext, useContext } from "react"

import type { AgendaCalendar } from "@/lib/calendar/types"

type CalendarAreaValue = {
  calendar: AgendaCalendar
  reload: () => unknown
}

export const CalendarAreaContext = createContext<CalendarAreaValue | null>(null)

/** O calendário aberto em `/calendar/:calendarId/*`. Só existe dentro do `area-layout`. */
export function useCalendarArea(): CalendarAreaValue {
  const value = useContext(CalendarAreaContext)
  if (!value) throw new Error("useCalendarArea fora de CalendarAreaContext")
  return value
}
