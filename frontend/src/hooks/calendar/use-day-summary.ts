import { useEffect, useMemo, useState } from "react"

import { instantRangeOfDays, startOfWeekKey } from "@/lib/calendar/calendar-view"
import { countSituations, isCanceled } from "@/lib/calendar/event-status"
import { addDaysToKey, dayKeyOf, safeTimeZone } from "@/lib/calendar/timezone"
import type { CalendarEvent } from "@/lib/calendar/types"
import { useCalendarEvents } from "./use-calendar-events"

export type DaySummaryData = {
  dayCount: number
  weekCount: number
  show: number
  noShow: number
  pending: number
  next: CalendarEvent | null
  isLoading: boolean
  failed: boolean
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
  const { events, error, isLoading } = useCalendarEvents(range, filters)

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
      failed: Boolean(error) && !events,
    }
  }, [day, error, events, isLoading, now, primaryZone, weekStart, zones])
}
