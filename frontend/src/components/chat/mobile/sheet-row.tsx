import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/** Uma ação numa folha: alta o bastante para o polegar, com ícone e o que acontece ao tocar. */
export function SheetRow({
  icon,
  title,
  hint,
  destructive = false,
  disabled = false,
  trailing,
  onClick,
}: {
  icon: ReactNode
  title: string
  hint?: string
  destructive?: boolean
  disabled?: boolean
  trailing?: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      data-slot="sheet-row"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted disabled:opacity-50",
        destructive && "text-destructive"
      )}
    >
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-full [&_svg]:size-5",
          destructive ? "bg-destructive/10" : "bg-muted text-muted-foreground"
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        {hint ? <span className="block truncate text-xs text-muted-foreground">{hint}</span> : null}
      </span>
      {trailing}
    </button>
  )
}
