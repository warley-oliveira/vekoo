// Números e dinheiro sempre pelo `Intl`, com o idioma ativo (`useLanguage()`).
// Criar um `Intl.NumberFormat` custa caro para uma coluna de tabela, então cada
// combinação de idioma e opções é criada uma vez só.

const formatters = new Map<string, Intl.NumberFormat>()

function formatter(language: string, options: Intl.NumberFormatOptions) {
  const key = `${language}:${JSON.stringify(options)}`
  let instance = formatters.get(key)
  if (!instance) {
    instance = new Intl.NumberFormat(language, options)
    formatters.set(key, instance)
  }
  return instance
}

/** "1.234,5" */
export function formatNumber(
  value: number,
  language: string,
  options: Intl.NumberFormatOptions = {}
): string {
  return formatter(language, options).format(value)
}

/** "1,2 mil" / "3,4 mi", para painéis e rótulos curtos. */
export function formatCompactNumber(value: number, language: string): string {
  return formatter(language, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value)
}

/** Recebe a razão: `0.125` vira "12,5%". Com `signed`, "+12,5%". */
export function formatPercent(
  ratio: number,
  language: string,
  { signed = false, maximumFractionDigits = 1 } = {}
): string {
  return formatter(language, {
    style: "percent",
    maximumFractionDigits,
    signDisplay: signed ? "exceptZero" : "auto",
  }).format(ratio)
}

export const DEFAULT_CURRENCY = "BRL"

/** "R$ 1.234,50". Valor em unidades da moeda, não em centavos. */
export function formatCurrency(
  value: number,
  language: string,
  {
    currency = DEFAULT_CURRENCY,
    compact = false,
    maximumFractionDigits,
  }: {
    currency?: string
    compact?: boolean
    maximumFractionDigits?: number
  } = {}
): string {
  return formatter(language, {
    style: "currency",
    currency,
    ...(compact ? { notation: "compact" as const } : {}),
    ...(maximumFractionDigits === undefined ? {} : { maximumFractionDigits }),
  }).format(value)
}
