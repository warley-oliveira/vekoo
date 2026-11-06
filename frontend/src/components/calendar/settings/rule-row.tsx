import type { ReactNode } from "react"

import { ActionsMenu, type RowAction } from "@/components/shared"

type RuleRowProps = {
  title: string
  /** Como a mensagem sai: "Texto", "IA", "No app". */
  badges?: ReactNode
  text?: string | null
  onOpen: () => void
  actions: RowAction[]
  actionsLabel: string
}

/** Uma regra de aviso: quando sai e o que diz. A linha inteira abre a edição. */
export function RuleRow({ title, badges, text, onOpen, actions, actionsLabel }: RuleRowProps) {
  return (
    <li className="relative -mx-2 flex items-start gap-2 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/40">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <button
            type="button"
            onClick={onOpen}
            className="rounded text-left text-sm font-medium outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
          >
            {title}
          </button>
          {badges}
        </div>
        {text ? (
          <p className="line-clamp-2 text-sm text-pretty break-words text-muted-foreground">{text}</p>
        ) : null}
      </div>
      <ActionsMenu actions={actions} label={actionsLabel} className="relative z-10 -my-0.5 shrink-0" />
    </li>
  )
}
