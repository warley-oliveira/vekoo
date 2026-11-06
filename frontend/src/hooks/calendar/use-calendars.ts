import { useCallback, useEffect, useMemo } from "react"
import useSWR, { useSWRConfig } from "swr"

import { useApi } from "@/hooks/use-api"
import { apiDelete, apiPatch, apiPost } from "@/lib/api"
import { rememberCalendarZones } from "@/lib/calendar/event-cache"
import type {
  AgendaCalendar,
  CalendarFilterOptions,
  CalendarInput,
} from "@/lib/calendar/types"
import { fetchAllPages } from "@/lib/people/fetch-all-pages"

export const CALENDARS_KEY = "/calendars?perPage=100"
export const CALENDAR_FILTERS_KEY = "/calendar-events/filters"

export function calendarKey(id: string): string {
  return `/calendars/${id}`
}

/** Todos os calendários da organização. */
export function useCalendars() {
  const { data, error, isLoading, mutate } = useSWR<AgendaCalendar[]>(CALENDARS_KEY, () =>
    fetchAllPages<AgendaCalendar>(CALENDARS_KEY, "calendars")
  )

  useEffect(() => {
    if (data) rememberCalendarZones(data)
  }, [data])

  return { calendars: data, error, isLoading, reload: () => mutate() }
}

export function useCalendar(id: string | null | undefined) {
  const { data, error, isLoading, mutate } = useApi<AgendaCalendar>(id ? calendarKey(id) : null)
  return { calendar: data, error, isLoading, reload: () => mutate() }
}

/** Calendários, profissionais, serviços e etiquetas para os filtros, em uma ida só. */
export function useCalendarFilters() {
  const { data, error, isLoading, mutate } = useApi<CalendarFilterOptions>(CALENDAR_FILTERS_KEY)
  return { options: data, error, isLoading, reload: () => mutate() }
}

/** Mudou calendário, profissional ou serviço: a lista e os filtros andam juntos. */
export function useRevalidateCalendars() {
  const { mutate } = useSWRConfig()
  return useCallback(
    () =>
      mutate(
        (key) =>
          typeof key === "string" &&
          (key.startsWith("/calendars") || key === CALENDAR_FILTERS_KEY)
      ),
    [mutate]
  )
}

export function useCalendarMutations() {
  const revalidate = useRevalidateCalendars()

  const createCalendar = useCallback(
    async (input: CalendarInput) => {
      const calendar = await apiPost<AgendaCalendar>("/calendars", { calendar: input })
      await revalidate()
      return calendar
    },
    [revalidate]
  )

  const updateCalendar = useCallback(
    async (id: string, input: CalendarInput) => {
      const calendar = await apiPatch<AgendaCalendar>(`/calendars/${id}`, { calendar: input })
      await revalidate()
      return calendar
    },
    [revalidate]
  )

  /** Devolve para onde mandar a pessoa. Sem credencial no servidor: `googleNotConfigured`. */
  const connectGoogle = useCallback(
    (id: string) =>
      apiPost<{ authorizationUrl: string; connectorId: string }>(
        `/calendars/${id}/google-calendar/connect`
      ),
    []
  )

  const finishGoogle = useCallback(
    async (id: string, code: string, state: string) => {
      const { calendar } = await apiPost<{ calendar: AgendaCalendar }>(
        `/calendars/${id}/google-calendar/callback`,
        { code, state }
      )
      await revalidate()
      return calendar
    },
    [revalidate]
  )

  const disconnectGoogle = useCallback(
    async (id: string) => {
      const { calendar } = await apiDelete<{ calendar: AgendaCalendar }>(
        `/calendars/${id}/google-calendar`
      )
      await revalidate()
      return calendar
    },
    [revalidate]
  )

  return useMemo(
    () => ({ createCalendar, updateCalendar, connectGoogle, finishGoogle, disconnectGoogle }),
    [connectGoogle, createCalendar, disconnectGoogle, finishGoogle, updateCalendar]
  )
}
