import { useState, type Ref } from "react"
import type { FieldPath, FieldValues } from "react-hook-form"

import { Input } from "@/components/ui/input"
import { DEFAULT_CURRENCY, formatCurrency } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { FormField, type FieldControlProps, type FormFieldBaseProps } from "./form-field"

const CENTS = 100
/** Teto de dígitos: umas 13 casas antes dos centavos, longe do limite do float. */
const MAX_DIGITS = 15

function toDigits(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined || amount === "") return ""
  const parsed = typeof amount === "number" ? amount : Number(amount)
  if (!Number.isFinite(parsed)) return ""
  return String(Math.round(parsed * CENTS))
}

export type CurrencyInputProps = Partial<FieldControlProps> & {
  /** Em unidades da moeda; a API pode mandar number ou string ("5000.0"). */
  value: number | string | null | undefined
  /** Recebe o valor numérico, ou `null` quando o campo esvazia. */
  onChange: (value: number | null) => void
  onBlur?: () => void
  currency?: string
  placeholder?: string
  inputRef?: Ref<HTMLInputElement>
  className?: string
}

/**
 * Dinheiro com a máscara de caixa eletrônico: os dígitos entram pela direita, como
 * centavos, e o `Intl` reformata a cada tecla. Moeda e separadores seguem o idioma
 * ativo, sem "R$" escrito à mão. O cursor fica sempre no fim: a máscara reescreve o
 * texto inteiro, e digitar e apagar pela direita é o único comportamento previsível.
 */
export function CurrencyInput({
  value,
  onChange,
  onBlur,
  currency = DEFAULT_CURRENCY,
  placeholder,
  inputRef,
  className,
  ...aria
}: CurrencyInputProps) {
  const language = useLanguage()
  const [digits, setDigits] = useState(() => toDigits(value))

  // Mudança externa (troca de registro, revalidação do SWR) entra sem atropelar a
  // digitação: só quando o valor de fora muda de verdade.
  const external = toDigits(value)
  const [lastExternal, setLastExternal] = useState(external)
  if (external !== lastExternal) {
    setLastExternal(external)
    setDigits(external)
  }

  const display = digits
    ? formatCurrency(Number(digits) / CENTS, language, { currency })
    : ""

  return (
    <Input
      {...aria}
      ref={inputRef}
      inputMode="numeric"
      autoComplete="off"
      value={display}
      placeholder={placeholder ?? formatCurrency(0, language, { currency })}
      className={cn("tabular-nums", className)}
      onChange={(event) => {
        const next = event.target.value
          .replace(/\D/g, "")
          .replace(/^0+(?=\d)/, "")
          .slice(0, MAX_DIGITS)
        const cleared = next === "" || /^0+$/.test(next)

        setDigits(cleared ? "" : next)
        setLastExternal(cleared ? "" : next)
        onChange(cleared ? null : Number(next) / CENTS)
      }}
      onFocus={(event) => {
        const end = event.target.value.length
        event.target.setSelectionRange(end, end)
      }}
      onBlur={onBlur}
    />
  )
}

export type CurrencyFieldProps<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
> = FormFieldBaseProps<TValues, TName> &
  Pick<CurrencyInputProps, "currency" | "placeholder">

/** `CurrencyInput` em formulário. O valor é `number` em unidades da moeda, ou `null`. */
export function CurrencyField<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
>({ currency, placeholder, ...fieldProps }: CurrencyFieldProps<TValues, TName>) {
  return (
    <FormField {...fieldProps}>
      {({ field, controlProps }) => (
        <CurrencyInput
          {...controlProps}
          inputRef={field.ref}
          value={field.value}
          onChange={field.onChange}
          onBlur={field.onBlur}
          currency={currency}
          placeholder={placeholder}
        />
      )}
    </FormField>
  )
}
