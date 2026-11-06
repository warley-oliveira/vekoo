import { useSyncExternalStore } from "react"

import { ConfirmDialog } from "./confirm-dialog"
import { answer, getIsOpen, getQuestion, subscribe } from "./confirm-store"

/** Desenha a pergunta de `useConfirm`. Quem monta é o próprio `confirm()`, na primeira chamada. */
export function ConfirmHost() {
  const question = useSyncExternalStore(subscribe, getQuestion)
  const isOpen = useSyncExternalStore(subscribe, getIsOpen)

  if (!question) return null

  return (
    <ConfirmDialog
      {...question.options}
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) answer(false)
      }}
      onConfirmed={() => answer(true)}
    />
  )
}
