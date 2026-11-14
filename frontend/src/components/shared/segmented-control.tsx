import { useId, type ReactNode } from "react"
import { Toggle } from "@base-ui/react/toggle"
import { ToggleGroup } from "@base-ui/react/toggle-group"
import { motion } from "motion/react"

import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { useMotionPreset } from "@/lib/motion"
import { cn } from "@/lib/utils"

export type SegmentedOption<T extends string = string> = {
  value: T
  label: ReactNode
  icon?: ReactNode
  count?: number
  disabled?: boolean
  /** Obrigatório quando o rótulo não é texto (só o ícone). */
  "aria-label"?: string
}

export type SegmentedControlProps<T extends string = string> = {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  /** Ocupa a largura toda, com os segmentos divididos por igual. */
  fullWidth?: boolean
  "aria-label"?: string
  className?: string
}

/** Alternar entre 2 a 5 visões da mesma coisa: grade e lista, abertas e encerradas. */
export function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  fullWidth = false,
  "aria-label": ariaLabel,
  className,
}: SegmentedControlProps<T>) {
  const language = useLanguage()
  const preset = useMotionPreset()
  const indicatorId = useId()

  return (
    <ToggleGroup
      data-slot="segmented-control"
      aria-label={ariaLabel}
      value={[value]}
      // Segmentado sempre tem um ativo: clicar no que já está ativo não desliga.
      onValueChange={(next) => {
        if (next[0] !== undefined) onChange(next[0] as T)
      }}
      className={cn(
        "inline-flex w-fit max-w-full items-center gap-0.5 overflow-x-auto rounded-lg bg-muted p-0.5",
        fullWidth && "flex w-full",
        className
      )}
    >
      {options.map((option) => {
        const active = option.value === value

        return (
          <Toggle
            key={option.value}
            value={option.value}
            disabled={option.disabled}
            aria-label={option["aria-label"]}
            className={cn(
              "relative inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-md px-2.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none select-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 pointer-coarse:h-10 pointer-coarse:px-3 [&_svg]:size-4 [&_svg]:shrink-0",
              active && "text-foreground",
              fullWidth && "flex-1"
            )}
          >
            {active ? (
              <motion.span
                layoutId={indicatorId}
                transition={preset.spring}
                className="absolute inset-0 rounded-md bg-background shadow-xs ring-1 ring-foreground/5 dark:bg-foreground/12 dark:ring-foreground/10"
              />
            ) : null}
            <span className="relative z-10 inline-flex items-center gap-1.5">
              {option.icon}
              {option.label}
              {option.count !== undefined ? (
                <span className="text-xs font-normal text-muted-foreground tabular-nums">
                  {formatNumber(option.count, language)}
                </span>
              ) : null}
            </span>
          </Toggle>
        )
      })}
    </ToggleGroup>
  )
}
