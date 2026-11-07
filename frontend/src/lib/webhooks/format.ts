import { formatNumber } from "@/lib/format-number"

/** "81 ms". Sem tempo registrado (requisição recusada antes de processar), nada. */
export function formatMs(value: number | null | undefined, language: string): string | null {
  return value === null || value === undefined ? null : `${formatNumber(Math.round(value), language)} ms`
}
