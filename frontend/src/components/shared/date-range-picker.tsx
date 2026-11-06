import { useState, type Ref } from "react"
import type { FieldPath, FieldValues } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { CalendarRange, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { useIsMobile } from "@/hooks/use-is-mobile"
import { endOfDay, formatDateInterval, startOfDay } from "@/lib/date-format"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { CALENDAR_CELLS, useCalendarLocale } from "./calendar-config"
import {
  useDateRangePresets,
  type DateRangePreset,
  type DateRangeValue,
} from "./date-range-presets"
import { FormField, type FieldControlProps, type FormFieldBaseProps } from "./form-field"
import { ResponsivePopover } from "./responsive-popover"

export type DateRangePickerProps = Partial<FieldControlProps> & {
  value: DateRangeValue | null | undefined
  onChange: (value: DateRangeValue | null) => void
  onBlur?: () => void
  /** Título do painel no celular e nome do calendário. */
  label?: string
  placeholder?: string
  presets?: DateRangePreset[]
  size?: "sm" | "default"
  /** Oculta o X do botão, quando o período é obrigatório. */
  required?: boolean
  triggerRef?: Ref<HTMLButtonElement>
  className?: string
}

/**
 * Período, com atalhos. Atalho aplica na hora; no calendário a pessoa marca início e
 * fim e confirma, porque o primeiro clique já é um intervalo válido de um dia e fechar
 * ali impediria escolher o segundo.
 */
export function DateRangePicker({
  value,
  onChange,
  onBlur,
  label,
  placeholder,
  presets: customPresets,
  size = "default",
  required = false,
  triggerRef,
  className,
  ...aria
}: DateRangePickerProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const locale = useCalendarLocale()
  const isMobile = useIsMobile()
  const defaultPresets = useDateRangePresets()
  const presets = customPresets ?? defaultPresets

  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<{ from?: Date; to?: Date } | undefined>(undefined)

  function close() {
    setOpen(false)
    onBlur?.()
  }

  function apply(next: DateRangeValue | null) {
    onChange(next)
    close()
  }

  const draftReady = Boolean(draft?.from)

  return (
    <div className={cn("relative min-w-0", className)}>
      <ResponsivePopover
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (next) setDraft(value ?? undefined)
          else onBlur?.()
        }}
        title={label ?? t("kit.date.pickRange")}
        className="w-auto gap-0 p-0"
        sheetClassName="px-0"
        trigger={
          <Button
            {...aria}
            ref={triggerRef}
            type="button"
            variant="outline"
            size={size === "sm" ? "sm" : "default"}
            className={cn(
              "w-full justify-start font-normal pointer-coarse:h-10",
              size === "default" && "px-2.5",
              !value && "text-muted-foreground",
              value && !required && "pr-8"
            )}
          >
            <CalendarRange className="text-muted-foreground" />
            <span className="truncate">
              {value
                ? formatDateInterval(value.from, value.to, language)
                : (placeholder ?? t("kit.date.pickRange"))}
            </span>
          </Button>
        }
      >
        <div className="flex flex-col md:flex-row">
          <div
            role="group"
            aria-label={t("kit.date.presetsLabel")}
            className="flex shrink-0 gap-1.5 overflow-x-auto px-4 pb-2 md:w-40 md:flex-col md:gap-0.5 md:overflow-visible md:border-r md:p-2"
          >
            {presets.map((preset) => (
              <Button
                key={preset.id}
                type="button"
                variant={isMobile ? "outline" : "ghost"}
                size="sm"
                className="shrink-0 justify-start font-normal"
                onClick={() => apply(preset.range())}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          <div className="flex min-w-0 flex-col">
            <Calendar
              mode="range"
              locale={locale}
              className={CALENDAR_CELLS}
              numberOfMonths={isMobile ? 1 : 2}
              selected={draft?.from ? { from: draft.from, to: draft.to } : undefined}
              defaultMonth={draft?.from ?? value?.from}
              onSelect={(range) => setDraft(range ?? undefined)}
            />
            <div className="flex items-center justify-between gap-2 border-t px-4 py-2 md:px-2">
              <span className="min-w-0 truncate px-1 text-xs text-muted-foreground tabular-nums">
                {draft?.from
                  ? formatDateInterval(draft.from, draft.to ?? draft.from, language)
                  : t("kit.date.rangeHint")}
              </span>
              <Button
                type="button"
                size="sm"
                disabled={!draftReady}
                className="shrink-0 pointer-coarse:h-10"
                onClick={() => {
                  if (!draft?.from) return
                  apply({
                    from: startOfDay(draft.from),
                    to: endOfDay(draft.to ?? draft.from),
                  })
                }}
              >
                {t("kit.actions.apply")}
              </Button>
            </div>
          </div>
        </div>
      </ResponsivePopover>
      {value && !required ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={t("kit.date.clearRange")}
          className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground"
          onClick={() => onChange(null)}
        >
          <X />
        </Button>
      ) : null}
    </div>
  )
}

export type DateRangeFieldProps<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
> = FormFieldBaseProps<TValues, TName> &
  Pick<DateRangePickerProps, "placeholder" | "presets" | "required">

/** `DateRangePicker` em formulário. O valor é `{ from, to }` ou `null`. */
export function DateRangeField<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
>({
  placeholder,
  presets,
  required,
  ...fieldProps
}: DateRangeFieldProps<TValues, TName>) {
  return (
    <FormField {...fieldProps}>
      {({ field, controlProps }) => (
        <DateRangePicker
          {...controlProps}
          triggerRef={field.ref}
          label={fieldProps.label}
          value={field.value}
          onChange={field.onChange}
          onBlur={field.onBlur}
          placeholder={placeholder}
          presets={presets}
          required={required}
        />
      )}
    </FormField>
  )
}
