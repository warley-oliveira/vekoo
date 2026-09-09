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

/**
 * "08/09/2026" em pt-BR, "09/08/2026" em en — quem decide a ordem dos campos
 * é o locale, nunca a gente. Serve para data absoluta (o `title` de uma data
 * relativa, um comprovante); no fluxo da tela, prefira `formatRelative`.
 */
export function formatDate(timestamp: number, language: string): string {
  return new Intl.DateTimeFormat(language, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(timestamp)
}

/** A data com a hora — o que aparece ao passar o mouse sobre "há 3 horas". */
export function formatDateTime(timestamp: number, language: string): string {
  return new Intl.DateTimeFormat(language, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp)
}

/** "1.234" em pt-BR, "1,234" em en. Separador de milhar é do locale. */
export function formatNumber(value: number, language: string): string {
  return new Intl.NumberFormat(language).format(value)
}

/**
 * "R$ 1.234,56". É a porta de entrada de dinheiro **do sistema** (plano,
 * cobrança) quando isso existir.
 *
 * ⚠️ Preço que a pessoa digitou na marca é **conteúdo dela**, não valor do
 * sistema: sai como foi escrito e nunca passa por aqui — reformatar mudaria
 * a obra do usuário.
 */
export function formatCurrency(
  value: number,
  language: string,
  currency = "BRL"
): string {
  return new Intl.NumberFormat(language, { style: "currency", currency }).format(value)
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
