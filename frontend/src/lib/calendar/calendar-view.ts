import { capitalizeFirstLetter } from "@/lib/date-format"
import {
  addDaysToKey,
  dayKeyOf,
  dayKeyOfWall,
  formatDayKey,
  gridDateOfDayKey,
  startOfDayInstant,
} from "./timezone"

// A tela anda por dias puros ("AAAA-MM-DD"), e nunca por `Date`: o dia aberto é o mesmo em
// qualquer fuso de navegador. Só vira instante na hora de pedir eventos à API.

export type CalendarView = "month" | "week" | "day" | "agenda"

export const CALENDAR_VIEWS: CalendarView[] = ["agenda", "day", "week", "month"]

/** Semana em colunas não cabe em 390 px: no celular ficam agenda, dia e mês. */
export const PHONE_VIEWS: CalendarView[] = ["agenda", "day", "month"]

export const AGENDA_DAYS = 7

export const FULLCALENDAR_VIEW = {
  month: "dayGridMonth",
  week: "timeGridWeek",
  day: "timeGridDay",
} as const

export function isCalendarView(value: string | null | undefined): value is CalendarView {
  return CALENDAR_VIEWS.includes(value as CalendarView)
}

/** O dia em que a semana daquela data começa. Domingo, como no calendário da grade. */
export function startOfWeekKey(dayKey: string): string {
  return addDaysToKey(dayKey, -gridDateOfDayKey(dayKey).getUTCDay())
}

export function startOfMonthKey(dayKey: string): string {
  return `${dayKey.slice(0, 7)}-01`
}

function addMonthsToKey(dayKey: string, months: number): string {
  const date = gridDateOfDayKey(dayKey)
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1))
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
  ).getUTCDate()
  return dayKeyOfWall({
    year: target.getUTCFullYear(),
    month: target.getUTCMonth() + 1,
    // 31 de janeiro + 1 mês é 28 de fevereiro, e não 3 de março.
    day: Math.min(date.getUTCDate(), lastDay),
  })
}

/** Os dias na tela: início incluído, fim de fora. */
export function visibleDays(view: CalendarView, anchor: string): { start: string; end: string } {
  switch (view) {
    case "day":
      return { start: anchor, end: addDaysToKey(anchor, 1) }
    case "agenda":
      return { start: anchor, end: addDaysToKey(anchor, AGENDA_DAYS) }
    case "week": {
      const start = startOfWeekKey(anchor)
      return { start, end: addDaysToKey(start, 7) }
    }
    case "month": {
      // A grade de mês tem sempre seis semanas, começando na semana do dia 1.
      const start = startOfWeekKey(startOfMonthKey(anchor))
      return { start, end: addDaysToKey(start, 42) }
    }
  }
}

/**
 * O período para a API, em instantes. Com calendários de fusos diferentes na tela, vale o que
 * cobre todos: o dia começa antes em um e termina depois em outro.
 */
export function instantRangeOfDays(
  days: { start: string; end: string },
  zones: string[]
): { start: number; end: number } {
  const starts = zones.map((zone) => startOfDayInstant(days.start, zone))
  const ends = zones.map((zone) => startOfDayInstant(days.end, zone))
  return { start: Math.min(...starts), end: Math.max(...ends) }
}

/** Anterior e próximo. Agenda anda de dia em dia no celular, e de semana no desktop. */
export function stepAnchor(
  view: CalendarView,
  anchor: string,
  direction: 1 | -1,
  isPhone: boolean
): string {
  switch (view) {
    case "day":
      return addDaysToKey(anchor, direction)
    case "week":
      return addDaysToKey(anchor, direction * 7)
    case "agenda":
      return addDaysToKey(anchor, direction * (isPhone ? 1 : AGENDA_DAYS))
    case "month":
      return addMonthsToKey(anchor, direction)
  }
}

export function todayKey(timeZone: string, now = Date.now()): string {
  return dayKeyOf(now, timeZone)
}

function formatKeyRange(
  start: string,
  endExclusive: string,
  language: string,
  withYear: boolean
): string {
  return new Intl.DateTimeFormat(language, {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" as const } : {}),
    timeZone: "UTC",
  }).formatRange(gridDateOfDayKey(start), gridDateOfDayKey(addDaysToKey(endExclusive, -1)))
}

/** O título da barra: "Novembro de 2026", "1 – 7 de nov.", "sexta-feira, 6 de nov.". */
export function viewTitle(
  view: CalendarView,
  anchor: string,
  language: string,
  { today, isPhone = false }: { today: string; isPhone?: boolean }
): string {
  const sameYear = anchor.slice(0, 4) === today.slice(0, 4)

  switch (view) {
    case "month":
      return capitalizeFirstLetter(
        formatDayKey(anchor, language, {
          month: isPhone ? "short" : "long",
          ...(sameYear ? {} : { year: "numeric" as const }),
        })
      )
    case "day":
      return capitalizeFirstLetter(
        formatDayKey(anchor, language, {
          weekday: isPhone ? "short" : "long",
          day: "numeric",
          month: "short",
          ...(sameYear ? {} : { year: "numeric" as const }),
        })
      )
    default: {
      const { start, end } = visibleDays(view, anchor)
      return formatKeyRange(start, end, language, !sameYear)
    }
  }
}

/** "Hoje", "Amanhã", "Ontem" ou o dia por extenso. */
export function relativeDayLabel(
  dayKey: string,
  today: string,
  language: string,
  t: (key: string) => string
): string {
  if (dayKey === today) return t("calendar.days.today")
  if (dayKey === addDaysToKey(today, 1)) return t("calendar.days.tomorrow")
  if (dayKey === addDaysToKey(today, -1)) return t("calendar.days.yesterday")
  return capitalizeFirstLetter(
    formatDayKey(dayKey, language, { weekday: "long", day: "numeric", month: "long" })
  )
}
