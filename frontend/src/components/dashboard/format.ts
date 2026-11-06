import { formatPercent } from "@/lib/format-number"
import { parseDay } from "@/hooks/insights/use-dashboard-period"

// Formatos próprios do Dashboard, sempre pelo `Intl`, com o idioma ativo.

const unitFormatters = new Map<string, Intl.NumberFormat>()

function unit(language: string, name: "second" | "minute" | "hour", value: number): string {
  const key = `${language}:${name}`
  let formatter = unitFormatters.get(key)
  if (!formatter) {
    formatter = new Intl.NumberFormat(language, {
      style: "unit",
      unit: name,
      unitDisplay: "narrow",
      maximumFractionDigits: 1,
    })
    unitFormatters.set(key, formatter)
  }
  return formatter.format(value)
}

/** "26s", "8min 24s", "2h 5min". Duas unidades bastam: ninguém lê "2h 5min 12s" num painel. */
export function formatDuration(seconds: number, language: string): string {
  const whole = Math.round(seconds)
  if (whole < 60) return unit(language, "second", whole)

  const minutes = Math.floor(whole / 60)
  if (minutes < 60) {
    const rest = whole % 60
    return rest
      ? `${unit(language, "minute", minutes)} ${unit(language, "second", rest)}`
      : unit(language, "minute", minutes)
  }

  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest
    ? `${unit(language, "hour", hours)} ${unit(language, "minute", rest)}`
    : unit(language, "hour", hours)
}

export function formatHours(hours: number, language: string): string {
  return unit(language, "hour", hours)
}

/** A API manda percentual em pontos (`39.2`). */
export function formatRate(rate: number, language: string): string {
  return formatPercent(rate / 100, language)
}

const dayFormatters = new Map<string, Intl.DateTimeFormat>()

function dayFormatter(language: string, options: Intl.DateTimeFormatOptions) {
  const key = `${language}:${JSON.stringify(options)}`
  let formatter = dayFormatters.get(key)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(language, options)
    dayFormatters.set(key, formatter)
  }
  return formatter
}

/** Marca de eixo: "08/10". */
export function formatDayTick(day: string, language: string): string {
  const date = parseDay(day)
  return date ? dayFormatter(language, { day: "2-digit", month: "2-digit" }).format(date) : day
}

/** Título de dica: "qui., 8 de out.". */
export function formatDayLong(day: string, language: string): string {
  const date = parseDay(day)
  return date
    ? dayFormatter(language, { weekday: "short", day: "numeric", month: "short" }).format(date)
    : day
}

/** Dia ou faixa de dias, para um ponto que junta uma semana ou um mês. */
export function formatBucket(from: string, to: string, language: string): string {
  if (from === to) return formatDayLong(from, language)
  const start = parseDay(from)
  const end = parseDay(to)
  if (!start || !end) return `${from} – ${to}`
  return dayFormatter(language, { day: "numeric", month: "short" }).formatRange(start, end)
}

/** Nome do dia da semana, com 0 = domingo: `Intl`, nunca uma lista escrita à mão por idioma. */
export function weekdayName(index: number, language: string, style: "short" | "long" = "short"): string {
  // 2 de janeiro de 2022 foi um domingo.
  return dayFormatter(language, { weekday: style }).format(new Date(2022, 0, 2 + index))
}
