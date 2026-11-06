import type { ScheduleDay, TimeWindow } from "@/lib/calendar/types"

// A semana de horários de um colaborador (`rule.days`) e de uma turma (`schedule`): o mesmo formato
// e as mesmas regras de `Agenda::WeeklySchedule` na API. Horário aqui é hora de parede no fuso do
// calendário e circula como "HH:MM": nunca passa por `Date`, para não andar com o fuso do navegador.

/** Segunda primeiro: quem configura horário pensa na semana de trabalho. A API conta do domingo. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const

const TIME_FORMAT = /^([01]\d|2[0-3]):[0-5]\d$/
const LAST_MINUTE = 23 * 60 + 59
/** O respiro entre uma faixa e a seguinte, ao acrescentar: costuma ser o almoço. */
const WINDOW_GAP = 60
/** Um domingo qualquer, para o `Intl` dar o nome de cada dia. */
const A_SUNDAY = Date.UTC(2023, 0, 1)
const ONE_DAY = 86_400_000

export function isValidTime(value: string | null | undefined): value is string {
  return Boolean(value && TIME_FORMAT.test(value))
}

export function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number)
  return hours * 60 + minutes
}

export function fromMinutes(total: number): string {
  const clamped = Math.max(0, Math.min(total, LAST_MINUTE))
  const hours = String(Math.floor(clamped / 60)).padStart(2, "0")
  const minutes = String(clamped % 60).padStart(2, "0")
  return `${hours}:${minutes}`
}

/** Sempre os sete dias, em ordem de `dayOfWeek`: a API pode guardar menos. */
export function normalizeWeek(days: ScheduleDay[] | null | undefined): ScheduleDay[] {
  return Array.from({ length: 7 }, (_, dayOfWeek) => {
    const day = days?.find((item) => item.dayOfWeek === dayOfWeek)
    return {
      dayOfWeek,
      enabled: Boolean(day?.enabled),
      windows: (day?.windows ?? []).map((window) => ({
        start: window.start,
        end: window.end ?? null,
      })),
    }
  })
}

/** O mesmo padrão que a API dá a quem não manda horários (`Agenda::Rule::DEFAULT_DAYS`). */
export function defaultProfessionalWeek(): ScheduleDay[] {
  return normalizeWeek([
    ...[1, 2, 3, 4, 5].map((dayOfWeek) => ({
      dayOfWeek,
      enabled: true,
      windows: [{ start: "09:00", end: "17:00" }],
    })),
    { dayOfWeek: 6, enabled: true, windows: [{ start: "09:00", end: "12:00" }] },
  ])
}

export function emptyWeek(): ScheduleDay[] {
  return normalizeWeek([])
}

/**
 * O que vai para a API. Dia desligado não leva faixa, como na origem, e faixa sem fim não leva o
 * campo. A ordem das faixas fica como a pessoa deixou: é por posição dentro do dia que a turma
 * leva as aulas e as inscrições quando a grade muda, então reordenar moveria gente de horário.
 */
export function weekForApi(days: ScheduleDay[]): ScheduleDay[] {
  return days.map((day) => ({
    dayOfWeek: day.dayOfWeek,
    enabled: day.enabled,
    windows: day.enabled
      ? day.windows.map((window) =>
          window.end ? { start: window.start, end: window.end } : { start: window.start }
        )
      : [],
  }))
}

/* ---------- regras ---------- */

export type WeekRules = {
  /** Na turma, faixa sem fim usa a duração padrão. */
  endOptional?: boolean
  defaultDuration?: number | null
}

export type DayProblemCode = "noWindows" | "invalidTime" | "startAfterEnd" | "overlap"

export type DayProblem = {
  code: DayProblemCode
  /** Posição das faixas com o problema, para marcar os campos certos. */
  windows: number[]
}

function endOf(window: TimeWindow, rules: WeekRules): number {
  return window.end
    ? toMinutes(window.end)
    : toMinutes(window.start) + (rules.defaultDuration || 1)
}

function overlapping(windows: TimeWindow[], rules: WeekRules): number[] {
  const ranges = windows
    .map((window, index) => ({ index, start: toMinutes(window.start), end: endOf(window, rules) }))
    .sort((a, b) => a.start - b.start)

  const clashing = new Set<number>()
  let previous = ranges[0]
  for (const range of ranges.slice(1)) {
    if (range.start < previous.end) {
      clashing.add(previous.index)
      clashing.add(range.index)
    }
    if (range.end > previous.end) previous = range
  }
  return [...clashing]
}

/** O primeiro problema do dia, na mesma ordem em que a API confere. */
export function dayProblem(day: ScheduleDay, rules: WeekRules = {}): DayProblem | null {
  if (!day.enabled) return null
  if (day.windows.length === 0) return { code: "noWindows", windows: [] }

  const invalid = day.windows.flatMap((window, index) => {
    const endIsFine = window.end ? isValidTime(window.end) : Boolean(rules.endOptional)
    return isValidTime(window.start) && endIsFine ? [] : [index]
  })
  if (invalid.length > 0) return { code: "invalidTime", windows: invalid }

  const backwards = day.windows.flatMap((window, index) =>
    window.end && toMinutes(window.start) >= toMinutes(window.end) ? [index] : []
  )
  if (backwards.length > 0) return { code: "startAfterEnd", windows: backwards }

  const clashing = overlapping(day.windows, rules)
  return clashing.length > 0 ? { code: "overlap", windows: clashing } : null
}

