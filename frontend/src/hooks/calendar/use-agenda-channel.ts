import { useCallback, useEffect, useRef } from "react"
import { useSWRConfig } from "swr"

import { useChannel } from "@/hooks/use-channel"
import { useDebouncedCallback } from "@/hooks/use-debounced-value"
import {
  applyAttendanceUpdate,
  applyEnrollmentUpdate,
  isVirtualId,
  localCreates,
  parseEventsKey,
  rememberAlias,
  removeEvent,
  swapMaterialized,
  upsertEvent,
  type EventsResponse,
} from "@/lib/calendar/event-cache"
import type {
  AgendaChannelMessage,
  CalendarEvent,
  ClassSessionEvent,
} from "@/lib/calendar/types"
import { useEventCacheWriter, useRevalidateEvents } from "./use-calendar-events"

type AgendaChannelOptions = {
  /** Um evento novo que veio de outra pessoa, ou da automação. */
  onRemoteCreate?: (event: CalendarEvent) => void
  /** Um agendamento mudou: a grade não precisa disto, mas o painel aberto pode. */
  onEventChange?: (event: CalendarEvent) => void
}

/**
 * O tempo real da agenda. O canal é da organização inteira, então cada mensagem é conferida com
 * o período e os filtros de cada chave em cache, em vez de entrar em todas, como na origem.
 */
export function useAgendaChannel({ onRemoteCreate, onEventChange }: AgendaChannelOptions = {}) {
  const { cache, mutate } = useSWRConfig()
  const write = useEventCacheWriter()
  const revalidateEvents = useRevalidateEvents()

  // Relê depois do pico: uma ação em lote manda dezenas de mensagens.
  const revalidateSoon = useDebouncedCallback(() => void revalidateEvents(), 1500)

  const refreshCounts = useDebouncedCallback(() => {
    void mutate(
      (key) => typeof key === "string" && key.startsWith("/calendar-events/month-counts")
    )
  }, 2000)

  const revalidateAttendances = useCallback(() => {
    void mutate((key) => typeof key === "string" && key.startsWith("/class-sessions/"))
    void mutate(
      (key) =>
        typeof key === "string" && key.startsWith("/calendars/") && key.includes("/sessions/")
    )
  }, [mutate])

  /** A etiqueta não vem no evento: só a API sabe se ele ainda passa no filtro. */
  const keysFilterTags = useCallback(() => {
    for (const key of cache.keys()) {
      if (typeof key === "string" && parseEventsKey(key)?.tagIds.length) return true
    }
    return false
  }, [cache])

  /** O evento já estava em alguma lista? Se sim, não é novidade para esta tela. */
  const isKnown = useCallback(
    (id: string) => {
      for (const key of cache.keys()) {
        if (typeof key !== "string" || !parseEventsKey(key)) continue
        const entry = cache.get(key) as { data?: EventsResponse } | undefined
        if (entry?.data?.events.some((event) => event.id === id)) return true
      }
      return false
    },
    [cache]
  )

  const handle = useCallback(
    (message: AgendaChannelMessage) => {
      switch (message.action) {
        case "create":
        case "update": {
          const { event } = message
          const known = isKnown(event.id)

          if (event.type === "class_session") {
            applyCreatedSession(event, write, revalidateSoon, message.action)
          } else {
            write((events, key) => upsertEvent(events, event, key))
          }
          if (keysFilterTags()) revalidateSoon()
          refreshCounts()
          onEventChange?.(event)
          // Aula gravada quase sempre é a calculada que ganhou documento, e não novidade: só
          // agendamento vira aviso.
          if (
            message.action === "create" &&
            event.type === "booking" &&
            !known &&
            localCreates.count === 0
          ) {
            onRemoteCreate?.(event)
          }
          return
        }
        case "destroy": {
          const { event } = message
          // Aula cancelada também chega aqui, e continua na tela, marcada como cancelada.
          if (event.type === "class_session" && event.status === "canceled") {
            write((events, key) => swapMaterialized(events, event, null, key))
          } else {
            write((events) => removeEvent(events, event.id))
          }
          refreshCounts()
          return
        }
        case "attendance_update":
          write((events) => applyAttendanceUpdate(events, message))
          revalidateAttendances()
          return
        case "enrollment_update":
          write((events) => applyEnrollmentUpdate(events, message))
          revalidateAttendances()
          return
      }
    },
    [
      isKnown,
      keysFilterTags,
      onEventChange,
      onRemoteCreate,
      refreshCounts,
      revalidateAttendances,
      revalidateSoon,
      write,
    ]
  )

  const { connected } = useChannel<AgendaChannelMessage>("AgendaChannel", undefined, handle)

  // A conexão caiu e voltou: o que aconteceu no meio só existe na API.
  const everConnected = useRef(false)
  useEffect(() => {
    if (!connected) return
    if (everConnected.current) void revalidateEvents()
    everConnected.current = true
  }, [connected, revalidateEvents])

  return { connected }
}

/** Aula gravada: toma o lugar da calculada, na mesma escrita, sem duplicar nem piscar. */
function applyCreatedSession(
  event: ClassSessionEvent,
  write: ReturnType<typeof useEventCacheWriter>,
  revalidateSoon: () => void,
  action: "create" | "update"
) {
  if (action === "create" && !event.virtual) {
    let replaced = false
    write((events, key) => {
      const next = swapMaterialized(events, event, null, key)
      if (events.some((item) => isVirtualId(item.id) && !next.includes(item))) replaced = true
      for (const item of events) {
        if (isVirtualId(item.id) && !next.includes(item)) rememberAlias(item.id, event.id)
      }
      return next
    })
    // Aula movida para outro dia: a calculada do dia antigo só some relendo o período.
    if (!replaced) revalidateSoon()
    return
  }
  write((events, key) => upsertEvent(events, event, key))
}
