const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

// Datas saem do `Intl` com o idioma ativo — nada de string de tempo escrita à
// mão por locale. Quem chama passa o idioma (`useLanguage()`).

/** "há 3 horas" / "ontem" / "12 de mai." — no idioma pedido. */
export function formatRelative(
  timestamp: number,
  language: string,
  now = Date.now()
): string {
  const diff = now - timestamp
  const relative = new Intl.RelativeTimeFormat(language, { numeric: "auto" })

  if (diff < HOUR) {
    return relative.format(-Math.max(1, Math.floor(diff / MINUTE)), "minute")
  }
  if (diff < DAY) return relative.format(-Math.floor(diff / HOUR), "hour")
  if (diff < 30 * DAY) return relative.format(-Math.floor(diff / DAY), "day")

  return new Intl.DateTimeFormat(language, {
    day: "numeric",
    month: "short",
  }).format(timestamp)
}

/** Dias restantes até o item sumir da lixeira (some após 30 dias). */
export function daysLeftInTrash(trashedAt: number, now = Date.now()): number {
  const elapsed = Math.floor((now - trashedAt) / DAY)
  return Math.max(0, 30 - elapsed)
}
