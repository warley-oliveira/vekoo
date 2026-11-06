import type { Ref } from "react"
import { NumberField as NumberFieldPrimitive } from "@base-ui/react/number-field"
import type { FieldPath, FieldValues } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Minus, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { FormField, type FieldControlProps, type FormFieldBaseProps } from "./form-field"

export type NumberInputProps = Partial<FieldControlProps> & {
  value: number | null | undefined
  onChange: (value: number | null) => void
  onBlur?: () => void
  min?: number
  max?: number
  step?: number
  /** Botões de menos e mais, para quantidades pequenas. */
  steppers?: boolean
  /** Formatação do `Intl`: `{ style: "percent" }`, `{ maximumFractionDigits: 2 }`. */
  format?: Intl.NumberFormatOptions
  placeholder?: string
  inputRef?: Ref<HTMLInputElement>
  className?: string
}

/** Número digitado, com separadores do idioma ativo e setas do teclado para ajustar. */
export function NumberInput({
  value,
  onChange,
  onBlur,
  min,
  max,
  step,
  steppers = false,
  format,
  placeholder,
  inputRef,
  className,
  id,
  disabled,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: NumberInputProps) {
  const { t } = useTranslation()
  const language = useLanguage()

  const stepperClass =
    "rounded-none border-0 pointer-coarse:size-10 hover:bg-muted"

  return (
    <NumberFieldPrimitive.Root
      value={value ?? null}
      min={min}
      max={max}
      step={step}
      format={format}
      locale={language}
      disabled={disabled}
      onValueChange={(next) => onChange(next)}
      className={className}
    >
      <NumberFieldPrimitive.Group
        className={cn(
          steppers &&
            "flex w-full overflow-hidden rounded-lg border border-input transition-colors has-focus-visible:border-ring has-focus-visible:ring-3 has-focus-visible:ring-ring/50 has-aria-invalid:border-destructive has-aria-invalid:ring-3 has-aria-invalid:ring-destructive/20"
        )}
      >
        {steppers ? (
          <NumberFieldPrimitive.Decrement
            aria-label={t("kit.form.decrease")}
            render={<Button type="button" variant="ghost" size="icon" className={stepperClass} />}
          >
            <Minus />
          </NumberFieldPrimitive.Decrement>
        ) : null}
        <NumberFieldPrimitive.Input
          id={id}
          ref={inputRef}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
          placeholder={placeholder}
          onBlur={onBlur}
          render={
            <Input
              className={cn(
                "tabular-nums",
                steppers &&
                  "rounded-none border-0 text-center focus-visible:ring-0 aria-invalid:ring-0"
              )}
            />
          }
        />
        {steppers ? (
          <NumberFieldPrimitive.Increment
            aria-label={t("kit.form.increase")}
            render={<Button type="button" variant="ghost" size="icon" className={stepperClass} />}
          >
            <Plus />
          </NumberFieldPrimitive.Increment>
        ) : null}
      </NumberFieldPrimitive.Group>
    </NumberFieldPrimitive.Root>
  )
}

export type NumberFieldProps<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
> = FormFieldBaseProps<TValues, TName> &
  Pick<NumberInputProps, "min" | "max" | "step" | "steppers" | "format" | "placeholder">

/** `NumberInput` em formulário. O valor é `number` ou `null`, nunca string. */
export function NumberField<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
>({
  min,
  max,
  step,
  steppers,
  format,
  placeholder,
  ...fieldProps
}: NumberFieldProps<TValues, TName>) {
  return (
    <FormField {...fieldProps}>
      {({ field, controlProps }) => (
        <NumberInput
          {...controlProps}
          inputRef={field.ref}
          value={field.value}
          onChange={field.onChange}
          onBlur={field.onBlur}
          min={min}
          max={max}
          step={step}
          steppers={steppers}
          format={format}
          placeholder={placeholder}
        />
      )}
    </FormField>
  )
}
