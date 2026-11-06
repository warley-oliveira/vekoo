import { useId } from "react"
import type { Control, FieldPath, FieldValues } from "react-hook-form"

import { Callout, DateField, DateTimeField as KitDateTimeField } from "@/components/shared"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

export { Callout }

/** Dia e hora, ou só o dia. Sempre "data de campo": a hora de parede no fuso do calendário. */
export function DateTimeField<TValues extends FieldValues, TName extends FieldPath<TValues>>({
  control,
  name,
  label,
  min,
  dateOnly = false,
}: {
  control: Control<TValues>
  name: TName
  label: string
  min?: Date
  dateOnly?: boolean
}) {
  return dateOnly ? (
    <DateField control={control} name={name} label={label} min={min} />
  ) : (
    <KitDateTimeField control={control} name={name} label={label} min={min} />
  )
}

/** Um interruptor que não é campo do formulário: mexe em outros campos. */
export function SwitchInputRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  const id = useId()
  return (
    <div className="flex min-h-9 items-center justify-between gap-3">
      <Label htmlFor={id} className="font-normal">
        {label}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  )
}
