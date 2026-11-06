import { useEffect, useLayoutEffect, useMemo, useRef } from "react"

import { apiGet } from "@/lib/api"
import { subscribeChatEvents } from "@/lib/chat/chat-store"
import {
  contactFromChat,
  patchContact,
  unifiedContactsPath,
  withoutChat,
  type ChatListQuery,
} from "@/lib/chat/list-query"
import type { Chat, UnifiedContact, UnifiedContactsResponse } from "@/lib/chat/types"
import {
  createCoalescer,
  usePagedCollection,
  type CollectionCache,
} from "./use-paged-collection"

const cache: CollectionCache<UnifiedContact> = new Map()

function orderOf(contact: UnifiedContact): number {
  return contact.lastMessageAt ?? 0
}

/** Busca e filtro avançado: `matched` e o agrupamento são do servidor. */
function needsServer(query: ChatListQuery): boolean {
  return Boolean(query.search) || query.conditions.length > 0
}

/** Põe a linha no lugar pela última mensagem. Linha de página que não veio fica de fora. */
function place(
  contacts: UnifiedContact[],
  contact: UnifiedContact,
  hasMore: boolean
): UnifiedContact[] {
  const others = contacts.filter((other) => other.externalId !== contact.externalId)
  const at = orderOf(contact)

  if (
    others.length === contacts.length &&
    hasMore &&
    contacts.length > 0 &&
    at < orderOf(contacts[contacts.length - 1])
  ) {
    return contacts
  }

  let index = others.findIndex((other) => orderOf(other) <= at)
  if (index < 0) index = others.length
  return [...others.slice(0, index), contact, ...others.slice(index)]
}

/** Reflete a conversa na lista, com as mesmas regras do `$group` do servidor. */
function applyChat(
  contacts: UnifiedContact[],
  chat: Chat,
  query: ChatListQuery,
  hasMore: boolean
): UnifiedContact[] {
  const current = contacts.find((contact) => contact.externalId === chat.externalId)

  // Com status filtrado, a conversa de outro status nem entra na linha.
  if (query.status !== "all" && chat.status !== query.status) {
    if (!current) return contacts
    const rest = withoutChat(current, chat.id)
    if (rest === current) return contacts
    return rest
      ? contacts.map((contact) => (contact === current ? rest : contact))
      : contacts.filter((contact) => contact !== current)
  }

  if (!current) {
    return chat.partial ? contacts : place(contacts, contactFromChat(chat), hasMore)
  }

  const patched = patchContact(current, chat)
  if (patched === current) return contacts
  if (orderOf(patched) === orderOf(current)) {
    return contacts.map((contact) => (contact === current ? patched : contact))
  }
  return place(contacts, patched, hasMore)
}

/**
 * A lista de contatos: uma linha por `externalId`, com uma aba por conversa. Sem filtro, o
 * evento do socket atualiza a linha na hora, sem pedir nada. Com busca ou filtro, a linha que já
 * está na tela reflete a conversa, e o resto é o servidor quem decide, numa conferência por
 * rajada. Na origem toda mudança refazia a lista inteira.
 */
export function useUnifiedContactList(query: ChatListQuery) {
  const collection = usePagedCollection<UnifiedContact>({
    signature: JSON.stringify(query),
    cache,
    fetchPage: async (page, signal) => {
      const response = await apiGet<UnifiedContactsResponse>(unifiedContactsPath(page, query), {
        signal,
      })
      return { items: response.contacts, hasMore: response.meta.hasMore }
    },
    idOf: (contact) => contact.externalId,
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
    const reflect = (chat: Chat) => {
      const current = queryRef.current

      update((contacts, { hasMore }) => {
        if (!needsServer(current)) return applyChat(contacts, chat, current, hasMore)

        // Só a linha que já está na lista, no mesmo lugar: quem decide o resto é o servidor.
        const row = contacts.find((contact) => contact.externalId === chat.externalId)
        if (!row) return contacts
        const patched = patchContact(row, chat)
        return patched === row
          ? contacts
          : contacts.map((contact) => (contact === row ? patched : contact))
      })

      if (needsServer(current) && !chat.partial) coalescer.schedule()
    }

    return subscribeChatEvents((event) => {
      if (event.type === "resync") {
        revalidateFirstPage()
      } else if (event.type === "remove") {
        update((contacts) => {
          const row = contacts.find((contact) =>
            contact.chats.some((chat) => chat.chatId === event.id)
          )
          if (!row) return contacts
          const rest = withoutChat(row, event.id)
          return rest
            ? contacts.map((contact) => (contact === row ? rest : contact))
            : contacts.filter((contact) => contact !== row)
        })
        if (needsServer(queryRef.current)) coalescer.schedule()
      } else if (event.type === "upsert") {
        reflect(event.chat)
      } else {
        // Do mais antigo para o mais recente, para o mais recente terminar no topo.
        for (const chat of [...event.chats].reverse()) reflect(chat)
      }
    })
  }, [coalescer, revalidateFirstPage, update])

  return collection
}
