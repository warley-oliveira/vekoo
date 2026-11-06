import type { ReactNode } from "react"

import { Switch } from "@/components/ui/switch"

type InstantSwitchProps = {
  label: string
  hint?: ReactNode
  checked: boolean
  disabled?: boolean
  onCheckedChange: (checked: boolean) => void
}

/** Interruptor que vale na hora, sem botão de salvar. A linha inteira responde ao toque. */
export function InstantSwitch({ label, hint, checked, disabled, onCheckedChange }: InstantSwitchProps) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 pointer-coarse:min-h-10">
      <span className="min-w-0 space-y-0.5">
        <span className="block text-sm leading-snug font-medium">{label}</span>
        {hint ? (
          <span className="block text-xs leading-snug text-pretty text-muted-foreground">{hint}</span>
        ) : null}
      </span>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </label>
  )
}
