import { useTranslation } from "react-i18next"

import { DEFAULT_CURRENCY, formatCurrency } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export type MoneyProps = {
  /** Valor em unidades da moeda. A API também pode mandar string ("5000.0"). */
  value?: number | string | null
  /** Valor inteiro em centavos, no lugar de `value`. */
  cents?: number | null
  currency?: string
  /** "R$ 1,2 mil", para painéis. */
  compact?: boolean
  className?: string
}

/** Dinheiro: moeda e separadores do idioma ativo, com algarismos alinhados em coluna. */
export function Money({
  value,
  cents,
  currency = DEFAULT_CURRENCY,
  compact = false,
  className,
}: MoneyProps) {
  const { t } = useTranslation()
  const language = useLanguage()

  const amount =
    cents !== undefined && cents !== null
      ? cents / 100
      : value === undefined || value === null || value === ""
        ? null
        : Number(value)

  return (
    <span className={cn("whitespace-nowrap tabular-nums", className)}>
      {amount === null || !Number.isFinite(amount)
        ? t("kit.noValue")
        : formatCurrency(amount, language, { currency, compact })}
    </span>
  )
}
