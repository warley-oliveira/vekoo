import { useCallback, useMemo } from "react"
import { useSWRConfig } from "swr"

import { useApi } from "@/hooks/use-api"
import { apiDelete, apiPatch, apiPost } from "@/lib/api"
import {
  calendarEventsKey,
  EVENTS_PREFIX,
  localCreates,
  parseEventsKey,
  rememberAlias,
  removeEvent,
  swapMaterialized,
  upsertEvent,
  type EventRange,
  type EventsResponse,
  type ParsedEventsKey,
} from "@/lib/calendar/event-cache"
import type {
  AttendanceStatus,
  AvailabilityResponse,
  BookingEvent,
  BookingInput,
  CalendarEvent,
  CalendarEventFilters,
  ClassSessionEvent,
  ClassSessionInput,
  MonthCounts,
} from "@/lib/calendar/types"

export { calendarEventsKey, EVENTS_PREFIX }

/** Eventos de um período. `range` nulo pula a leitura (nenhum calendário marcado). */
export function useCalendarEvents(range: EventRange | null, filters: CalendarEventFilters) {
  const { data, error, isLoading, isValidating, mutate } = useApi<EventsResponse>(
    range ? calendarEventsKey(range, filters) : null,
    // Sem isto, a grade piscaria vazia a cada semana. Trocar de período mantém a anterior na
    // tela enquanto a nova chega, e a barra de progresso diz que está buscando.
    { keepPreviousData: true, revalidateOnFocus: true }
  )

  return {
    events: data?.events,
    error,
    isLoading,
    isValidating,
    reload: () => mutate(),
  }
}

export function monthCountsKey(range: EventRange): string {
  return `/calendar-events/month-counts?start=${range.start}&end=${range.end}`
}

/** Os pontos do mini calendário. O servidor guarda 2 minutos em cache. */
export function useMonthCounts(range: EventRange | null) {
  const { data, error, isLoading } = useApi<MonthCounts>(range ? monthCountsKey(range) : null, {
    keepPreviousData: true,
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  })
  return { counts: data, error, isLoading }
}

export function availabilityKey(
  calendarId: string,
  params: { serviceId: string; start: number; end: number; professionalId?: string | null }
): string {
  const query = new URLSearchParams({
    serviceId: params.serviceId,
    start: String(params.start),
    end: String(params.end),
  })
  if (params.professionalId) query.set("professionalId", params.professionalId)
  return `/calendars/${calendarId}/availability?${query}`
}

/** Horários livres de um serviço. Sem horário no período, a API olha 30 dias à frente. */
export function useAvailability(
  calendarId: string | null | undefined,
  params: { serviceId?: string | null; start: number; end: number; professionalId?: string | null }
) {
  const key =
    calendarId && params.serviceId
      ? availabilityKey(calendarId, {
          serviceId: params.serviceId,
          start: params.start,
          end: params.end,
          professionalId: params.professionalId,
        })
      : null
  const { data, error, isLoading, isValidating, mutate } = useApi<AvailabilityResponse>(key, {
    keepPreviousData: true,
    revalidateOnFocus: false,
  })
  return { availability: key ? data : undefined, error, isLoading, isValidating, reload: () => mutate() }
}

type ApplyToKey = (events: CalendarEvent[], key: ParsedEventsKey) => CalendarEvent[]

/**
 * Escreve em toda chave de período em cache, sem revalidar. Quem chama é a tela (otimista) e o
 * tempo real, então um `mutate` no meio de uma leitura descarta a resposta antiga, em vez de
 * deixar o que ela trouxe sobrescrever o que acabou de mudar.
 */
export function useEventCacheWriter() {
  const { cache, mutate } = useSWRConfig()

  return useCallback(
    (apply: ApplyToKey) => {
      for (const key of cache.keys()) {
        if (typeof key !== "string") continue
        const parsed = parseEventsKey(key)
        if (!parsed) continue
        void mutate<EventsResponse>(
          key,
          (current) => {
            if (!current) return current
            const events = apply(current.events, parsed)
            return events === current.events ? current : { events }
          },
          { revalidate: false }
        )
      }
    },
    [cache, mutate]
  )
}

/** Relê os períodos em cache. O que não está na tela revalida na próxima vez que aparecer. */
export function useRevalidateEvents() {
  const { mutate } = useSWRConfig()
  return useCallback(
    // Sem dados no `mutate`: só revalida, e o que está em cache fica até a resposta chegar.
    () => mutate((key) => typeof key === "string" && key.startsWith("/calendar-events")),
    [mutate]
  )
}

function bookingPath(id: string) {
  return `/calendar-events/${id}`
}

function sessionPath(session: Pick<ClassSessionEvent, "id" | "calendarId" | "classGroupId">) {
  return `/calendars/${session.calendarId}/class-groups/${session.classGroupId}/sessions/${session.id}`
}

