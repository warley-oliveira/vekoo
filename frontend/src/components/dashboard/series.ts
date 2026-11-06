import { parseDay } from "@/hooks/insights/use-dashboard-period"
import { toDateInputValue } from "@/lib/date-format"

// Séries prontas para desenhar: dia a dia até um ponto, depois por semana e por mês, para o gráfico
// continuar mostrando tendência em vez do serrote da semana (domingo parado, sexta cheia).

export type Bucketed<K extends string> = { from: string; to: string } & Record<K, number>

/** Quantos dias cada ponto junta. No celular a largura acaba antes. */
export function bucketSize(days: number, isMobile: boolean): number {
  if (days > 180) return 30
  return days > (isMobile ? 31 : 45) ? 7 : 1
}

/**
 * Agrupa do fim para o começo: o último ponto é sempre um período completo, e quem pode sair menor
 * é o primeiro.
 */
export function bucketize<K extends string>(
  rows: readonly ({ date: string } & Record<K, number>)[],
  keys: readonly K[],
  size: number
): Bucketed<K>[] {
  const buckets: Bucketed<K>[] = []

  for (let end = rows.length; end > 0; end -= size) {
    const slice = rows.slice(Math.max(0, end - size), end)
    const bucket = { from: slice[0].date, to: slice[slice.length - 1].date } as Bucketed<K>
    for (const key of keys) {
      ;(bucket as Record<string, unknown>)[key] = slice.reduce((sum, row) => sum + row[key], 0)
    }
    buckets.unshift(bucket)
  }

  return buckets
}

/** A agenda só manda os dias com presença marcada. Dia sem nada é zero, não um buraco no eixo. */
export function fillDays<K extends string>(
  rows: readonly ({ date: string } & Record<K, number>)[],
  keys: readonly K[],
  dateStart: string,
  dateEnd: string
): ({ date: string } & Record<K, number>)[] {
  const start = parseDay(dateStart)
  const end = parseDay(dateEnd)
  if (!start || !end) return [...rows]

  const known = new Map(rows.map((row) => [row.date, row]))
  const today = new Date()
  const last = end < today ? end : today
  const filled: ({ date: string } & Record<K, number>)[] = []

  for (const cursor = new Date(start); cursor <= last; cursor.setDate(cursor.getDate() + 1)) {
    const date = toDateInputValue(cursor)
    const row = known.get(date)
    if (row) {
      filled.push(row)
    } else {
      const empty = { date } as { date: string } & Record<K, number>
      for (const key of keys) (empty as Record<string, unknown>)[key] = 0
      filled.push(empty)
    }
  }

  return filled
}

/**
 * Sparkline de até `limit` pontos, na média de cada grupo: 90 pontos em 72 px viram ruído. Média, e
 * não soma, para um grupo menor não parecer queda.
 */
export function compactSeries(values: readonly number[], limit = 14): number[] {
  if (values.length <= limit) return [...values]
  const size = Math.ceil(values.length / limit)
  const compacted: number[] = []
  for (let end = values.length; end > 0; end -= size) {
    const slice = values.slice(Math.max(0, end - size), end)
    compacted.unshift(Math.round(slice.reduce((sum, value) => sum + value, 0) / slice.length))
  }
  return compacted
}

export function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0)
}
