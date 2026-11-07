const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

// Datas saem do `Intl` com o idioma ativo — nada de string de tempo escrita à
// mão por locale. Quem chama passa o idioma (`useLanguage()`).

/** "agora" / "há 3 horas" / "ontem" / "em 2 dias" / "12 de mai." — no idioma pedido. */
export function formatRelative(
  timestamp: number,
  language: string,
  now = Date.now()
): string {
  const diff = now - timestamp
  const relative = new Intl.RelativeTimeFormat(language, { numeric: "auto" })

  // Futuro (agendamentos, prazos). Menos de um minuto à frente é relógio
  // desacertado, não futuro, e segue o caminho do passado.
  if (diff <= -MINUTE) {
    const ahead = -diff
    if (ahead < HOUR) return relative.format(Math.floor(ahead / MINUTE), "minute")
    if (ahead < DAY) return relative.format(Math.floor(ahead / HOUR), "hour")
    if (ahead < 30 * DAY) return relative.format(Math.floor(ahead / DAY), "day")
    return new Intl.DateTimeFormat(language, {
      day: "numeric",
      month: "short",
    }).format(timestamp)
  }

  // Acabou de acontecer: "há 1 minuto" logo depois de salvar soa como se não tivesse salvado.
  if (diff < MINUTE) return relative.format(0, "second")
  if (diff < HOUR) return relative.format(-Math.floor(diff / MINUTE), "minute")
  if (diff < DAY) return relative.format(-Math.floor(diff / HOUR), "hour")
  if (diff < 30 * DAY) return relative.format(-Math.floor(diff / DAY), "day")

  return new Intl.DateTimeFormat(language, {
    day: "numeric",
    month: "short",
  }).format(timestamp)
}

/** Dias restantes até o item sumir da lixeira (some após 30 dias). */
/**
 * Prazo padrão da lixeira, para quem chama sem o valor do catálogo. A fonte da
 * verdade é o servidor (`trashRetentionDays` em `GET /catalog`), que é quem
 * apaga de fato — este número é só o palpite de partida.
 */
export const TRASH_RETENTION_DAYS = 30

export function daysLeftInTrash(
  trashedAt: number,
  now = Date.now(),
  retentionDays = TRASH_RETENTION_DAYS
): number {
  const elapsed = Math.floor((now - trashedAt) / DAY)
  return Math.max(0, retentionDays - elapsed)
}
