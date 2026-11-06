import { useState, type Ref } from "react"
import type { FieldPath, FieldValues } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { CalendarDays } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { formatDate } from "@/lib/date-format"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { CALENDAR_CELLS, useCalendarLocale } from "./calendar-config"
import { FormField, type FieldControlProps, type FormFieldBaseProps } from "./form-field"
import { ResponsivePopover } from "./responsive-popover"

export type DatePickerProps = Partial<FieldControlProps> & {
  value: Date | null | undefined
  onChange: (value: Date | null) => void
  onBlur?: () => void
  /** Título do painel no celular e nome do calendário. */
  label?: string
  placeholder?: string
  min?: Date
  max?: Date
  /** Mostra "Limpar" no painel. */
  clearable?: boolean
  triggerRef?: Ref<HTMLButtonElement>
  className?: string
}

/** Escolher um dia num calendário, com seleção de mês e ano para saltos longos. */
export function DatePicker({
  value,
  onChange,
  onBlur,
  label,
  placeholder,
  min,
  max,
  clearable = false,
  triggerRef,
  className,
  ...aria
}: DatePickerProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const locale = useCalendarLocale()
  const [open, setOpen] = useState(false)

  return (
    <ResponsivePopover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) onBlur?.()
      }}
      title={label ?? t("kit.date.pickDate")}
      className="w-auto gap-0 p-0"
      trigger={
        <Button
          {...aria}
          ref={triggerRef}
          type="button"
          variant="outline"
          className={cn(
            "w-full justify-start px-2.5 font-normal pointer-coarse:h-10",
            !value && "text-muted-foreground",
            className
          )}
        >
          <CalendarDays className="text-muted-foreground" />
          <span className="truncate">
            {value
              ? formatDate(value, language)
              : (placeholder ?? t("kit.date.pickDate"))}
          </span>
        </Button>
      }
    >
      <Calendar
        mode="single"
        locale={locale}
        captionLayout="dropdown"
        className={CALENDAR_CELLS}
        selected={value ?? undefined}
        defaultMonth={value ?? undefined}
        startMonth={min}
        endMonth={max}
        disabled={[
          ...(min ? [{ before: min }] : []),
          ...(max ? [{ after: max }] : []),
        ]}
        onSelect={(day) => {
          onChange(day ?? null)
          setOpen(false)
        }}
      />
      {clearable && value ? (
        <div className="flex justify-end border-t p-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange(null)
              setOpen(false)
            }}
          >
            {t("kit.actions.clear")}
          </Button>
        </div>
      ) : null}
    </ResponsivePopover>
  )
}

export type DateFieldProps<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
> = FormFieldBaseProps<TValues, TName> &
  Pick<DatePickerProps, "placeholder" | "min" | "max" | "clearable">

/** `DatePicker` em formulário. O valor é `Date` ou `null`; a API recebe `.getTime()`. */
export function DateField<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
>({
  placeholder,
  min,
  max,
  clearable,
  ...fieldProps
}: DateFieldProps<TValues, TName>) {
  return (
    <FormField {...fieldProps}>
      {({ field, controlProps }) => (
        <DatePicker
          {...controlProps}
          triggerRef={field.ref}
          label={fieldProps.label}
          value={field.value}
          onChange={field.onChange}
          onBlur={field.onBlur}
          placeholder={placeholder}
          min={min}
          max={max}
          clearable={clearable}
        />
      )}
    </FormField>
  )
}
