import type { ComponentProps, ReactNode } from "react"

import { cn } from "@/lib/utils"

export type StatusTone = "neutral" | "success" | "warning" | "danger" | "info" | "accent"

const TONES: Record<StatusTone, string> = {
  neutral: "bg-status-neutral-soft text-status-neutral",
  success: "bg-status-success-soft text-status-success",
  warning: "bg-status-warning-soft text-status-warning",
  danger: "bg-status-danger-soft text-status-danger",
  info: "bg-status-info-soft text-status-info",
  accent: "bg-status-accent-soft text-status-accent",
}

export type StatusBadgeProps = Omit<ComponentProps<"span">, "children"> & {
  tone?: StatusTone
  /** Ícone no lugar do ponto, quando ajuda a ler o estado sem depender da cor. */
  icon?: ReactNode
  /** Sem o ponto, para rótulos que não são um estado vivo. */
  dot?: boolean
  children: ReactNode
}

/** Estado de um registro: ativo, pendente, falhou. Sempre com texto, nunca só a cor. */
export function StatusBadge({
  tone = "neutral",
  icon,
  dot = true,
  className,
  children,
  ...props
}: StatusBadgeProps) {
  return (
    <span
      data-slot="status-badge"
      data-tone={tone}
      className={cn(
        "inline-flex h-5 w-fit max-w-full shrink-0 items-center gap-1.5 rounded-full px-2 text-xs font-medium whitespace-nowrap [&>svg]:size-3 [&>svg]:shrink-0",
        TONES[tone],
        className
      )}
      {...props}
    >
      {icon ?? (dot ? <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" /> : null)}
      <span className="truncate">{children}</span>
    </span>
  )
}
