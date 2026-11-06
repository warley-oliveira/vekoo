import { useShallow } from "zustand/react/shallow"

import { useChatStore } from "@/lib/chat/chat-store"
import type { Chat } from "@/lib/chat/types"

/**
 * Só os campos que a seção mostra. Cada mensagem que chega reescreve a conversa no store, e sem isto
 * o painel inteiro se desenharia a cada uma delas.
 */
export function useChatFields<K extends keyof Chat>(
  chatId: string,
  keys: readonly K[]
): Pick<Chat, K> | undefined {
  return useChatStore(
    useShallow((state) => {
      const chat = state.byId[chatId]
      if (!chat) return undefined

      const picked = {} as Pick<Chat, K>
      for (const key of keys) picked[key] = chat[key]
      return picked
    })
  )
}
