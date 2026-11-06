import { create } from "zustand"

import type { Chat } from "./types"

// A conversa, em um lugar só. Linha da lista, cabeçalho e o painel lateral leem daqui, por
// id, com seletor: um evento do socket regrava uma conversa e só quem mostra aquela conversa
// se desenha de novo. Na origem cada tela guardava a sua cópia (`user`, `selectedUser`, o
// cache da lista) e metade dos comentários de `chat.jsx` explica como elas se desencontravam.
//
// **Toda mudança passa por `publishChat`**, venha do socket ou da resposta de um PATCH. As
// listas ouvem por `subscribeChatEvents`, então também só existe um caminho até elas.

type ChatStoreState = {
  byId: Record<string, Chat>
}

export const useChatStore = create<ChatStoreState>()(() => ({ byId: {} }))

export type ChatEvent =
  | { type: "upsert"; chat: Chat; previous: Chat | undefined }
  | { type: "remove"; id: string }
  /** Resposta de `request_recent`, da mais recente para a mais antiga. */
  | { type: "recent"; chats: Chat[] }
  /** O socket não respondeu: as listas conferem a primeira página por HTTP. */
  | { type: "resync" }

type ChatEventListener = (event: ChatEvent) => void

const listeners = new Set<ChatEventListener>()

export function subscribeChatEvents(listener: ChatEventListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function emit(event: ChatEvent) {
  for (const listener of listeners) listener(event)
}

export function getChat(id: string): Chat | undefined {
  return useChatStore.getState().byId[id]
}

/** A mesma conversa por id, sem assinar nada: `useChat` é para desenhar. */
export function useChat(id: string | null | undefined): Chat | undefined {
  return useChatStore((state) => (id ? state.byId[id] : undefined))
}

/**
 * Funde o que veio sobre o que já se sabe. Resposta atrasada não desfaz evento mais novo:
 * `updatedAt` manda. Sem mudança nenhuma, a referência fica, e ninguém se desenha.
 */
function merge(current: Chat | undefined, incoming: Partial<Chat> & { id: string }): Chat {
  if (!current) return incoming as Chat
  if (
    !current.partial &&
    incoming.updatedAt &&
    current.updatedAt &&
    incoming.updatedAt < current.updatedAt
  ) {
    return current
  }

  const next = { ...current, ...incoming } as Chat
  // Registro inteiro chegou (só ele traz `updatedAt`): deixa de ser a versão provisória.
  if (next.partial && incoming.updatedAt) delete next.partial

  const keys = Object.keys(next) as (keyof Chat)[]
  const changed =
    keys.length !== Object.keys(current).length ||
    keys.some((key) => next[key] !== current[key] && !sameJson(next[key], current[key]))

  return changed ? next : current
}

function sameJson(a: unknown, b: unknown): boolean {
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false
  return JSON.stringify(a) === JSON.stringify(b)
}

/** Guarda sem avisar as listas: para o que acabou de vir delas mesmas. */
export function storeChats(chats: Chat[]): void {
  if (chats.length === 0) return

  useChatStore.setState((state) => {
    let byId = state.byId
    for (const chat of chats) {
      const next = merge(byId[chat.id], chat)
      if (next === byId[chat.id]) continue
      if (byId === state.byId) byId = { ...state.byId }
      byId[chat.id] = next
    }
    return byId === state.byId ? state : { byId }
  })
}

function write(next: Chat, previous: Chat | undefined) {
  if (next !== previous) {
    useChatStore.setState((state) => ({ byId: { ...state.byId, [next.id]: next } }))
  }
  emit({ type: "upsert", chat: next, previous })
}

/** Uma conversa inteira chegou (socket ou resposta da API): grava e avisa as listas. */
export function publishChat(chat: Chat): Chat {
  const previous = getChat(chat.id)
  const merged = merge(previous, chat)
  write(merged, previous)
  return merged
}

/** Muda parte de uma conversa conhecida. Da que não se conhece não há o que mudar. */
export function patchChat(id: string, changes: Partial<Chat>): void {
  const previous = getChat(id)
  if (previous) write(merge(previous, { ...changes, id }), previous)
}

/**
 * A versão provisória, montada de uma linha de contato, para o cabeçalho não piscar enquanto
 * `GET /chats/:id` não responde. Nunca passa por cima do que já se sabe.
 */
export function seedChat(chat: Chat): void {
  if (getChat(chat.id)) return
  useChatStore.setState((state) => ({
    byId: { ...state.byId, [chat.id]: { ...chat, partial: true } },
  }))
}

export function publishRecentChats(chats: Chat[]): void {
  storeChats(chats)
  emit({ type: "recent", chats: chats.map((chat) => getChat(chat.id) ?? chat) })
}

export function requestListResync(): void {
  emit({ type: "resync" })
}

export function removeChat(id: string): void {
  if (getChat(id)) {
    useChatStore.setState((state) => {
      const byId = { ...state.byId }
      delete byId[id]
      return { byId }
    })
  }
  emit({ type: "remove", id })
}

/** Nome para mostrar. O identificador do widget é um código de visitante: nunca aparece. */
export function chatDisplayName(
  chat: Pick<Chat, "displayName" | "userName" | "externalId" | "audienceType" | "audienceUserName">,
  fallbacks: { visitor: string; contact: string }
): string {
  const named = chat.displayName || chat.userName
  if (named) return named
  if (chat.audienceType === "web") return fallbacks.visitor
  if (chat.audienceType === "instagram" && chat.audienceUserName) return `@${chat.audienceUserName}`
  return chat.externalId?.split("@")[0] || fallbacks.contact
}