export function weekHasProblems(days: ScheduleDay[], rules: WeekRules = {}): boolean {
  return days.some((day) => dayProblem(day, rules) !== null)
}

/* ---------- edição ---------- */

/**
 * A faixa que entra quando a pessoa pede mais uma: depois da última, com um respiro. Sem espaço até
 * a meia-noite, o primeiro vão que couber; sem vão nenhum, fica logo depois, e a validação avisa.
 */
export function nextWindow(
  windows: TimeWindow[],
  { duration, openEnded = false }: { duration: number; openEnded?: boolean }
): TimeWindow {
  const taken = windows
    .filter((window) => isValidTime(window.start))
    .map((window) => ({
      start: toMinutes(window.start),
      end: isValidTime(window.end) ? toMinutes(window.end) : toMinutes(window.start) + duration,
    }))
    .sort((a, b) => a.start - b.start)

  const build = (start: number): TimeWindow => ({
    start: fromMinutes(start),
    end: openEnded ? null : fromMinutes(start + duration),
  })

  if (taken.length === 0) return build(9 * 60)

  const lastEnd = Math.max(...taken.map((range) => range.end))
  if (lastEnd + WINDOW_GAP + duration <= LAST_MINUTE) return build(lastEnd + WINDOW_GAP)
  if (lastEnd + duration <= LAST_MINUTE) return build(lastEnd)

  let cursor = 0
  for (const range of taken) {
    if (range.start - cursor >= duration) return build(cursor)
    cursor = Math.max(cursor, range.end)
  }
  return build(lastEnd)
}

/** Os dias escolhidos ficam ligados e com as mesmas faixas do dia de origem. */
export function copyDay(days: ScheduleDay[], from: number, targets: number[]): ScheduleDay[] {
  const source = days.find((day) => day.dayOfWeek === from)
  if (!source) return days
  return days.map((day) =>
    targets.includes(day.dayOfWeek)
      ? {
          ...day,
          enabled: true,
          windows: source.windows.map((window) => ({ ...window })),
        }
      : day
  )
}

/* ---------- mostrar ---------- */

export type WeekdayStyle = "long" | "short"

export function weekdayName(
  dayOfWeek: number,
  language: string,
  style: WeekdayStyle = "long"
): string {
  return new Intl.DateTimeFormat(language, { weekday: style, timeZone: "UTC" }).format(
    new Date(A_SUNDAY + dayOfWeek * ONE_DAY)
  )
}

function clockDate(time: string): Date {
  const [hours, minutes] = time.split(":").map(Number)
  return new Date(Date.UTC(2023, 0, 1, hours, minutes))
}

const clockFormat = (language: string) =>
  new Intl.DateTimeFormat(language, { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })

export function formatClock(time: string, language: string): string {
  return isValidTime(time) ? clockFormat(language).format(clockDate(time)) : time
}

/** "09:00 – 12:00". Faixa sem fim mostra só o começo. */
export function formatWindow(window: TimeWindow, language: string): string {
  if (!isValidTime(window.start)) return window.start
  if (!isValidTime(window.end) || toMinutes(window.end) <= toMinutes(window.start)) {
    return formatClock(window.start, language)
  }
  return clockFormat(language).formatRange(clockDate(window.start), clockDate(window.end))
}

export type WeekGroup = { days: number[]; windows: TimeWindow[] }

/**
 * Dias com as mesmas faixas andam juntos: "seg. a sex.: 09:00 – 18:00". Só aqui as faixas vão em
 * ordem de início, porque é leitura: ao gravar, a ordem delas é a que a pessoa deixou.
 */
export function groupWeek(days: ScheduleDay[]): WeekGroup[] {
  const groups = new Map<string, WeekGroup>()
  for (const dayOfWeek of WEEK_ORDER) {
    const day = days.find((item) => item.dayOfWeek === dayOfWeek)
    if (!day?.enabled || day.windows.length === 0) continue

    const windows = [...day.windows].sort((a, b) => a.start.localeCompare(b.start))
    const key = windows.map((window) => `${window.start}-${window.end ?? ""}`).join("|")
    const group = groups.get(key)
    if (group) group.days.push(dayOfWeek)
    else groups.set(key, { days: [dayOfWeek], windows })
  }
  return [...groups.values()]
}

/** "seg. a sex.", ou "seg., qua. e sex." quando os dias não são seguidos. */
export function formatDaySet(
  days: number[],
  language: string,
  range: (from: string, to: string) => string
): string {
  const short = (position: number) => weekdayName(WEEK_ORDER[position], language, "short")
  const positions = days
    .map((day) => WEEK_ORDER.indexOf(day as (typeof WEEK_ORDER)[number]))
    .sort((a, b) => a - b)

  const parts: string[] = []
  let index = 0
  while (index < positions.length) {
    let last = index
    while (last + 1 < positions.length && positions[last + 1] === positions[last] + 1) last += 1

    // Dois dias seguidos não ganham nada virando intervalo.
    if (last - index >= 2) {
      parts.push(range(short(positions[index]), short(positions[last])))
    } else {
      for (let item = index; item <= last; item += 1) parts.push(short(positions[item]))
    }
    index = last + 1
  }
  return new Intl.ListFormat(language, { style: "long", type: "conjunction" }).format(parts)
}

export function formatWindows(windows: TimeWindow[], language: string): string {
  return new Intl.ListFormat(language, { style: "long", type: "conjunction" }).format(
    windows.map((window) => formatWindow(window, language))
  )
}