/** Criar, remarcar, comparecimento, cancelar e arquivar, com a volta se a API recusar. */
export function useEventMutations() {
  const write = useEventCacheWriter()
  const revalidate = useRevalidateEvents()
  const putEvent = useCallback(
    (event: CalendarEvent) => write((events, key) => upsertEvent(events, event, key)),
    [write]
  )

  const createBooking = useCallback(
    async (input: BookingInput) => {
      localCreates.count += 1
      try {
        const booking = await apiPost<BookingEvent>("/calendar-events", { event: input })
        putEvent(booking)
        void revalidate()
        return booking
      } finally {
        localCreates.count -= 1
      }
    },
    [putEvent, revalidate]
  )

  const updateBooking = useCallback(
    async (id: string, input: BookingInput) => {
      const booking = await apiPatch<BookingEvent>(bookingPath(id), { event: input })
      putEvent(booking)
      return booking
    },
    [putEvent]
  )

  /** Arrastar: a mudança já está na tela, e volta se a API recusar. */
  const rescheduleBooking = useCallback(
    async (event: BookingEvent, start: number, end: number) => {
      putEvent({ ...event, start, end })
      try {
        const booking = await apiPatch<BookingEvent>(bookingPath(event.id), {
          event: { start, end },
        })
        putEvent(booking)
        return booking
      } catch (cause) {
        putEvent(event)
        throw cause
      }
    },
    [putEvent]
  )

  /** Marcar de novo o que já está marcado desmarca: a tela manda `null`. */
  const setAttendance = useCallback(
    async (event: BookingEvent, attendanceStatus: AttendanceStatus | null) => {
      putEvent({ ...event, attendanceStatus })
      try {
        const booking = await apiPatch<BookingEvent>(bookingPath(event.id), {
          event: { attendanceStatus },
        })
        putEvent(booking)
        return booking
      } catch (cause) {
        putEvent(event)
        throw cause
      }
    },
    [putEvent]
  )

  const cancelBooking = useCallback(
    async (event: BookingEvent) => {
      const booking = await apiPatch<BookingEvent>(bookingPath(event.id), {
        event: { status: "canceled" },
      })
      putEvent(booking)
      return booking
    },
    [putEvent]
  )

  /** `DELETE` arquiva: some da tela e do Google, e continua no banco, com o histórico. */
  const archiveBooking = useCallback(
    async (event: BookingEvent) => {
      await apiDelete(bookingPath(event.id))
      write((events) => removeEvent(events, event.id))
    },
    [write]
  )

  const enrollSequence = useCallback(
    async (event: BookingEvent, sequenceId: string) => {
      const result = await apiPost<{
        enrolledSequenceId: string
        sequenceEnrolledAt: number
        steps: { stepId: string; runAt: number }[]
      }>(`${bookingPath(event.id)}/sequence`, { sequenceId })
      putEvent({
        ...event,
        enrolledSequenceId: result.enrolledSequenceId,
        sequenceEnrolledAt: result.sequenceEnrolledAt,
      })
      void revalidate()
      return result
    },
    [putEvent, revalidate]
  )

  const unenrollSequence = useCallback(
    async (event: BookingEvent) => {
      await apiDelete(`${bookingPath(event.id)}/sequence`)
      putEvent({ ...event, enrolledSequenceId: null, sequenceEnrolledAt: null })
      void revalidate()
    },
    [putEvent, revalidate]
  )

  /* ---------- aulas ---------- */

  /**
   * Aula calculada ganha id ao ser gravada. A troca é feita na mesma escrita da lista, e o id
   * antigo fica guardado, para quem está com a aula aberta continuar achando ela.
   */
  const putSession = useCallback(
    (saved: ClassSessionEvent, previousId: string | null) => {
      if (previousId) rememberAlias(previousId, saved.id)
      write((events, key) => swapMaterialized(events, saved, previousId, key))
    },
    [write]
  )

  const createSession = useCallback(
    async (calendarId: string, classGroupId: string, input: ClassSessionInput) => {
      localCreates.count += 1
      try {
        const saved = await apiPost<ClassSessionEvent>(
          `/calendars/${calendarId}/class-groups/${classGroupId}/sessions`,
          { classSession: input }
        )
        putSession(saved, null)
        return saved
      } finally {
        localCreates.count -= 1
      }
    },
    [putSession]
  )

  const updateSession = useCallback(
    async (session: ClassSessionEvent, input: ClassSessionInput) => {
      const saved = await apiPatch<ClassSessionEvent>(sessionPath(session), { classSession: input })
      putSession(saved, session.id)
      return saved
    },
    [putSession]
  )

  /** Arrastar uma aula: mesma ideia do agendamento, com a troca de id ao final. */
  const moveSession = useCallback(
    async (session: ClassSessionEvent, start: number, end: number) => {
      putEvent({ ...session, start, end })
      try {
        const saved = await apiPatch<ClassSessionEvent>(sessionPath(session), {
          classSession: { start, end },
        })
        putSession(saved, session.id)
        return saved
      } catch (cause) {
        putEvent(session)
        throw cause
      }
    },
    [putEvent, putSession]
  )

  const cancelSession = useCallback(
    async (session: ClassSessionEvent) => {
      const saved = await apiPost<ClassSessionEvent>(`${sessionPath(session)}/cancel`)
      putSession(saved, session.id)
      return saved
    },
    [putSession]
  )

  return useMemo(
    () => ({
      createBooking,
      updateBooking,
      rescheduleBooking,
      setAttendance,
      cancelBooking,
      archiveBooking,
      enrollSequence,
      unenrollSequence,
      createSession,
      updateSession,
      moveSession,
      cancelSession,
      putEvent,
      putSession,
    }),
    [
      archiveBooking,
      cancelBooking,
      cancelSession,
      createBooking,
      createSession,
      enrollSequence,
      moveSession,
      putEvent,
      putSession,
      rescheduleBooking,
      setAttendance,
      unenrollSequence,
      updateBooking,
      updateSession,
    ]
  )
}
