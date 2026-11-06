import { useMemo, type ReactNode, type Ref } from "react"
import type { FieldPath, FieldValues } from "react-hook-form"
import { useTranslation } from "react-i18next"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { FormField, type FieldControlProps, type FormFieldBaseProps } from "./form-field"

/** Opção de todos os seletores do kit. */
export type SelectOption = {
  value: string
  label: string
  icon?: ReactNode
  /** Linha de apoio, no combobox e nos filtros. */
  description?: string
  disabled?: boolean
}

export type SelectInputProps = Partial<FieldControlProps> & {
  "aria-label"?: string
  options: SelectOption[]
  value: string | null | undefined
  onChange: (value: string | null) => void
  onBlur?: () => void
  placeholder?: string
  /** Texto da opção que volta ao vazio. Sem ele, depois de escolher não dá para desfazer. */
  clearLabel?: string
  size?: "sm" | "default"
  triggerRef?: Ref<HTMLButtonElement>
  className?: string
}

/** Seletor simples, fora de formulário. Mais de 10 opções pedem `SearchableSelect`. */
export function SelectInput({
  options,
  value,
  onChange,
  onBlur,
  placeholder,
  clearLabel,
  size,
  triggerRef,
  className,
  disabled,
  ...aria
}: SelectInputProps) {
  const { t } = useTranslation()

  const items = useMemo(
    () => [
      ...(clearLabel ? [{ value: null as string | null, label: clearLabel }] : []),
      ...options.map((option) => ({ value: option.value as string | null, label: option.label })),
    ],
    [clearLabel, options]
  )

  return (
    <Select
      items={items}
      value={value ?? null}
      disabled={disabled}
      onValueChange={(next: string | null) => onChange(next)}
      onOpenChange={(open) => {
        if (!open) onBlur?.()
      }}
    >
      <SelectTrigger
        {...aria}
        ref={triggerRef}
        size={size}
        className={cn("w-full", className)}
      >
        <SelectValue placeholder={placeholder ?? t("kit.form.selectPlaceholder")} />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} align="start">
        {clearLabel ? (
          <SelectItem value={null} className="text-muted-foreground">
            {clearLabel}
          </SelectItem>
        ) : null}
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
            {option.icon}
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export type SelectFieldProps<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
> = FormFieldBaseProps<TValues, TName> &
  Pick<SelectInputProps, "options" | "placeholder" | "clearLabel">

/** Escolher uma entre poucas opções, em formulário. */
export function SelectField<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
>({
  options,
  placeholder,
  clearLabel,
  ...fieldProps
}: SelectFieldProps<TValues, TName>) {
  return (
    <FormField {...fieldProps}>
      {({ field, controlProps }) => (
        <SelectInput
          {...controlProps}
          triggerRef={field.ref}
          options={options}
          value={field.value}
          onChange={field.onChange}
          onBlur={field.onBlur}
          placeholder={placeholder}
          clearLabel={clearLabel}
        />
      )}
    </FormField>
  )
}
