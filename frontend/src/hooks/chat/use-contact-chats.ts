import { useEffect, useMemo, useRef } from "react"

import { useApi } from "@/hooks/use-api"
import { subscribeChatEvents } from "@/lib/chat/chat-store"
import type { UnifiedContactChat, UnifiedContactsResponse } from "@/lib/chat/types"

const NO_CHATS: UnifiedContactChat[] = []

/** O filtro da lista pode deixar uma aba em cinza: a linha clicada diz quais casaram. */
export type ContactMatches = Record<string, boolean>

/**
 * As conversas de um contato, para as abas: uma por canal, e uma WABA com vários números tem uma
 * por número. A aba é sempre uma conversa, nunca um conector, senão esses números colidem.
 *
 * A busca é pelo `externalId`, e a API acha pelo que normaliza como telefone. O visitante do
 * widget, que tem um código no lugar do número, não precisa: ele só fala por um canal.
 */
export function useContactChats(
  externalId: string | null | undefined,
  { enabled = true, matches }: { enabled?: boolean; matches?: ContactMatches } = {}
) {
  const { data, mutate } = useApi<UnifiedContactsResponse>(
    enabled && externalId ? `/unified-contacts?q=${encodeURIComponent(externalId)}` : null,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      keepPreviousData: false,
    }
  )

  const row = useMemo(
    () => data?.contacts.find((contact) => contact.externalId === externalId),
    [data, externalId]
  )

  const knownIds = useRef(new Set<string>())
  useEffect(() => {
    knownIds.current = new Set(row?.chats.map((chat) => chat.chatId))
  }, [row])

  // Uma conversa nova deste contato, em outro canal: as abas precisam conhecer.
  useEffect(() => {
    if (!externalId || !enabled) return
    return subscribeChatEvents((event) => {
      if (
        event.type === "upsert" &&
        event.chat.externalId === externalId &&
        knownIds.current.size > 0 &&
        !knownIds.current.has(event.chat.id)
      ) {
        void mutate()
      }
    })
  }, [enabled, externalId, mutate])

  const chats = useMemo(() => {
    const list = row?.chats ?? NO_CHATS
    if (!matches) return list
    return list.map((chat) =>
      chat.chatId in matches ? { ...chat, matched: matches[chat.chatId] } : chat
    )
  }, [matches, row])

  return chats
}
