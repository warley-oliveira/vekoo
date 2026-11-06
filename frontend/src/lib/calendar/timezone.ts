// Horário de agenda é sempre hora de parede no fuso do calendário, nunca no do navegador:
// quem atende em Belo Horizonte e abre a tela em Lisboa continua vendo "14:00".
//
// Três formas do mesmo horário circulam aqui, e confundir duas delas é o erro clássico:
//
// - **instante:** milissegundos, o que a API entrega e recebe.
// - **data de grade:** um `Date` cujos campos em UTC são a hora de parede. É o que o
//   FullCalendar recebe, com `timeZone="UTC"`: cada evento cai na hora do próprio calendário,
//   mesmo com dois calendários de fusos diferentes na mesma tela.
// - **data de campo:** um `Date` cujos campos locais são a hora de parede. É o que os campos de
//   data do kit entendem, porque eles leem `getHours()` e companhia.

export type WallTime = {
  year: number
  /** De 1 a 12. */
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

const partFormatters = new Map<string, Intl.DateTimeFormat>()

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = partFormatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    })
    partFormatters.set(timeZone, formatter)
  }
  return formatter
}

/** O fuso que o navegador informa. Serve só para comparar, nunca para exibir horário. */
export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

export function isValidTimeZone(timeZone: string | null | undefined): timeZone is string {
  if (!timeZone) return false
  try {
    partsFormatter(timeZone)
    return true
  } catch {
    return false
  }
}

/** Calendário com fuso que o navegador não conhece não pode derrubar a tela. */
export function safeTimeZone(timeZone: string | null | undefined, fallback = "UTC"): string {
  return isValidTimeZone(timeZone) ? timeZone : fallback
}

export function wallTimeOf(instant: number, timeZone: string): WallTime {
  const fields: Partial<Record<Intl.DateTimeFormatPartTypes, number>> = {}
  for (const part of partsFormatter(timeZone).formatToParts(new Date(instant))) {
    if (part.type !== "literal") fields[part.type] = Number(part.value)
  }
  return {
    year: fields.year ?? 1970,
    month: fields.month ?? 1,
    day: fields.day ?? 1,
    hour: fields.hour ?? 0,
    minute: fields.minute ?? 0,
    second: fields.second ?? 0,
  }
}

function wallAsUtc(wall: WallTime): number {
  return Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second)
}

/** Quanto o fuso está à frente de UTC naquele instante, em milissegundos. */
export function zoneOffset(instant: number, timeZone: string): number {
  const wholeSecond = Math.floor(instant / 1000) * 1000
  return wallAsUtc(wallTimeOf(wholeSecond, timeZone)) - wholeSecond
}

/**
 * O instante de uma hora de parede. Duas passadas resolvem a virada de horário de verão: no dia
 * em que a hora não existe, vale a hora seguinte; no dia em que ela se repete, a primeira.
 */
export function instantOf(wall: WallTime, timeZone: string): number {
  const asUtc = wallAsUtc(wall)
  const first = asUtc - zoneOffset(asUtc, timeZone)
  const second = asUtc - zoneOffset(first, timeZone)
  if (first === second) return first

  const third = asUtc - zoneOffset(second, timeZone)
  // A hora que não existe alterna entre as duas respostas: fica a mais tarde.
  return third === second ? second : Math.max(first, second)
}

/* ---------- data de grade (FullCalendar, com `timeZone="UTC"`) ---------- */

export function gridDateOf(instant: number, timeZone: string): Date {
  return new Date(wallAsUtc(wallTimeOf(instant, timeZone)))
}

export function instantFromGrid(gridDate: Date, timeZone: string): number {
  return instantOf(
    {
      year: gridDate.getUTCFullYear(),
      month: gridDate.getUTCMonth() + 1,
      day: gridDate.getUTCDate(),
      hour: gridDate.getUTCHours(),
      minute: gridDate.getUTCMinutes(),
      second: gridDate.getUTCSeconds(),
    },
    timeZone
  )
}

/** Da grade para o campo: a hora de parede não muda, só onde ela está guardada. */
export function fieldDateOfGrid(gridDate: Date): Date {
  return new Date(
    gridDate.getUTCFullYear(),
    gridDate.getUTCMonth(),
    gridDate.getUTCDate(),
    gridDate.getUTCHours(),
    gridDate.getUTCMinutes()
  )
}

/* ---------- data de campo (DateTimeField e companhia) ---------- */

export function fieldDateOf(instant: number, timeZone: string): Date {
  const wall = wallTimeOf(instant, timeZone)
  return new Date(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second)
}

export function instantFromField(fieldDate: Date, timeZone: string): number {
  return instantOf(
    {
      year: fieldDate.getFullYear(),
      month: fieldDate.getMonth() + 1,
      day: fieldDate.getDate(),
      hour: fieldDate.getHours(),
      minute: fieldDate.getMinutes(),
      second: fieldDate.getSeconds(),
    },
    timeZone
  )
}

/* ---------- dias puros ("AAAA-MM-DD") ---------- */

