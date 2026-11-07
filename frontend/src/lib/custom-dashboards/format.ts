import { formatDuration } from "@/components/dashboard/format"
import { formatCompactNumber, formatCurrency, formatNumber } from "@/lib/format-number"

import type { VisualConfig } from "./types"

// Como um número aparece num card. `format` é o tipo do número (percentual em pontos: `12,5` é "12,5%"), `prefix` e
// `suffix` são texto livre da pessoa, e `decimalPrecision` fixa as casas. Sempre pelo `Intl`.

/** A partir daqui o número vira "12,9 mil": o card é para bater o olho, como o `StatTile`. */
const COMPACT_FROM = 10_000

type FormatOptions = Pick<VisualConfig, "format" | "prefix" | "suffix" | "decimalPrecision">

function decimals(value: number, precision: number | undefined) {
  if (precision !== undefined && precision !== null) {
    return { minimumFractionDigits: precision, maximumFractionDigits: precision }
  }
  return { maximumFractionDigits: Number.isInteger(value) ? 0 : 2 }
}

function formatBare(value: number, config: FormatOptions, language: string, compact: boolean): string {
  switch (config.format) {
    case "percent":
      return formatNumber(value / 100, language, { style: "percent", ...decimals(value, config.decimalPrecision ?? 1) })
    case "currency":
      return formatCurrency(value, language, {
        compact: compact && Math.abs(value) >= COMPACT_FROM,
        ...(config.decimalPrecision !== undefined ? { maximumFractionDigits: config.decimalPrecision } : {}),
      })
    case "duration":
      return formatDuration(value, language)
    default:
      if (compact && config.decimalPrecision === undefined && Math.abs(value) >= COMPACT_FROM) {
        return formatCompactNumber(value, language)
      }
      return formatNumber(value, language, decimals(value, config.decimalPrecision))
  }
}

/** O número por inteiro. Conta que não dá número (raiz de negativo) mostra o traço. */
export function formatValue(value: number | null | undefined, config: FormatOptions, language: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—"
  return `${config.prefix ?? ""}${formatBare(value, config, language, false)}${config.suffix ?? ""}`
}

/** O número curto, para o valor em destaque e o eixo. O inteiro fica no `title` e na tabela. */
export function formatCompactValue(value: number | null | undefined, config: FormatOptions, language: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—"
  return `${config.prefix ?? ""}${formatBare(value, config, language, true)}${config.suffix ?? ""}`
}
