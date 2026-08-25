import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Minus, Plus, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// Peças comuns aos dois painéis (card e bloco): o painel do card e o do bloco
// são telas diferentes, mas falam a mesma língua visual.

export function Section({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  )
}

export function PanelHeader({
  icon,
  title,
  onClose,
}: {
  icon?: ReactNode
  title: string
  onClose?: () => void
}) {
  const { t } = useTranslation()

  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
      {icon}
      <span className="truncate text-sm font-medium">{title}</span>
      {onClose && (
        <Button
          variant="ghost"
          size="icon-xs"
          className="ml-auto"
          aria-label={t("editor.properties.closeAria")}
          onClick={onClose}
        >
          <X />
        </Button>
      )}
    </div>
  )
}

/**
 * Botão redondo de cor. `color` é a cor da obra do usuário (string oklch crua
 * do tema), nunca um token da ferramenta — por isso vai em `style`.
 */
export function Swatch({
  color,
  label,
  selected,
  muted = false,
  onClick,
}: {
  color: string
  label: string
  selected: boolean
  muted?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "flex size-7 items-center justify-center rounded-full border bg-background outline-none",
        "focus-visible:ring-3 focus-visible:ring-ring/50",
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-background"
      )}
    >
      <span
        className="size-4.5 rounded-full"
        style={{ backgroundColor: color, opacity: muted ? 0.45 : 1 }}
      />
    </button>
  )
}

/** Opção em grade com prévia desenhada — layouts, estilos de arte, formatos. */
export function OptionTile({
  label,
  selected,
  onClick,
  children,
  className,
}: {
  label: string
  selected: boolean
  onClick: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      onClick={onClick}
      title={label}
      className={cn(
        "overflow-hidden rounded-md border bg-background outline-none transition-colors",
        "hover:border-primary/50 focus-visible:ring-3 focus-visible:ring-ring/50",
        selected && "border-primary ring-1 ring-primary",
        className
      )}
    >
      {children}
    </button>
  )
}

export function Stepper({
  count,
  canDecrement,
  onDecrement,
  onIncrement,
  decrementAria,
  incrementAria,
}: {
  count: number
  canDecrement: boolean
  onDecrement: () => void
  onIncrement: () => void
  decrementAria: string
  incrementAria: string
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Button
        variant="outline"
        size="icon-sm"
        aria-label={decrementAria}
        disabled={!canDecrement}
        onClick={onDecrement}
      >
        <Minus />
      </Button>
      <span className="w-8 text-center text-sm tabular-nums">{count}</span>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label={incrementAria}
        onClick={onIncrement}
      >
        <Plus />
      </Button>
    </div>
  )
}
