import { useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router"

import { useIsMobile } from "@/hooks/use-is-mobile"
import { useLocalStorage } from "@/hooks/use-local-storage"
import {
  instantRangeOfDays,
  isCalendarView,
  PHONE_VIEWS,
  stepAnchor,
  todayKey,
  visibleDays,
  type CalendarView,
} from "@/lib/calendar/calendar-view"
import { SITUATIONS, type Situation } from "@/lib/calendar/event-status"
import { isDayKey, safeTimeZone } from "@/lib/calendar/timezone"
import type { AgendaCalendar } from "@/lib/calendar/types"

const VIEW_STORAGE_KEY = "vekoo.calendar.view.v1"
const CALENDARS_STORAGE_KEY = "vekoo.calendar.selected.v1"

// Tudo o que define a tela mora no endereço: recarregar não perde o lugar, e o link leva o colega
// para o mesmo dia e os mesmos filtros. A visão e os calendários marcados também ficam no
// aparelho, porque quem abre a agenda todo dia quer encontrá-la como deixou.

function parseList(value: string | null): string[] {
  return value ? value.split(",").filter(Boolean) : []
}

export type CalendarScreenFilters = {
  professionalIds: string[]
  serviceIds: string[]
  tagIds: string[]
  situations: Situation[]
}

export function useCalendarScreen(calendars: AgendaCalendar[] | undefined) {
  const isPhone = useIsMobile()
  const [params, setParams] = useSearchParams()
  const [storedView, setStoredView] = useLocalStorage<string | null>(VIEW_STORAGE_KEY, null)
  const [storedCalendars, setStoredCalendars] = useLocalStorage<string[] | null>(
    CALENDARS_STORAGE_KEY,
    null
  )

  const setParam = useCallback(
    (updates: Record<string, string | null>) => {
      setParams(
        (current) => {
          for (const [name, value] of Object.entries(updates)) {
            if (value) current.set(name, value)
            else current.delete(name)
          }
          return current
        },
        { replace: true }
      )
    },
    [setParams]
  )

  /* ---------- calendários marcados ---------- */

  const calendarsParam = params.get("calendars")
  const selectedCalendarIds = useMemo(() => {
    if (!calendars) return []
    const known = new Set(calendars.map((calendar) => calendar.id))
    // Parâmetro presente e vazio é escolha: nenhum marcado. Ausente, vale o que ficou no aparelho.
    const wanted =
      calendarsParam !== null ? parseList(calendarsParam) : (storedCalendars ?? [...known])
    return wanted.filter((id) => known.has(id))
  }, [calendars, calendarsParam, storedCalendars])

  const setSelectedCalendarIds = useCallback(
    (ids: string[]) => {
      setStoredCalendars(ids)
      setParams(
        (current) => {
          current.set("calendars", ids.join(","))
          return current
        },
        { replace: true }
      )
    },
    [setParams, setStoredCalendars]
  )

  const selectedCalendars = useMemo(
    () => (calendars ?? []).filter((calendar) => selectedCalendarIds.includes(calendar.id)),
    [calendars, selectedCalendarIds]
  )

  /* ---------- fusos ---------- */

  const zones = useMemo(
    () =>
      new Map(
        (calendars ?? []).map((calendar) => [calendar.id, safeTimeZone(calendar.timeZone)] as const)
      ),
    [calendars]
  )

  // O fuso de "hoje" e da linha da hora: o do primeiro calendário marcado.
  const primaryZone = safeTimeZone(
    selectedCalendars[0]?.timeZone ?? calendars?.[0]?.timeZone,
    Intl.DateTimeFormat().resolvedOptions().timeZone
  )

  const selectedZones = useMemo(() => {
    const unique = new Set(selectedCalendars.map((calendar) => safeTimeZone(calendar.timeZone)))
    return unique.size ? [...unique] : [primaryZone]
  }, [primaryZone, selectedCalendars])

  /* ---------- hoje, que muda sem ninguém tocar na tela ---------- */

  const [today, setToday] = useState(() => todayKey(primaryZone))
  useEffect(() => {
    const refresh = () => setToday(todayKey(primaryZone))
    refresh()
    const timer = setInterval(refresh, 60_000)
    return () => clearInterval(timer)
  }, [primaryZone])

  /* ---------- visão e dia ---------- */

  const viewParam = params.get("view")
  const view = useMemo<CalendarView>(() => {
    const wanted = isCalendarView(viewParam)
      ? viewParam
      : isCalendarView(storedView)
        ? storedView
        : isPhone
          ? "agenda"
          : "week"
    // Link de semana aberto no celular: o dia é o que cabe.
    if (isPhone && !PHONE_VIEWS.includes(wanted)) return "day"
    return wanted
  }, [isPhone, storedView, viewParam])

  const dateParam = params.get("date")
  const anchor = isDayKey(dateParam) ? dateParam : today

  const setView = useCallback(
    (next: CalendarView) => {
      setStoredView(next)
      setParam({ view: next })
    },
    [setParam, setStoredView]
  )

  const goToDay = useCallback((dayKey: string) => setParam({ date: dayKey }), [setParam])

  const step = useCallback(
    (direction: 1 | -1) => setParam({ date: stepAnchor(view, anchor, direction, isPhone) }),
    [anchor, isPhone, setParam, view]
  )

  /** Abre um dia na visão que mostra o dia: mês não diz nada sobre o horário. */
  const openDay = useCallback(
    (dayKey: string) => setParam({ date: dayKey, view: "day" }),
    [setParam]
  )

  const days = useMemo(() => visibleDays(view, anchor), [anchor, view])
  const range = useMemo(
    () => (selectedCalendarIds.length ? instantRangeOfDays(days, selectedZones) : null),
    [days, selectedCalendarIds.length, selectedZones]
  )

  /* ---------- filtros ---------- */

  const filters = useMemo<CalendarScreenFilters>(
    () => ({
      professionalIds: parseList(params.get("professionals")),
      serviceIds: parseList(params.get("services")),
      tagIds: parseList(params.get("tags")),
      situations: parseList(params.get("situations")).filter((value): value is Situation =>
        SITUATIONS.includes(value as Situation)
      ),
    }),
    [params]
  )

  const setFilter = useCallback(
    (name: "professionals" | "services" | "tags" | "situations", values: string[]) =>
      setParam({ [name]: values.length ? values.join(",") : null }),
    [setParam]
  )

  const clearFilters = useCallback(
    () => setParam({ professionals: null, services: null, tags: null, situations: null }),
    [setParam]
  )

  const activeFilterCount =
    (filters.professionalIds.length ? 1 : 0) +
    (filters.serviceIds.length ? 1 : 0) +
    (filters.tagIds.length ? 1 : 0) +
    (filters.situations.length ? 1 : 0)

  return {
    isPhone,
    today,
    view,
    setView,
    anchor,
    goToDay,
    openDay,
    step,
    goToToday: () => setParam({ date: null }),
    days,
    range,
    zones,
    primaryZone,
    selectedZones,
    selectedCalendars,
    selectedCalendarIds,
    setSelectedCalendarIds,
    filters,
    setFilter,
    clearFilters,
    activeFilterCount,
  }
}
