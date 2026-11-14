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
  /** No celular as ações da bolha abrem em folha, ao segurar, em vez de ficarem ao lado dela. */
  sheetActions: boolean
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

/** Até quanto tempo depois de criada uma mensagem ainda conta como "acabou de chegar". */
const FRESH_WINDOW_MS = 15_000

/**
 * As mensagens que a lista já mostrou. Uma por lista: nasce com o que havia ao abrir a conversa,
 * e cada mensagem nova entra depois de animar uma vez. É o que impede de animar ao abrir, ao
 * trocar de conversa e ao rolar (a lista virtual monta a linha de novo cada vez que ela volta à
 * tela).
 */
export type FreshTracker = {
  /** Diz se a mensagem é novidade e, sendo, já a marca como vista. */
  claim: (id: string, createdAt: number) => boolean
}

export const NEVER_FRESH: FreshTracker = { claim: () => false }

export function createFreshTracker(initialIds: Iterable<string>): FreshTracker {
  const seen = new Set(initialIds)
  return {
    claim: (id, createdAt) => {
      if (seen.has(id)) return false
      seen.add(id)
      return Date.now() - createdAt < FRESH_WINDOW_MS
    },
  }
}

export const FreshContext = createContext<FreshTracker>(NEVER_FRESH)

export function useFreshTracker(): FreshTracker {
  return useContext(FreshContext)
}
