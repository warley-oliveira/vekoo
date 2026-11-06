import type { FieldPath, FieldValues } from "react-hook-form"
import { useTranslation } from "react-i18next"

import { Input } from "@/components/ui/input"
import { toTimeInputValue } from "@/lib/date-format"
import { cn } from "@/lib/utils"
import { DatePicker, type DatePickerProps } from "./date-field"
import { FormField, type FormFieldBaseProps } from "./form-field"

const DEFAULT_TIME = "09:00"

function withTime(date: Date, time: string) {
  const [hours, minutes] = time.split(":").map(Number)
  const next = new Date(date)
  next.setHours(hours || 0, minutes || 0, 0, 0)
  return next
}

export type DateTimePickerProps = Omit<DatePickerProps, "clearable"> & {
  /** Hora assumida ao escolher o dia, enquanto a pessoa não escolheu nenhuma. */
  defaultTime?: string
}

/** Dia e hora lado a lado. A hora usa o controle nativo, melhor que qualquer outro no toque. */
export function DateTimePicker({
  value,
  onChange,
  onBlur,
  defaultTime = DEFAULT_TIME,
  className,
  disabled,
  ...pickerProps
}: DateTimePickerProps) {
  const { t } = useTranslation()

  return (
    <div className={cn("flex min-w-0 gap-2", className)}>
      <DatePicker
        {...pickerProps}
        disabled={disabled}
        value={value}
        onBlur={onBlur}
        className="min-w-0 flex-1"
        onChange={(day) => {
          if (!day) return onChange(null)
          onChange(withTime(day, value ? toTimeInputValue(value) : defaultTime))
        }}
      />
      <Input
        type="time"
        step={60}
        aria-label={t("kit.date.time")}
        aria-invalid={pickerProps["aria-invalid"]}
        disabled={disabled}
        value={value ? toTimeInputValue(value) : ""}
        className="w-28 shrink-0 tabular-nums"
        onBlur={onBlur}
        onChange={(event) => {
          if (event.target.value) {
            onChange(withTime(value ?? new Date(), event.target.value))
          }
        }}
      />
    </div>
  )
}

export type DateTimeFieldProps<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
> = FormFieldBaseProps<TValues, TName> &
  Pick<DateTimePickerProps, "placeholder" | "min" | "max" | "defaultTime">

/** `DateTimePicker` em formulário: agendamentos, envios programados. O valor é `Date` ou `null`. */
export function DateTimeField<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
>({
  placeholder,
  min,
  max,
  defaultTime,
  ...fieldProps
}: DateTimeFieldProps<TValues, TName>) {
  return (
    <FormField {...fieldProps}>
      {({ field, controlProps }) => (
        <DateTimePicker
          {...controlProps}
          triggerRef={field.ref}
          label={fieldProps.label}
          value={field.value}
          onChange={field.onChange}
          onBlur={field.onBlur}
          placeholder={placeholder}
          min={min}
          max={max}
          defaultTime={defaultTime}
        />
      )}
    </FormField>
  )
}
