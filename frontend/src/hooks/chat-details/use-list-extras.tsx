import { Suspense, useEffect, useState } from "react"

import { LazyChatPreferences } from "@/components/chat/details/lazy-chat-preferences"
import { disconnectCopilot } from "@/lib/chat-details/copilot-store"
import { useChatSelection } from "@/lib/chat-details/selection"

/** As preferências do chat, montadas na primeira vez que alguém as abre. */
export function useChatPreferencesPanel() {
  const [open, setOpen] = useState(false)
  const [everOpen, setEverOpen] = useState(false)

  return {
    open: () => {
      setEverOpen(true)
      setOpen(true)
    },
    panel: everOpen ? (
      <Suspense fallback={null}>
        <LazyChatPreferences open={open} onOpenChange={setOpen} />
      </Suspense>
    ) : null,
  }
}

/** Quem fica na tela enquanto a pessoa estiver no chat solta o canal do copiloto e a escolha ao sair. */
export function useListCleanup() {
  useEffect(
    () => () => {
      disconnectCopilot()
      useChatSelection.getState().exit()
    },
    []
  )
}
