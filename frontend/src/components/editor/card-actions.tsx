import { useCallback } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { activeCard, useEditor } from "@/components/editor/editor-store"
import { duplicateCard, emptyCard, type CarouselCard } from "@/lib/doc"
import { newId } from "@/lib/doc"

// As operações de card num lugar só — a trilha (menu e menu de contexto), o
// painel do card e os atalhos de teclado chamam exatamente as mesmas funções.
// Excluir é reversível por ⌘Z, então avisa com "Desfazer" no toast, no mesmo
// padrão da lixeira do app; não interrompe com diálogo.

export type CardActions = {
  duplicate: (id: string) => void
  remove: (id: string) => void
  move: (id: string, direction: 1 | -1) => void
  insertAfter: (id: string) => void
  canMove: (id: string, direction: 1 | -1) => boolean
}

export function useCardActions(): CardActions {
  const { t } = useTranslation()
  const { state, dispatch } = useEditor()
  const cards = state.doc.cards

  const indexOf = useCallback(
    (id: string) => cards.findIndex((c) => c.id === id),
    [cards]
  )

  const duplicate = useCallback(
    (id: string) => {
      const index = indexOf(id)
      const source = cards[index]
      if (!source) return
      dispatch({
        type: "card/insert",
        index: index + 1,
        card: duplicateCard(source, () => newId("card")),
      })
      toast(t("editor.cardActions.duplicatedToast"))
    },
    [cards, dispatch, indexOf, t]
  )

  const remove = useCallback(
    (id: string) => {
      if (indexOf(id) < 0) return
      dispatch({ type: "card/remove", id })
      toast(t("editor.cardActions.removedToast"), {
        action: {
          label: t("common.undo"),
          onClick: () => dispatch({ type: "history/undo" }),
        },
      })
    },
    [dispatch, indexOf, t]
  )

  const move = useCallback(
    (id: string, direction: 1 | -1) => dispatch({ type: "card/move", id, direction }),
    [dispatch]
  )

  const insertAfter = useCallback(
    (id: string) => {
      const index = indexOf(id)
      dispatch({
        type: "card/insert",
        index: index < 0 ? cards.length : index + 1,
        card: emptyCard(newId("card")),
      })
    },
    [cards.length, dispatch, indexOf]
  )

  const canMove = useCallback(
    (id: string, direction: 1 | -1) => {
      const target = indexOf(id) + direction
      return indexOf(id) >= 0 && target >= 0 && target < cards.length
    },
    [cards.length, indexOf]
  )

  return { duplicate, remove, move, insertAfter, canMove }
}

/** O card que os atalhos e o painel operam — o ativo. */
export function useActiveCard(): CarouselCard | undefined {
  const { state } = useEditor()
  return activeCard(state)
}
