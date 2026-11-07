import { lazy, Suspense, useEffect, useState } from "react"

import { disconnectCopilot } from "@/lib/chat-details/copilot-store"
import { useChatSelection } from "@/lib/chat-details/selection"

const ChatPreferences = lazy(() => import("@/components/chat/details/chat-preferences"))

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
        <ChatPreferences open={open} onOpenChange={setOpen} />
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
