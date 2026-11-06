import { useEffect } from "react"

import { useApi } from "@/hooks/use-api"
import { storeChats, useChat } from "@/lib/chat/chat-store"
import type { ChatResponse } from "@/lib/chat/types"

/**
 * A conversa aberta. Em geral a lista já trouxe; só pergunta à API quando ainda não se sabe nada
 * dela (link direto) ou quando só se conhece a versão provisória (veio de um contato unificado).
 */
export function useOpenChat(chatId: string | null) {
  const chat = useChat(chatId)
  const needsFetch = Boolean(chatId) && (!chat || Boolean(chat.partial))

  const { data, error, mutate, isLoading } = useApi<ChatResponse>(
    needsFetch ? `/chats/${chatId}` : null,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      keepPreviousData: false,
    }
  )

  useEffect(() => {
    if (data?.chat) storeChats([data.chat])
  }, [data])

  return {
    chat,
    error: needsFetch ? error : undefined,
    isLoading: needsFetch && isLoading,
    retry: () => void mutate(),
  }
}
