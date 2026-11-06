import type { ComponentProps } from "react"
import { useWatch, type FieldPath, type FieldValues } from "react-hook-form"

import { Textarea } from "@/components/ui/textarea"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { FormField, type FormFieldBaseProps } from "./form-field"

export type TextareaFieldProps<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
> = FormFieldBaseProps<TValues, TName> &
  Omit<
    ComponentProps<"textarea">,
    "name" | "value" | "defaultValue" | "onChange" | "onBlur" | "form" | "className" | "disabled"
  > & {
    /** Mostra quantos caracteres restam, a partir do `maxLength`. */
    showCount?: boolean
    textareaClassName?: string
  }

/** Texto de várias linhas, que cresce com o conteúdo. */
export function TextareaField<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
>({
  control,
  name,
  label,
  hint,
  action,
  optional,
  disabled,
  className,
  showCount = false,
  textareaClassName,
  maxLength,
  ...textareaProps
}: TextareaFieldProps<TValues, TName>) {
  const language = useLanguage()
  const value = useWatch({ control, name }) as string | null | undefined

  const counter =
    showCount && maxLength ? (
      <span className="text-xs leading-none text-muted-foreground tabular-nums">
        {formatNumber(value?.length ?? 0, language)}/{formatNumber(maxLength, language)}
      </span>
    ) : null

  return (
    <FormField
      control={control}
      name={name}
      label={label}
      hint={hint}
      optional={optional}
      disabled={disabled}
      className={className}
      action={
        counter || action ? (
          <>
            {counter}
            {action}
          </>
        ) : undefined
      }
    >
      {({ field, controlProps }) => (
        <Textarea
          {...textareaProps}
          {...controlProps}
          name={field.name}
          ref={field.ref}
          value={field.value ?? ""}
          onChange={field.onChange}
          onBlur={field.onBlur}
          maxLength={maxLength}
          className={textareaClassName}
        />
      )}
    </FormField>
  )
}
