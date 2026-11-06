import type { ReactNode } from "react"

import type { DateInput } from "@/lib/date-format"
import { cn } from "@/lib/utils"
import { RelativeTime } from "./relative-time"
import type { StatusTone } from "./status-badge"

const MARKER_TONES: Record<StatusTone, string> = {
  neutral: "bg-status-neutral-soft text-status-neutral",
  success: "bg-status-success-soft text-status-success",
  warning: "bg-status-warning-soft text-status-warning",
  danger: "bg-status-danger-soft text-status-danger",
  info: "bg-status-info-soft text-status-info",
  accent: "bg-status-accent-soft text-status-accent",
}

export type TimelineItem = {
  id: string
  title: ReactNode
  description?: ReactNode
  time?: DateInput | null
  /** Ícone no marcador. Sem ele, um ponto. */
  icon?: ReactNode
  tone?: StatusTone
  /** Conteúdo livre abaixo da descrição (prévia, anexo, botão). */
  content?: ReactNode
}

export type TimelineProps = {
  items: TimelineItem[]
  className?: string
}

/** Histórico em ordem: atividades de um contato, passos de um envio, registro de eventos. */
export function Timeline({ items, className }: TimelineProps) {
  return (
    <ol className={cn("flex flex-col", className)}>
      {items.map((item, index) => {
        const last = index === items.length - 1

        return (
          <li key={item.id} className="relative flex gap-3 pb-5 last:pb-0">
            {!last && (
              <span
                aria-hidden
                className="absolute top-7 bottom-1 left-3 w-px -translate-x-1/2 bg-border"
              />
            )}
            <span
              aria-hidden
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full [&>svg]:size-3.5",
                MARKER_TONES[item.tone ?? "neutral"]
              )}
            >
              {item.icon ?? <span className="size-1.5 rounded-full bg-current" />}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <p className="min-w-0 text-sm font-medium">{item.title}</p>
                {item.time !== undefined && item.time !== null ? (
                  <RelativeTime
                    value={item.time}
                    className="shrink-0 text-xs text-muted-foreground"
                  />
                ) : null}
              </div>
              {item.description ? (
                <p className="mt-0.5 text-sm text-pretty text-muted-foreground">
                  {item.description}
                </p>
              ) : null}
              {item.content ? <div className="mt-2">{item.content}</div> : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
