import type { Booking, CalendarEvent } from "./types"

// Agendamentos no painel. A mesma regra da origem: cancelado conta como anterior mesmo no futuro.

export function onlyBookings(events: CalendarEvent[] | undefined): Booking[] {
  return (events ?? []).filter((event): event is Booking => event.type === "booking")
}

export function isUpcoming(booking: Booking, now = Date.now()): boolean {
  return booking.end >= now && booking.status !== "canceled"
}

/** Os próximos primeiro, do mais cedo ao mais tarde; depois os anteriores, do mais recente. */
export function sortBookings(bookings: Booking[], now = Date.now()) {
  const upcoming = bookings.filter((booking) => isUpcoming(booking, now))
  const past = bookings.filter((booking) => !isUpcoming(booking, now))

  return {
    upcoming: upcoming.sort((a, b) => a.start - b.start),
    past: past.sort((a, b) => b.start - a.start),
  }
}

export type BookingState = "canceled" | "noShow" | "show" | "ended" | "upcoming"

export function bookingState(booking: Booking, now = Date.now()): BookingState {
  if (booking.status === "canceled") return "canceled"
  if (booking.attendanceStatus === "no_show") return "noShow"
  if (booking.attendanceStatus === "show") return "show"
  return booking.end < now ? "ended" : "upcoming"
}

/**
 * O título padrão repete o que a linha já diz ("Prova - Ana & Camila"): no painel, o contato é
 * sempre o mesmo, e o profissional tem lugar próprio.
 */
export function bookingTitle(booking: Booking): string {
  return booking.serviceName || booking.title
}

/** Hora no fuso do calendário do agendamento: é a regra de `agenda.md`, e não a do navegador. */
export function formatBookingTime(value: number, language: string, timeZone?: string | null): string {
  return new Intl.DateTimeFormat(language, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timeZone ?? undefined,
  }).format(value)
}

export function bookingDayParts(value: number, language: string, timeZone?: string | null) {
  const zone = timeZone ?? undefined
  return {
    day: new Intl.DateTimeFormat(language, { day: "2-digit", timeZone: zone }).format(value),
    month: new Intl.DateTimeFormat(language, { month: "short", timeZone: zone })
      .format(value)
      .replace(".", ""),
  }
}

export function formatBookingDate(value: number, language: string, timeZone?: string | null): string {
  return new Intl.DateTimeFormat(language, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timeZone ?? undefined,
  }).format(value)
}
