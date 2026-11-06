import { useLayoutEffect, useRef, useState, type Ref } from "react"
import type { FieldPath, FieldValues } from "react-hook-form"

import { Input } from "@/components/ui/input"
import { formatPhoneInput, onlyDigits, parsePhoneInput } from "@/lib/format-phone"
import { FormField, type FieldControlProps, type FormFieldBaseProps } from "./form-field"

export type PhoneInputProps = Partial<FieldControlProps> & {
  /** Dígitos com o país: "5531983794137", o formato da API. */
  value: string | null | undefined
  onChange: (value: string) => void
  onBlur?: () => void
  /** País assumido para quem digita sem "+". */
  defaultCountry?: string
  placeholder?: string
  inputRef?: Ref<HTMLInputElement>
  className?: string
}

/** Posição logo depois do enésimo dígito do texto mascarado. */
function caretAfterDigits(text: string, digits: number) {
  // Antes do primeiro dígito, mas nunca antes do "+": dali o backspace não o alcança.
  if (digits === 0) return text.startsWith("+") ? 1 : 0

  let seen = 0
  for (let index = 0; index < text.length; index++) {
    if (/\d/.test(text[index]) && ++seen === digits) return index + 1
  }
  return text.length
}

/**
 * Telefone com máscara enquanto digita. Quem escreve sem "+" está digitando um número
 * nacional. A máscara muda o texto a cada tecla, então o cursor é devolvido ao mesmo
 * dígito: corrigir o meio do número não joga o cursor para o fim.
 */
export function PhoneInput({
  value,
  onChange,
  onBlur,
  defaultCountry,
  placeholder = "+55 11 91234-5678",
  inputRef,
  className,
  ...aria
}: PhoneInputProps) {
  const local = useRef<HTMLInputElement | null>(null)
  const caret = useRef<number | null>(null)
  // Um "+" sozinho ainda não tem dígito nenhum para guardar no valor, mas é o começo de
  // um número internacional: precisa continuar na tela até o primeiro dígito chegar.
  const [typingPlus, setTypingPlus] = useState(false)
  const digits = onlyDigits(value)
  const display = digits ? formatPhoneInput(digits) : typingPlus ? "+" : ""

  useLayoutEffect(() => {
    if (caret.current === null || !local.current) return
    const position = caretAfterDigits(display, caret.current)
    local.current.setSelectionRange(position, position)
    caret.current = null
  }, [display])

  return (
    <Input
      {...aria}
      ref={(element) => {
        local.current = element
        if (typeof inputRef === "function") inputRef(element)
        else if (inputRef) inputRef.current = element
      }}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      value={display}
      placeholder={placeholder}
      className={className}
      onChange={(event) => {
        const text = event.target.value
        const next = parsePhoneInput(text, defaultCountry)
        setTypingPlus(text.trim() === "+")
        const before = onlyDigits(text.slice(0, event.target.selectionStart ?? text.length))
        // O país entra sozinho no primeiro dígito digitado sem "+".
        const added = next.length - onlyDigits(text).length
        caret.current = before.length + Math.max(0, added)
        onChange(next)
      }}
      onBlur={onBlur}
    />
  )
}

export type PhoneFieldProps<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
> = FormFieldBaseProps<TValues, TName> &
  Pick<PhoneInputProps, "defaultCountry" | "placeholder">

/** `PhoneInput` em formulário. Para validar, `isValidPhone` de `@/lib/format-phone`. */
export function PhoneField<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
>({ defaultCountry, placeholder, ...fieldProps }: PhoneFieldProps<TValues, TName>) {
  return (
    <FormField {...fieldProps}>
      {({ field, controlProps }) => (
        <PhoneInput
          {...controlProps}
          inputRef={field.ref}
          value={field.value}
          onChange={field.onChange}
          onBlur={field.onBlur}
          defaultCountry={defaultCountry}
          placeholder={placeholder}
        />
      )}
    </FormField>
  )
}
