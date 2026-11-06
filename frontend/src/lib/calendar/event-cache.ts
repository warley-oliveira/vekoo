import { dayKeyOf, safeTimeZone } from "./timezone"
import type {
  AttendanceSummary,
  CalendarEvent,
  CalendarEventFilters,
  ClassSessionEvent,
} from "./types"

// A grade lê `GET /calendar-events` por período e filtro, e cada combinação é uma chave do SWR.
// Tudo o que muda um evento (a própria tela ou o tempo real) precisa valer em todas as chaves em
// cache de uma vez, senão voltar para a semana anterior mostraria o estado antigo. Estas funções
// são puras: recebem a lista de uma chave e devolvem a nova.

export const EVENTS_PREFIX = "/calendar-events?"

export type EventRange = { start: number; end: number }

export type EventsResponse = { events: CalendarEvent[] }

export function calendarEventsKey(range: EventRange, filters: CalendarEventFilters = {}): string {
  const params = new URLSearchParams({ start: String(range.start), end: String(range.end) })
  // Ordenados: a mesma seleção em outra ordem não vira outra chave.
  const lists: [keyof CalendarEventFilters, string][] = [
    ["calendarIds", "calendarIds"],
    ["professionalIds", "professionalIds"],
    ["serviceIds", "serviceIds"],
    ["tagIds", "tagIds"],
  ]
  for (const [field, param] of lists) {
    const ids = filters[field]
    if (ids?.length) params.set(param, [...ids].sort().join(","))
  }
  return `${EVENTS_PREFIX}${params}`
}

export type ParsedEventsKey = EventRange & Required<CalendarEventFilters>

/** Só as chaves de período: `?chatId=` é do painel do chat, e revalida por outro evento. */
export function parseEventsKey(key: string): ParsedEventsKey | null {
  if (!key.startsWith(EVENTS_PREFIX)) return null
  const params = new URLSearchParams(key.slice(EVENTS_PREFIX.length))
  const start = Number(params.get("start"))
  const end = Number(params.get("end"))
  if (!start || !end) return null
  const list = (name: string) => params.get(name)?.split(",").filter(Boolean) ?? []
  return {
    start,
    end,
    calendarIds: list("calendarIds"),
    professionalIds: list("professionalIds"),
    serviceIds: list("serviceIds"),
    tagIds: list("tagIds"),
  }
}

/**
 * O evento pertence a esta chave? Etiqueta não dá para conferir aqui, porque o evento não traz as
 * etiquetas da conversa: quem chama relê as chaves com `tagIds`.
 */
export function eventMatchesKey(event: CalendarEvent, key: ParsedEventsKey): boolean {
  if (event.status === "archived") return false
  if (event.start >= key.end) return false
  // Fim igual ao início é aceito pela API: o evento sem duração ainda ocupa o instante.
  if (Math.max(event.end, event.start + 1) <= key.start) return false
  if (key.calendarIds.length && !key.calendarIds.includes(event.calendarId)) return false

  const narrowed = key.professionalIds.length || key.serviceIds.length || key.tagIds.length
  if (event.type === "class_session") return !narrowed

  if (key.professionalIds.length && !key.professionalIds.includes(event.professionalId ?? "")) {
    return false
  }
  if (key.serviceIds.length && !key.serviceIds.includes(event.serviceId ?? "")) return false
  return true
}

function byStart(a: CalendarEvent, b: CalendarEvent) {
  return a.start - b.start || a.id.localeCompare(b.id)
}

/** Grava o evento na lista, ou o tira, se ele deixou de pertencer à chave. */
export function upsertEvent(
  events: CalendarEvent[],
  event: CalendarEvent,
  key: ParsedEventsKey
): CalendarEvent[] {
  const others = events.filter((item) => item.id !== event.id)
  if (!eventMatchesKey(event, key)) {
    return others.length === events.length ? events : others
  }
  return [...others, event].sort(byStart)
}

export function removeEvent(events: CalendarEvent[], id: string): CalendarEvent[] {
  const others = events.filter((item) => item.id !== id)
  return others.length === events.length ? events : others
}

/* ---------- aula calculada ---------- */

export function isVirtualId(id: string): boolean {
  return id.startsWith("vcs_")
}

/**
 * Uma aula calculada ganha id novo quando é materializada. As duas nunca podem aparecer juntas:
 * a troca acontece na mesma escrita da lista, e a tela não pisca nem duplica.
 */
