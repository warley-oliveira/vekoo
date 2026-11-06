import { useMemo, type Ref } from "react"
import { Combobox as ComboboxPrimitive } from "@base-ui/react"
import type { FieldPath, FieldValues } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { FormField, type FieldControlProps, type FormFieldBaseProps } from "./form-field"
import type { SelectOption } from "./select-field"

export type MultiSelectInputProps = Partial<FieldControlProps> & {
  options: SelectOption[]
  value: string[] | null | undefined
  onChange: (value: string[]) => void
  onBlur?: () => void
  placeholder?: string
  emptyLabel?: string
  inputRef?: Ref<HTMLInputElement>
  className?: string
}

/** Escolher várias opções: cada uma vira uma etiqueta removível e digitar filtra a lista. */
export function MultiSelectInput({
  options,
  value,
  onChange,
  onBlur,
  placeholder,
  emptyLabel,
  inputRef,
  className,
  id,
  disabled,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: MultiSelectInputProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const anchor = useComboboxAnchor()

  const selected = useMemo(() => {
    const values = value ?? []
    return options.filter((option) => values.includes(option.value))
  }, [options, value])

  return (
    <Combobox<SelectOption, true>
      multiple
      items={options}
      value={selected}
      locale={language}
      disabled={disabled}
      isItemEqualToValue={(item, current) => item.value === current.value}
      onValueChange={(next) => onChange(next.map((option) => option.value))}
      onOpenChange={(open) => {
        if (!open) onBlur?.()
      }}
    >
      <ComboboxChips ref={anchor} className={cn("w-full pointer-coarse:min-h-10", className)}>
        <ComboboxValue>
          {(current: SelectOption[]) => (
            <>
              {current.map((option) => (
                <ComboboxChip key={option.value} aria-label={option.label} showRemove={false} className="pr-0">
                  {option.label}
                  <ComboboxPrimitive.ChipRemove
                    aria-label={t("kit.form.removeItem", { label: option.label })}
                    render={
                      <Button variant="ghost" size="icon-xs" className="size-5 opacity-60 hover:opacity-100" />
                    }
                  >
                    <X className="pointer-events-none" />
                  </ComboboxPrimitive.ChipRemove>
                </ComboboxChip>
              ))}
              <ComboboxChipsInput
                id={id}
                ref={inputRef}
                aria-invalid={ariaInvalid}
                aria-describedby={ariaDescribedBy}
                placeholder={
                  current.length > 0
                    ? undefined
                    : (placeholder ?? t("kit.form.selectPlaceholder"))
                }
                className="bg-transparent text-base placeholder:text-muted-foreground md:text-sm"
              />
            </>
          )}
        </ComboboxValue>
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>{emptyLabel ?? t("kit.form.noOptions")}</ComboboxEmpty>
        <ComboboxList>
          {(option: SelectOption) => (
            <ComboboxItem key={option.value} value={option} disabled={option.disabled}>
              {option.icon}
              {option.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

export type MultiSelectFieldProps<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
> = FormFieldBaseProps<TValues, TName> &
  Pick<MultiSelectInputProps, "options" | "placeholder" | "emptyLabel">

/** `MultiSelectInput` em formulário: o valor é um array de strings. */
export function MultiSelectField<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
>({
  options,
  placeholder,
  emptyLabel,
  ...fieldProps
}: MultiSelectFieldProps<TValues, TName>) {
  return (
    <FormField {...fieldProps}>
      {({ field, controlProps }) => (
        <MultiSelectInput
          {...controlProps}
          inputRef={field.ref}
          options={options}
          value={field.value}
          onChange={field.onChange}
          onBlur={field.onBlur}
          placeholder={placeholder}
          emptyLabel={emptyLabel}
        />
      )}
    </FormField>
  )
}
