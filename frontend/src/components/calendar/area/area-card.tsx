import type { ReactNode } from "react"

import { ActionsMenu, type RowAction } from "@/components/shared"
import { cn } from "@/lib/utils"

type AreaCardProps = {
  title: string
  /** Avatar ou a cor da turma, à esquerda do título. */
  leading?: ReactNode
  /** A linha logo abaixo do título. */
  subtitle?: ReactNode
  /** "Inativa", "Precisa repartir". */
  badges?: ReactNode
  onOpen: () => void
  actions?: RowAction[]
  actionsLabel?: string
  muted?: boolean
  children?: ReactNode
  /** O que fica colado embaixo. Botão aqui dentro precisa de `relative z-10`. */
  footer?: ReactNode
}

/**
 * Um colaborador, um serviço ou uma turma. O cartão inteiro abre o painel; o botão de verdade é o
 * título, para o teclado e o leitor de tela o acharem. Como `EntityCard`, sem a pilha de rostos.
 */
export function AreaCard({
  title,
  leading,
  subtitle,
  badges,
  onOpen,
  actions,
  actionsLabel,
  muted = false,
  children,
  footer,
}: AreaCardProps) {
  return (
    <article className="relative flex h-full flex-col gap-3 rounded-xl p-4 ring-1 ring-foreground/10 transition-colors hover:bg-muted/40">
      <div className="flex items-start gap-3">
        {leading ? <div className="shrink-0">{leading}</div> : null}
        <div className="min-w-0 flex-1 space-y-0.5">
          <h2 className="font-heading text-base leading-snug font-medium">
            <button
              type="button"
              onClick={onOpen}
              className={cn(
                "max-w-full rounded text-left outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-3 focus-visible:after:ring-ring/50",
                muted && "text-muted-foreground"
              )}
            >
              {title}
            </button>
          </h2>
          {subtitle ? (
            <div className="truncate text-sm text-muted-foreground">{subtitle}</div>
          ) : null}
        </div>
        {actions ? (
          <ActionsMenu
            actions={actions}
            label={actionsLabel}
            className="relative z-10 -my-1 -mr-1.5 shrink-0"
          />
        ) : null}
      </div>
      {badges ? <div className="flex flex-wrap items-center gap-1.5">{badges}</div> : null}
      {children}
      {footer ? <div className="mt-auto pt-1">{footer}</div> : null}
    </article>
  )
}
