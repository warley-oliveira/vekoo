import { createContext, useContext, type ReactNode } from "react"

import type { MessageCapabilities } from "@/lib/chat/message-rules"
import type { ChatMessage } from "@/lib/chat/types"

/**
 * O que toda bolha precisa saber e fazer. Em contexto, e não por prop, porque atravessa a lista
 * virtual; o valor só muda ao trocar de conversa ou ao descobrir o que o canal permite, então
 * nunca é o que faz uma bolha se desenhar enquanto a pessoa conversa.
 */
export type ThreadContextValue = {
  threadKey: string
  /** `null` na linha do tempo "Todos", que é só de leitura. */
  chatId: string | null
  contactName: string
  contactPicture: string | null
  capabilities: MessageCapabilities
  reply: (message: ChatMessage) => void
  react: (message: ChatMessage, emoji: string) => void
  requestDelete: (messages: ChatMessage[]) => void
  retry: (message: ChatMessage) => void
  scrollToMessage: (id: string) => void
  /** De que canal veio, na aba "Todos". */
  renderOrigin?: (message: ChatMessage) => ReactNode
}

export const ThreadContext = createContext<ThreadContextValue | null>(null)

export function useThreadContext(): ThreadContextValue {
  const value = useContext(ThreadContext)
  if (!value) throw new Error("useThreadContext precisa estar dentro de <ThreadContext>")
  return value
}
