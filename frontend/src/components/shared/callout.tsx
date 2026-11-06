import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

const TONES = {
  neutral: "bg-muted/60 text-foreground",
  warning: "bg-status-warning-soft text-status-warning",
  danger: "bg-status-danger-soft text-status-danger",
  info: "bg-status-info-soft text-status-info",
} as const

export type CalloutProps = {
  tone?: keyof typeof TONES
  icon?: ReactNode
  title?: ReactNode
  children?: ReactNode
  /** À direita no desktop, embaixo no celular. */
  action?: ReactNode
  role?: "alert" | "status"
  className?: string
}

/** Um recado no meio da tela: por que algo está travado e o que dá para fazer. */
export function Callout({
  tone = "neutral",
  icon,
  title,
  children,
  action,
  role,
  className,
}: CalloutProps) {
  return (
    <div
      role={role}
      data-slot="callout"
      className={cn(
        "flex flex-col gap-3 rounded-lg px-3 py-2.5 text-sm sm:flex-row sm:items-start",
        TONES[tone],
        className
      )}
    >
      <div className="flex min-w-0 flex-1 gap-2.5">
        {icon ? <span className="mt-0.5 shrink-0 [&>svg]:size-4">{icon}</span> : null}
        <div className="min-w-0 flex-1 space-y-0.5">
          {title ? <p className="leading-snug font-medium">{title}</p> : null}
          {children ? (
            <div
              className={cn(
                "leading-snug text-pretty",
                title && tone === "neutral" && "text-muted-foreground"
              )}
            >
              {children}
            </div>
          ) : null}
        </div>
      </div>
      {action ? <div className="shrink-0 sm:-my-0.5">{action}</div> : null}
    </div>
  )
}
