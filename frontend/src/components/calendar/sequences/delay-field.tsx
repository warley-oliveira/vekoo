import { useId, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Pencil } from "lucide-react"

import { periodOptions } from "@/components/calendar/settings/rule-helpers"
import { NumberInput, SelectInput } from "@/components/shared"
import { Button } from "@/components/ui/button"
import type { ReminderPeriod } from "@/lib/calendar/types"
import { cn } from "@/lib/utils"

const PRESETS: { amount: number; unit: ReminderPeriod }[] = [
  { amount: 5, unit: "minutes" },
  { amount: 15, unit: "minutes" },
  { amount: 30, unit: "minutes" },
  { amount: 1, unit: "hours" },
  { amount: 3, unit: "hours" },
  { amount: 1, unit: "days" },
]

type DelayFieldProps = {
  label: string
  hint?: ReactNode
  error?: string
  amount: number | null
  unit: ReminderPeriod
  onChange: (amount: number | null, unit: ReminderPeriod) => void
}

/** Quanto tempo esperar: os atalhos resolvem a maior parte, e "Outro" abre valor e unidade. */
export function DelayField({ label, hint, error, amount, unit, onChange }: DelayFieldProps) {
  const { t } = useTranslation()
  const labelId = useId()
  const messageId = useId()
  const [wantsCustom, setWantsCustom] = useState(false)

  const matchesPreset = PRESETS.some((preset) => preset.amount === amount && preset.unit === unit)
  const showCustom = wantsCustom || !matchesPreset
  const message = error ?? hint

  return (
    <div className="space-y-1.5">
      <span id={labelId} className="block text-sm leading-none font-medium">
        {label}
      </span>
      <div
        role="group"
        aria-labelledby={labelId}
        aria-describedby={message ? messageId : undefined}
        className="flex flex-wrap gap-1 pointer-coarse:gap-1.5"
      >
        {PRESETS.map((preset) => {
          const selected = !showCustom && preset.amount === amount && preset.unit === unit
          return (
            <Button
              key={`${preset.amount}-${preset.unit}`}
              type="button"
              variant="outline"
              size="sm"
              aria-pressed={selected}
              className={cn(
                "font-normal pointer-coarse:h-10",
                selected && "border-primary bg-accent/50 text-accent-foreground hover:bg-accent/50"
              )}
              onClick={() => {
                setWantsCustom(false)
                onChange(preset.amount, preset.unit)
              }}
            >
              {t(`calendar.sequences.delay.preset.${preset.unit}`, { count: preset.amount })}
            </Button>
          )
        })}
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-pressed={showCustom}
          className={cn(
            "font-normal pointer-coarse:h-10",
            showCustom && "border-primary bg-accent/50 text-accent-foreground hover:bg-accent/50"
          )}
          onClick={() => setWantsCustom(true)}
        >
          <Pencil />
          {t("calendar.sequences.delay.custom")}
        </Button>
      </div>
      {showCustom ? (
        <div className="grid max-w-xs grid-cols-[minmax(0,6rem)_minmax(0,1fr)] gap-2 pt-1">
          <NumberInput
            aria-label={t("calendar.sequences.delay.amount")}
            aria-invalid={Boolean(error)}
            value={amount}
            min={1}
            onChange={(next) => onChange(next, unit)}
          />
          <SelectInput
            aria-label={t("calendar.sequences.delay.unit")}
            options={periodOptions(t, amount)}
            value={unit}
            onChange={(next) => onChange(amount, (next ?? unit) as ReminderPeriod)}
          />
        </div>
      ) : null}
      {message ? (
        <p
          id={messageId}
          role={error ? "alert" : undefined}
          className={cn(
            "text-xs leading-snug text-pretty",
            error ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {message}
        </p>
      ) : null}
    </div>
  )
}
