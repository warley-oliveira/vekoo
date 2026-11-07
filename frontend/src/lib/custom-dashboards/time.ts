import type { Granularity } from "./types"

// Datas das consultas: chegam em milissegundos, no começo do dia, da semana ou do mês **no fuso da organização**. Quem
// olha pode estar em outro fuso, e sem isto o dia 12 viraria 11 na tela. A semana começa na segunda, como na API.

const dateFormatters = new Map<string, Intl.DateTimeFormat>()

function dateFormatter(language: string, timeZone: string | undefined, options: Intl.DateTimeFormatOptions) {
  const key = `${language}|${timeZone ?? ""}|${JSON.stringify(options)}`
  let formatter = dateFormatters.get(key)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(language, { ...options, timeZone })
    dateFormatters.set(key, formatter)
  }
  return formatter
}

export function formatZoned(value: number, language: string, timeZone: string | undefined, options: Intl.DateTimeFormatOptions) {
  return dateFormatter(language, timeZone, options).format(value)
}

type WallDate = { year: number; month: number; day: number; hour: number; minute: number; second: number }

function wallDate(value: number, timeZone: string | undefined): WallDate {
  const parts = dateFormatter("en-US", timeZone, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  }).formatToParts(value)
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value)

  return {
    year: part("year"),
    month: part("month") - 1,
    day: part("day"),
    hour: part("hour"),
    minute: part("minute"),
    second: part("second"),
  }
}

/** O instante da meia-noite daquele dia, naquele fuso. Confere duas vezes por causa do horário de verão. */
function zonedMidnight(year: number, month: number, day: number, timeZone: string | undefined): number {
  const guess = Date.UTC(year, month, day)
  const offset = (instant: number) => {
    const wall = wallDate(instant, timeZone)
    return Date.UTC(wall.year, wall.month, wall.day, wall.hour, wall.minute, wall.second) - instant
  }

  const first = guess - offset(guess)
  return guess - offset(first)
}

/** O começo do balde em que aquele instante cai. */
export function bucketStart(value: number, granularity: Granularity, timeZone: string | undefined): number {
  const { year, month, day } = wallDate(value, timeZone)

  switch (granularity) {
    case "day":
      return zonedMidnight(year, month, day, timeZone)
    case "week": {
      const weekday = new Date(Date.UTC(year, month, day)).getUTCDay()
      return zonedMidnight(year, month, day - ((weekday + 6) % 7), timeZone)
    }
    case "month":
      return zonedMidnight(year, month, 1, timeZone)
    case "year":
      return zonedMidnight(year, 0, 1, timeZone)
  }
}

function nextBucket(start: number, granularity: Granularity, timeZone: string | undefined): number {
  const { year, month, day } = wallDate(start, timeZone)

  switch (granularity) {
    case "day":
      return zonedMidnight(year, month, day + 1, timeZone)
    case "week":
      return zonedMidnight(year, month, day + 7, timeZone)
    case "month":
      return zonedMidnight(year, month + 1, 1, timeZone)
    case "year":
      return zonedMidnight(year + 1, 0, 1, timeZone)
  }
}

/** Mais pontos que isto, o gráfico deixa de responder, e ninguém lê. */
const MAX_BUCKETS = 800

/** Todos os baldes do período, inclusive os sem nenhum número: dia parado também é informação. */
export function enumerateBuckets(
  from: number,
  to: number,
  granularity: Granularity,
  timeZone: string | undefined
): number[] {
  const buckets: number[] = []
  let current = bucketStart(from, granularity, timeZone)

  while (current <= to && buckets.length < MAX_BUCKETS) {
    buckets.push(current)
    current = nextBucket(current, granularity, timeZone)
  }

  return buckets
}

/** O rótulo curto, para o eixo. */
export function bucketTick(value: number, granularity: Granularity, language: string, timeZone: string | undefined) {
  switch (granularity) {
    case "day":
    case "week":
      return formatZoned(value, language, timeZone, { day: "2-digit", month: "2-digit" })
    case "month":
      return formatZoned(value, language, timeZone, { month: "short", year: "2-digit" })
    case "year":
      return formatZoned(value, language, timeZone, { year: "numeric" })
  }
}

/** O rótulo inteiro, para a dica e a tabela. A semana sai com a data do começo: quem chama diz que é semana. */
export function bucketTitle(value: number, granularity: Granularity, language: string, timeZone: string | undefined) {
  switch (granularity) {
    case "day":
    case "week":
      return formatZoned(value, language, timeZone, { dateStyle: "medium" })
    case "month":
      return formatZoned(value, language, timeZone, { month: "long", year: "numeric" })
    case "year":
      return formatZoned(value, language, timeZone, { year: "numeric" })
  }
}

/** A data de uma linha de tabela. */
export function formatCellDate(value: number, language: string, timeZone: string | undefined) {
  return formatZoned(value, language, timeZone, { dateStyle: "short", timeStyle: "short" })
}
