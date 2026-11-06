import type { ReactNode } from "react"

import { ActionsMenu, AvatarStack, type AvatarStackUser, type RowAction } from "@/components/shared"
import { cn } from "@/lib/utils"

type EntityCardProps = {
  title: string
  /** "Padrão", "Inativo". */
  badge?: ReactNode
  description?: ReactNode
  people: AvatarStackUser[]
  /** "2 pessoas", "Ninguém ainda". */
  peopleLabel: string
  onOpen: () => void
  actions?: RowAction[]
  actionsLabel?: string
  muted?: boolean
}

/**
 * Um departamento ou um grupo: o nome, o que ele é e quem está nele. O cartão inteiro abre o
 * painel; o botão de verdade é o título, para o teclado e o leitor de tela o acharem.
 */
export function EntityCard({
  title,
  badge,
  description,
  people,
  peopleLabel,
  onOpen,
  actions,
  actionsLabel,
  muted = false,
}: EntityCardProps) {
  return (
    <article className="relative flex h-full min-h-32 flex-col gap-2.5 rounded-xl p-4 ring-1 ring-foreground/10 transition-colors hover:bg-muted/40">
      <div className="flex items-start gap-2">
        <h2 className="min-w-0 flex-1 font-heading text-base leading-snug font-medium">
          <button
            type="button"
            onClick={onOpen}
            className={cn(
              "rounded text-left outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-3 focus-visible:after:ring-ring/50",
              muted && "text-muted-foreground"
            )}
          >
            {title}
          </button>
        </h2>
        {badge}
        {actions ? (
          <ActionsMenu
            actions={actions}
            label={actionsLabel}
            className="relative z-10 -my-1 -mr-1.5 shrink-0"
          />
        ) : null}
      </div>
      {description ? (
        <div className="line-clamp-3 text-sm text-pretty text-muted-foreground">{description}</div>
      ) : null}
      <div className="mt-auto flex items-center gap-2 pt-1">
        <AvatarStack users={people} max={4} size="sm" />
        <span className="text-xs text-muted-foreground tabular-nums">{peopleLabel}</span>
      </div>
    </article>
  )
}