function pad(value: number): string {
  return String(value).padStart(2, "0")
}

export function dayKeyOfWall(wall: Pick<WallTime, "year" | "month" | "day">): string {
  return `${wall.year}-${pad(wall.month)}-${pad(wall.day)}`
}

/** O dia daquele instante no fuso. É a chave de agrupar, e o `slots` de `availability`. */
export function dayKeyOf(instant: number, timeZone: string): string {
  return dayKeyOfWall(wallTimeOf(instant, timeZone))
}

export function dayKeyOfGrid(gridDate: Date): string {
  return dayKeyOfWall({
    year: gridDate.getUTCFullYear(),
    month: gridDate.getUTCMonth() + 1,
    day: gridDate.getUTCDate(),
  })
}

/** A partir de "AAAA-MM-DD". Devolve meia-noite em UTC, sem tocar no fuso do navegador. */
export function gridDateOfDayKey(dayKey: string): Date {
  const [year, month, day] = dayKey.split("-").map(Number)
  return new Date(Date.UTC(year, (month || 1) - 1, day || 1))
}

export function addDaysToKey(dayKey: string, days: number): string {
  const date = gridDateOfDayKey(dayKey)
  date.setUTCDate(date.getUTCDate() + days)
  return dayKeyOfGrid(date)
}

/** "2026-11-06" é um dia válido? Serve para o que vem da URL. */
export function isDayKey(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  return dayKeyOfGrid(gridDateOfDayKey(value)) === value
}

/** O instante da hora de parede "AAAA-MM-DD" + "HH:MM" naquele fuso. */
export function instantOfDayTime(dayKey: string, time: string, timeZone: string): number {
  const [year, month, day] = dayKey.split("-").map(Number)
  const [hour, minute] = time.split(":").map(Number)
  return instantOf(
    { year, month, day, hour: hour || 0, minute: minute || 0, second: 0 },
    timeZone
  )
}

/** Meia-noite daquele dia, naquele fuso. */
export function startOfDayInstant(dayKey: string, timeZone: string): number {
  return instantOfDayTime(dayKey, "00:00", timeZone)
}

/** "2026-11-06" num `Date` local, para mostrar o dia sem deslocar. */
export function localDateOfDayKey(dayKey: string): Date {
  const [year, month, day] = dayKey.split("-").map(Number)
  return new Date(year, (month || 1) - 1, day || 1)
}

export function dayKeyOfLocal(date: Date): string {
  return dayKeyOfWall({
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  })
}

/** "14:30", como vem de `slots` e das janelas de um instante. */
export function wallClockOf(instant: number, timeZone: string): string {
  const wall = wallTimeOf(instant, timeZone)
  return `${pad(wall.hour)}:${pad(wall.minute)}`
}

/* ---------- mostrar ---------- */

/** Sempre com o fuso do calendário. É por aqui que passa todo horário da agenda na tela. */
export function formatInZone(
  instant: number,
  timeZone: string,
  language: string,
  options: Intl.DateTimeFormatOptions
): string {
  return new Intl.DateTimeFormat(language, { ...options, timeZone }).format(new Date(instant))
}

export function formatTimeInZone(instant: number, timeZone: string, language: string): string {
  return formatInZone(instant, timeZone, language, { hour: "2-digit", minute: "2-digit" })
}

/** "14:00 – 15:00", deixando o `Intl` juntar o que se repete. */
export function formatTimeRangeInZone(
  start: number,
  end: number,
  timeZone: string,
  language: string
): string {
  return new Intl.DateTimeFormat(language, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).formatRange(new Date(start), new Date(Math.max(start, end)))
}

/** "sex., 6 de nov., 14:00 – 15:00". */
export function formatEventWhen(
  start: number,
  end: number,
  timeZone: string,
  language: string
): string {
  return new Intl.DateTimeFormat(language, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).formatRange(new Date(start), new Date(Math.max(start, end)))
}

/** Dia puro por extenso: "sexta-feira, 6 de novembro". */
export function formatDayKey(
  dayKey: string,
  language: string,
  options: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" }
): string {
  return new Intl.DateTimeFormat(language, { ...options, timeZone: "UTC" }).format(
    gridDateOfDayKey(dayKey)
  )
}

/** Vale a pena avisar? Só se o relógio for outro: Recife e São Paulo marcam a mesma hora. */
export function zoneDiffersFromBrowser(timeZone: string, at = Date.now()): boolean {
  const browser = browserTimeZone()
  if (browser === timeZone) return false
  return zoneOffset(at, browser) !== zoneOffset(at, timeZone)
}

/** "Horário de Brasília", ou o que o `Intl` tiver no idioma. Sem nome, a região do IANA. */
export function zoneDisplayName(timeZone: string, language: string, at = Date.now()): string {
  const named = new Intl.DateTimeFormat(language, { timeZone, timeZoneName: "longGeneric" })
    .formatToParts(new Date(at))
    .find((part) => part.type === "timeZoneName")?.value
  return named || timeZone.split("/").at(-1)?.replaceAll("_", " ") || timeZone
}
