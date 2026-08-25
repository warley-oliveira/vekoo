import { Fragment, type ReactElement, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import {
  ArrowDown,
  ArrowUp,
  Copy,
  CornerUpLeft,
  Plus,
  Sparkles,
  Trash2,
  type LucideIcon,
} from "lucide-react"

import { useAi } from "@/components/editor/ai-store"
import { useCardActions } from "@/components/editor/card-actions"
import { useEditor } from "@/components/editor/editor-store"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

// As mesmas ações de card em dois invólucros: menu de contexto (botão direito
// na trilha) e menu de botão. A lista vive aqui uma vez só.

type CardMenuEntry = {
  key: string
  label: string
  icon: LucideIcon
  disabled?: boolean
  separated?: boolean
  destructive?: boolean
  run: () => void
}

function useCardMenuEntries(cardId: string): CardMenuEntry[] {
  const { t } = useTranslation()
  const { state, dispatch } = useEditor()
  const actions = useCardActions()
  const { imageForCard, busy } = useAi()
  const index = state.doc.cards.findIndex((c) => c.id === cardId)

  return [
    {
      key: "insert",
      label: t("editor.cardActions.insertAfter"),
      icon: Plus,
      run: () => actions.insertAfter(cardId),
    },
    {
      key: "duplicate",
      label: t("common.duplicate"),
      icon: Copy,
      run: () => actions.duplicate(cardId),
    },
    {
      key: "image",
      label: t("editor.ai.imageForCard"),
      icon: Sparkles,
      separated: true,
      disabled: busy,
      run: () => void imageForCard(cardId),
    },
    {
      key: "up",
      separated: true,
      label: t("editor.cardActions.moveUp"),
      icon: ArrowUp,
      disabled: !actions.canMove(cardId, -1),
      run: () => actions.move(cardId, -1),
    },
    {
      key: "down",
      label: t("editor.cardActions.moveDown"),
      icon: ArrowDown,
      disabled: !actions.canMove(cardId, 1),
      run: () => actions.move(cardId, 1),
    },
    {
      key: "first",
      label: t("editor.cardActions.moveToStart"),
      icon: CornerUpLeft,
      disabled: index <= 0,
      run: () => dispatch({ type: "card/move-to", id: cardId, index: 0 }),
    },
    {
      key: "remove",
      label: t("editor.cardActions.remove"),
      icon: Trash2,
      separated: true,
      destructive: true,
      run: () => actions.remove(cardId),
    },
  ]
}

const DESTRUCTIVE = "text-destructive focus:text-destructive"

/** Botão direito sobre um card da trilha. */
export function CardContextMenu({
  cardId,
  children,
}: {
  cardId: string
  children: ReactNode
}) {
  const entries = useCardMenuEntries(cardId)

  return (
    <ContextMenu>
      <ContextMenuTrigger render={<div className="w-full" />}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        {entries.map((entry) => (
          <Fragment key={entry.key}>
            {entry.separated && <ContextMenuSeparator />}
            <ContextMenuItem
              disabled={entry.disabled}
              onClick={entry.run}
              className={cn(entry.destructive && DESTRUCTIVE)}
            >
              <entry.icon /> {entry.label}
            </ContextMenuItem>
          </Fragment>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  )
}

/** Mesma lista, acionada por um gatilho visível (a alça "…" da trilha). */
export function CardActionsMenu({
  cardId,
  trigger,
  children,
}: {
  cardId: string
  trigger: ReactElement
  children: ReactNode
}) {
  const entries = useCardMenuEntries(cardId)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger}>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        {entries.map((entry) => (
          <Fragment key={entry.key}>
            {entry.separated && <DropdownMenuSeparator />}
            <DropdownMenuItem
              disabled={entry.disabled}
              onClick={entry.run}
              className={cn(entry.destructive && DESTRUCTIVE)}
            >
              <entry.icon /> {entry.label}
            </DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
