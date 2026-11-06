import { safeTimeZone, wallTimeOf } from "./timezone"
import type { BookingEvent, CalendarEvent } from "./types"

// O que a tela diz sobre um evento, num lugar só: grade, agenda, prévia e painel falam igual.

/** Os filtros de situação. Um evento pode estar em mais de um: ativo e pendente, por exemplo. */
export type Situation = "active" | "show" | "no_show" | "pending" | "canceled"

export const SITUATIONS: Situation[] = ["active", "pending", "show", "no_show", "canceled"]

function attendanceOf(event: CalendarEvent) {
  return event.type === "booking" ? event.attendanceStatus : null
}

/**
 * Cancelado não entra em nenhuma outra situação, mesmo com presença marcada antes de cancelar.
 * Aula não tem comparecimento próprio: quando não está cancelada, conta como ativa e pendente.
 */
export function situationsOf(event: CalendarEvent): Situation[] {
  if (event.status === "canceled") return ["canceled"]
  const attendance = attendanceOf(event)
  if (attendance === "show") return ["active", "show"]
  if (attendance === "no_show") return ["active", "no_show"]
  return ["active", "pending"]
}

export function matchesSituations(event: CalendarEvent, selected: Situation[]): boolean {
  if (selected.length === 0) return true
  const own = situationsOf(event)
  return selected.some((situation) => own.includes(situation))
}

export function countSituations(events: CalendarEvent[]): Record<Situation, number> {
  const counts: Record<Situation, number> = {
    active: 0,
    show: 0,
    no_show: 0,
    pending: 0,
    canceled: 0,
  }
  for (const event of events) {
    for (const situation of situationsOf(event)) counts[situation] += 1
  }
  return counts
}

export function isCanceled(event: CalendarEvent): boolean {
  return event.status === "canceled"
}

export function isPastEvent(event: CalendarEvent, now = Date.now()): boolean {
  return Math.max(event.end, event.start) < now
}

/** Passou e ninguém marcou se a pessoa veio: é o que a tela lembra de resolver. */
export function needsAttendance(event: CalendarEvent, now = Date.now()): boolean {
  return (
    event.type === "booking" &&
    !isCanceled(event) &&
    !event.attendanceStatus &&
    isPastEvent(event, now)
  )
}

/** Nome padrão que a API monta: "serviço - contato & profissional". */
function defaultBookingTitle(event: BookingEvent): string {
  const people = [event.userName, event.professionalName].filter(Boolean).join(" & ")
  return [event.serviceName, people].filter(Boolean).join(" - ")
}

/** O título é da pessoa, ou é o que a API montou? */
export function hasCustomTitle(event: BookingEvent): boolean {
  return Boolean(event.title) && event.title !== defaultBookingTitle(event)
}

/**
 * O que vai em destaque numa linha ou num bloco estreito. Quem olha a agenda procura a pessoa:
 * com o título padrão, o contato vem na frente e o serviço fica no apoio.
 */
export function bookingHeadline(event: BookingEvent): { title: string; detail: string | null } {
  if (hasCustomTitle(event)) {
    return {
      title: event.title,
      detail: [event.userName, event.serviceName].filter(Boolean).join(" · ") || null,
    }
  }
  return {
    title: event.userName || event.serviceName || event.title,
    detail: event.userName ? event.serviceName : null,
  }
}

export function eventHeadline(event: CalendarEvent): { title: string; detail: string | null } {
  if (event.type === "booking") return bookingHeadline(event)
  return {
    title: event.title || event.classGroupName,
    detail:
      event.title && event.title !== event.classGroupName ? event.classGroupName : event.instructorName,
  }
}

/** Dia inteiro não é um campo da API: é o que começa à meia-noite e vai até o fim do dia. */
export function isAllDayEvent(start: number, end: number, timeZone: string): boolean {
  const zone = safeTimeZone(timeZone)
  const from = wallTimeOf(start, zone)
  const to = wallTimeOf(end, zone)
  return (
    from.hour === 0 &&
    from.minute === 0 &&
    from.year === to.year &&
    from.month === to.month &&
    from.day === to.day &&
    (to.hour === 23 && to.minute >= 50)
  )
}

/* ---------- ocupação da turma ---------- */

export type OccupancyTone = "free" | "almost" | "full"

const ALMOST_FULL = 0.8

/** Sem limite, nada a dizer: o número só aparece com `maxStudents` maior que zero. */
export function occupancyTone(count: number, max: number | null | undefined): OccupancyTone | null {
  if (!max || max <= 0) return null
  const ratio = count / max
  if (ratio >= 1) return "full"
  return ratio >= ALMOST_FULL ? "almost" : "free"
}
