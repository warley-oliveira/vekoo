import { capitalizeFirstLetter } from "@/lib/date-format"
import { formatNumber } from "@/lib/format-number"

// Formatos que só esta área usa. Sempre pelo `Intl`, com o idioma ativo.

const HOURS_IN_DAY = 24

/** "12 min", "5 h", "3,7 dias". Um número só, na unidade que a pessoa lê sem fazer conta. */
export function formatDurationFromHours(hours: number, language: string): string {
  if (hours < 1) {
    return formatNumber(Math.max(1, Math.round(hours * 60)), language, {
      style: "unit",
      unit: "minute",
      unitDisplay: "short",
    })
  }
  if (hours < HOURS_IN_DAY) {
    return formatNumber(Math.round(hours * 10) / 10, language, {
      style: "unit",
      unit: "hour",
      unitDisplay: "short",
      maximumFractionDigits: 1,
    })
  }
  return formatNumber(Math.round((hours / HOURS_IN_DAY) * 10) / 10, language, {
    style: "unit",
    unit: "day",
    unitDisplay: "long",
    maximumFractionDigits: 1,
  })
}

/** "novembro de 2026", a partir de "2026-11". */
export function formatMonth(
  month: string,
  language: string,
  options: Intl.DateTimeFormatOptions = { month: "long", year: "numeric" }
): string {
  const [year, monthNumber] = month.split("-").map(Number)
  return new Intl.DateTimeFormat(language, options).format(new Date(year, (monthNumber || 1) - 1, 1))
}

/** "Novembro de 2026", para título e início de linha. */
export function formatMonthTitle(month: string, language: string): string {
  return capitalizeFirstLetter(formatMonth(month, language))
}

/** "2026-11" do mês em que `date` está, na hora local. */
export function monthOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

/** O mês `delta` meses antes ou depois de "2026-11". */
export function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split("-").map(Number)
  return monthOf(new Date(year, monthNumber - 1 + delta, 1))
}

/** Razão entre dois valores do mesmo indicador. Sem base para comparar, não há variação. */
export function deltaRatio(current: number, previous: number): number | null {
  if (!previous) return null
  return (current - previous) / previous
}