export function swapMaterialized(
  events: CalendarEvent[],
  saved: ClassSessionEvent,
  previousId: string | null,
  key: ParsedEventsKey
): CalendarEvent[] {
  const zone = safeTimeZone(zoneOfCalendar(saved.calendarId))
  const savedDay = dayKeyOf(saved.start, zone)

  const others = events.filter((item) => {
    if (item.id === saved.id || item.id === previousId) return false
    if (item.type !== "class_session" || !item.virtual) return true
    const isTwin =
      item.classGroupId === saved.classGroupId &&
      item.scheduleDayOfWeek === saved.scheduleDayOfWeek &&
      item.scheduleWindowStart === saved.scheduleWindowStart &&
      dayKeyOf(item.start, zone) === savedDay
    return !isTwin
  })

  return eventMatchesKey(saved, key) ? [...others, saved].sort(byStart) : others
}

// A lista não sabe o fuso; quem sabe é o calendário. Quem conhece o mapa registra aqui, ao
// carregar os calendários, para o tempo real comparar dias sem depender de componente montado.
const calendarZones = new Map<string, string>()

export function rememberCalendarZones(calendars: { id: string; timeZone: string }[]) {
  for (const calendar of calendars) calendarZones.set(calendar.id, calendar.timeZone)
}

export function zoneOfCalendar(calendarId: string | null | undefined): string | null {
  return calendarId ? (calendarZones.get(calendarId) ?? null) : null
}

/* ---------- o que a aula aberta precisa para seguir a troca de id ---------- */

const aliases = new Map<string, string>()

/** A aula calculada virou um documento: quem guardou o id antigo continua achando ela. */
export function rememberAlias(previousId: string, savedId: string) {
  if (previousId !== savedId) aliases.set(previousId, savedId)
}

export function resolveEventId(id: string): string {
  return aliases.get(id) ?? id
}

/**
 * Há alguma criação desta tela em voo? O tempo real pode chegar antes da resposta, e aí a tela
 * sabe que o "novo" é dela mesma, sem avisar a própria pessoa.
 */
export const localCreates = { count: 0 }

/* ---------- atualizações parciais das aulas ---------- */

/** Presença marcada: o resumo é daquela aula, e a contagem de inscritos vale para o horário. */
export function applyAttendanceUpdate(
  events: CalendarEvent[],
  message: {
    classSessionId: string
    classGroupId: string
    scheduleDayOfWeek: number | null
    scheduleWindowStart: string | null
    attendanceSummary: AttendanceSummary
    enrollmentCount?: number
  }
): CalendarEvent[] {
  let changed = false
  const next = events.map((event) => {
    if (event.type !== "class_session") return event
    const sameSession = event.id === message.classSessionId
    const sameSlot =
      event.classGroupId === message.classGroupId &&
      event.scheduleDayOfWeek === message.scheduleDayOfWeek &&
      event.scheduleWindowStart === message.scheduleWindowStart
    if (!sameSession && !sameSlot) return event

    const enrollmentCount = message.enrollmentCount ?? event.enrollmentCount
    if (!sameSession && enrollmentCount === event.enrollmentCount) return event
    changed = true
    return {
      ...event,
      enrollmentCount,
      attendanceSummary: sameSession ? message.attendanceSummary : event.attendanceSummary,
    }
  })
  return changed ? next : events
}

/** Inscrição mudou. Com `scheduleDayOfWeek` nulo, a inscrição é da turma inteira. */
export function applyEnrollmentUpdate(
  events: CalendarEvent[],
  message: {
    classGroupId: string
    scheduleDayOfWeek: number | null
    scheduleWindowStart: string | null
    enrollmentCount: number
  }
): CalendarEvent[] {
  let changed = false
  const next = events.map((event) => {
    if (event.type !== "class_session" || event.classGroupId !== message.classGroupId) return event
    const wholeGroup = message.scheduleDayOfWeek === null
    const sameSlot =
      event.scheduleDayOfWeek === message.scheduleDayOfWeek &&
      event.scheduleWindowStart === message.scheduleWindowStart
    if (!wholeGroup && !sameSlot) return event
    if (event.enrollmentCount === message.enrollmentCount) return event
    changed = true
    return { ...event, enrollmentCount: message.enrollmentCount }
  })
  return changed ? next : events
}
