const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** "agora há pouco", "há 3 h", "ontem", "há 5 dias", "12 de mai." */
export function formatRelative(timestamp: number, now = Date.now()): string {
  const diff = now - timestamp
  if (diff < 2 * MINUTE) return "agora há pouco"
  if (diff < HOUR) return `há ${Math.floor(diff / MINUTE)} min`
  if (diff < DAY) return `há ${Math.floor(diff / HOUR)} h`
  if (diff < 2 * DAY) return "ontem"
  if (diff < 30 * DAY) return `há ${Math.floor(diff / DAY)} dias`
  return new Date(timestamp).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "short",
  })
}

export function formatCardCount(count: number): string {
  return count === 1 ? "1 card" : `${count} cards`
}

/** Dias restantes até o item sumir da lixeira (some após 30 dias). */
export function daysLeftInTrash(trashedAt: number, now = Date.now()): number {
  const elapsed = Math.floor((now - trashedAt) / DAY)
  return Math.max(0, 30 - elapsed)
}
