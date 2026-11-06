import { useEffect, useLayoutEffect, useMemo, useRef } from "react"

import { apiGet, apiPost } from "@/lib/api"
import { getChat, storeChats, subscribeChatEvents } from "@/lib/chat/chat-store"
import {
  canEvaluateLocally,
  chatsRequest,
  matchesChatQuery,
  placeId,
  type ChatListQuery,
} from "@/lib/chat/list-query"
import type { Chat, ChatsResponse } from "@/lib/chat/types"
import {
  createCoalescer,
  usePagedCollection,
  type CollectionCache,
} from "./use-paged-collection"

const cache: CollectionCache<string> = new Map()

function orderOf(id: string): number {
  return getChat(id)?.lastMessageAt ?? 0
}

async function fetchChats(page: number, query: ChatListQuery, signal: AbortSignal) {
  const request = chatsRequest(page, query)
  const response = request.body
    ? await apiPost<ChatsResponse>(request.path, request.body, { signal })
    : await apiGet<ChatsResponse>(request.path, { signal })

  storeChats(response.chats)
  return { items: response.chats.map((chat) => chat.id), hasMore: response.meta.hasMore }
}

/**
 * A lista de conversas de um canal. Guarda só os ids, em ordem, e cada linha lê a própria
 * conversa de `useChat`: mudar as não lidas de uma conversa desenha aquela linha, e a lista
 * inteira só quando a ordem muda de verdade.
 */
export function useChatList(query: ChatListQuery) {
  const collection = usePagedCollection<string>({
    signature: JSON.stringify(query),
    cache,
    fetchPage: (page, signal) => fetchChats(page, query, signal),
    idOf: (id) => id,
    orderOf,
  })

  const { update, revalidateFirstPage } = collection

  const queryRef = useRef(query)
  useLayoutEffect(() => {
    queryRef.current = query
  })

  const coalescer = useMemo(() => createCoalescer(revalidateFirstPage), [revalidateFirstPage])
  useEffect(() => coalescer.cancel, [coalescer])

  useEffect(() => {
    const place = (chat: Chat) => {
      const current = queryRef.current
      update((ids, { hasMore }) =>
        placeId(ids, chat.id, matchesChatQuery(chat, current), orderOf, hasMore)
      )
    }

    return subscribeChatEvents((event) => {
      if (event.type === "remove") {
        update((ids) => (ids.includes(event.id) ? ids.filter((id) => id !== event.id) : ids))
        return
      }

      if (event.type === "resync") {
        revalidateFirstPage()
        return
      }

      // Filtro que depende do que o evento não traz: quem decide é o servidor, uma vez por rajada.
      if (!canEvaluateLocally(queryRef.current)) {
        coalescer.schedule()
        return
      }

      if (event.type === "upsert") {
        // Versão provisória não decide nada: só o que já está na lista segue na lista.
        if (!event.chat.partial) place(event.chat)
        return
      }

      // Do mais antigo para o mais recente, para o mais recente terminar no topo.
      for (const chat of [...event.chats].reverse()) place(chat)
    })
  }, [coalescer, revalidateFirstPage, update])

  return collection
}
