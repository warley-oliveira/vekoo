import { formatCurrency } from "@/lib/format-number"

import { parseDayKey } from "./card-meta"

// Formatos curtos do quadro. Cada `Intl` é criado uma vez: um card por render pediria dezenas deles.

const dayFormatters = new Map<string, Intl.DateTimeFormat>()

function dayFormatter(language: string) {
  let formatter = dayFormatters.get(language)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(language, { day: "numeric", month: "short" })
    dayFormatters.set(language, formatter)
  }
  return formatter
}

/** "12 de nov." */
export function formatShortDay(value: number | string, language: string): string {
  const date = typeof value === "string" ? parseDayKey(value) : new Date(value)
  return dayFormatter(language).format(date)
}

/** A partir daqui o valor do card vira "R$ 18,5 mil": a coluna é estreita. */
const COMPACT_FROM = 10_000

/** Valor de um card ou de uma etapa: sem centavos, e compacto quando é grande. */
export function formatDealValue(value: number, language: string): string {
  return value >= COMPACT_FROM
    ? formatCurrency(value, language, { compact: true, maximumFractionDigits: 1 })
    : formatCurrency(value, language, { maximumFractionDigits: 0 })
}
