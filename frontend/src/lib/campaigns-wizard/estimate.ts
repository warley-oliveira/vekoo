// A conta de quanto tempo o envio leva, em palavras de calendário. Segue `docs/migration/api/outreach.md`:
// só a hora da janela vale, fim menor ou igual ao início é o dia inteiro, o limite diário é por canal, e os
// canais andam ao mesmo tempo.

export type EstimateInput = {
  total: number
  channels: number
  sendWindowStart: string
  sendWindowEnd: string
  sendDays: number[]
  intervalMin: number
  intervalMax: number
  dailyLimitPerConnector: number
  timezone: string
  /** Quando começa, em milissegundos. */
  startAt: number
}

export type Estimate = {
  /** Quantos saem por dia, somando os canais. */
  perDay: number
  /** Quando sai a primeira. Fora da janela, é a próxima abertura. */
  firstSendAt: number
  /** Quando sai a última. `null` sem público ou sem canal. */
  finishAt: number | null
  /** Duração em horas de janela, quando cabe num dia. */
  hours: number | null
  /** Dias de calendário, do começo ao fim. */
  days: number | null
  /** A primeira não sai agora, porque o horário ou o dia está fora da janela. */
  waitsForWindow: boolean
}

export const hourOf = (value: string) => Number(value.split(":")[0]) || 0

export function windowHours(start: string, end: string): number {
  const from = hourOf(start)
  const to = hourOf(end)
  return to <= from ? 24 : to - from
}

/** Dia da semana e hora naquele fuso. */
function zonedParts(time: number, timezone: string): { day: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date(time))
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? ""

  return {
    day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(value("weekday")),
    hour: Number(value("hour")) || 0,
    minute: Number(value("minute")) || 0,
  }
}

const HOUR = 3_600_000
const MINUTE = 60_000

/** Anda de hora em hora até a janela abrir. Uma semana basta: ao menos um dia está sempre ligado. */
function firstSend(input: EstimateInput): number {
  const { sendDays, sendWindowStart, sendWindowEnd, timezone, startAt } = input
  if (sendDays.length === 0) return startAt

  const from = hourOf(sendWindowStart)
  const to = hourOf(sendWindowEnd)
  const fullDay = to <= from

  const opens = (time: number) => {
    const { day, hour } = zonedParts(time, timezone)
    return sendDays.includes(day) && (fullDay || (hour >= from && hour < to))
  }
  if (opens(startAt)) return startAt

  const { minute } = zonedParts(startAt, timezone)
  let cursor = startAt - minute * MINUTE
  for (let step = 0; step < 24 * 8; step += 1) {
    cursor += HOUR
    if (opens(cursor)) return cursor
  }
  return startAt
}

export function perDayFor(input: Pick<EstimateInput, "channels" | "sendWindowStart" | "sendWindowEnd" | "intervalMin" | "intervalMax" | "dailyLimitPerConnector">): number {
  const average = (input.intervalMin + input.intervalMax) / 2 || 1
  const perChannel = Math.min(
    Math.floor((windowHours(input.sendWindowStart, input.sendWindowEnd) * 3600) / average),
    input.dailyLimitPerConnector
  )
  return Math.max(0, perChannel) * input.channels
}

export function estimateCampaign(input: EstimateInput): Estimate {
  const perDay = perDayFor(input)
  const firstSendAt = firstSend(input)
  const waitsForWindow = firstSendAt - input.startAt > MINUTE
  const base = { perDay, firstSendAt, waitsForWindow }

  if (input.total <= 0 || perDay <= 0 || input.sendDays.length === 0) {
    return { ...base, finishAt: null, hours: null, days: null }
  }

  // Cabe no primeiro dia: a conta é pelo ritmo.
  if (input.total <= perDay) {
    const average = (input.intervalMin + input.intervalMax) / 2
    const seconds = (input.total / input.channels) * average
    const hours = seconds / 3600
    return { ...base, hours, days: 1, finishAt: firstSendAt + seconds * 1000 }
  }

  // Dias de envio necessários, abrindo só nos dias ligados.
  const sendingDays = Math.ceil(input.total / perDay)
  let cursor = firstSendAt
  let remaining = sendingDays - 1
  let calendarDays = 1
  while (remaining > 0 && calendarDays < 3660) {
    cursor += 24 * HOUR
    calendarDays += 1
    if (input.sendDays.includes(zonedParts(cursor, input.timezone).day)) remaining -= 1
  }

  return { ...base, hours: null, days: calendarDays, finishAt: cursor }
}

/* ---------- ritmo ---------- */

export type PacePreset = "calm" | "balanced" | "fast"
export type Pace = PacePreset | "custom"

/** O piso da origem: a API aceitaria menos, mas abaixo de um minuto o risco é do número de quem envia. */
export const MIN_INTERVAL_SECONDS = 60

export const PACE_PRESETS: Record<PacePreset, { intervalMin: number; intervalMax: number }> = {
  calm: { intervalMin: 180, intervalMax: 360 },
  balanced: { intervalMin: 60, intervalMax: 120 },
  fast: { intervalMin: 60, intervalMax: 90 },
}

export function paceOf(intervalMin: number, intervalMax: number): Pace {
  for (const [pace, range] of Object.entries(PACE_PRESETS) as [PacePreset, (typeof PACE_PRESETS)[PacePreset]][]) {
    if (range.intervalMin === intervalMin && range.intervalMax === intervalMax) return pace
  }
  return "custom"
}

/** A régua do controle de intervalo: passos que fazem sentido, de um minuto a meia hora. */
export const INTERVAL_STOPS = [
  MIN_INTERVAL_SECONDS, 90, 120, 180, 240, 300, 420, 600, 900, 1200, 1500, 1800,
] as const

export function nearestStop(seconds: number): number {
  let best = 0
  INTERVAL_STOPS.forEach((stop, index) => {
    if (Math.abs(stop - seconds) < Math.abs(INTERVAL_STOPS[best] - seconds)) best = index
  })
  return best
}

export const TIMEZONES = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Bahia",
  "America/Fortaleza",
  "America/Belem",
  "America/Cuiaba",
  "America/Recife",
  "America/Porto_Velho",
  "America/Rio_Branco",
  "America/Noronha",
  "UTC",
] as const

/** "São Paulo (GMT-3)". O nome vem de quem chama, e a diferença do `Intl`, não de uma tabela que envelhece. */
export function timezoneLabel(city: string, timezone: string, language: string): string {
  const offset = new Intl.DateTimeFormat(language, { timeZone: timezone, timeZoneName: "shortOffset" })
    .formatToParts(new Date())
    .find((part) => part.type === "timeZoneName")?.value
  return offset ? `${city} (${offset})` : city
}
