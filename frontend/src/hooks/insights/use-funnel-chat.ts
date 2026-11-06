import { useCallback } from "react"
import { useSWRConfig } from "swr"
import useSWRInfinite from "swr/infinite"

import type {
  ChatBooking,
  ChatDetail,
  ChatDetailResponse,
  ChatMessagesPage,
  ChatPerson,
  ChatTag,
  ChatTeam,
} from "@/components/funnels/types"
import { useApi } from "@/hooks/use-api"
import { useCan } from "@/hooks/use-can"
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/lib/api"

// O que o painel da conversa lê e grava: as mesmas rotas do chat. Quem só tem `funnel` não alcança
// nenhuma delas, e a tela mostra só o que o cartão já trouxe.

export const CHAT_TAGS_KEY = "/chat-tags?perPage=100"
const PEOPLE_KEY = "/chats/people"
const TEAMS_KEY = "/chats/teams"
const MESSAGES_PER_PAGE = 20

const chatPath = (id: string) => `/chats/${id}`

export function useChatDetail(chatId: string | null) {
  const { data, error, isLoading, mutate } = useApi<ChatDetailResponse>(chatId ? chatPath(chatId) : null, {
    keepPreviousData: false,
    revalidateOnFocus: false,
  })
  return { detail: data, error, isLoading, reload: () => mutate(), mutate }
}

/** Aberto a qualquer sessão: serve ao filtro do quadro, com ou sem `chat`. */
export function useChatTags() {
  const { data, error, isLoading, mutate } = useApi<{ chatTags: ChatTag[] }>(CHAT_TAGS_KEY, {
    revalidateOnFocus: false,
  })
  return { tags: data?.chatTags, error, isLoading, reload: () => mutate() }
}

export function useChatPeople() {
  const allowed = useCan("chat")
  const { data } = useApi<{ people: ChatPerson[] }>(allowed ? PEOPLE_KEY : null, { revalidateOnFocus: false })
  return { people: data?.people }
}

export function useChatTeams() {
  const allowed = useCan("chat")
  const { data } = useApi<{ teams: ChatTeam[] }>(allowed ? TEAMS_KEY : null, { revalidateOnFocus: false })
  return { teams: data?.teams }
}

export function useChatBookings(chatId: string | null) {
  // `GET /calendar-events` exige `calendar`, e quem só tem `chat` receberia 403.
  const allowed = useCan("calendar")
  const { data, isLoading } = useApi<{ events: ChatBooking[] }>(
    allowed && chatId ? `/calendar-events?chatId=${chatId}` : null,
    { keepPreviousData: false, revalidateOnFocus: false }
  )
  return { allowed, bookings: data?.events, isLoading }
}

/**
 * O histórico, do mais recente para trás. `initial=false`: olhar a conversa aqui não é abri-la, e a
 * primeira página, sem isso, zeraria as não lidas de quem atende.
 */
export function useChatMessages(chatId: string | null) {
  const { data, error, isLoading, isValidating, size, setSize, mutate } = useSWRInfinite<ChatMessagesPage>(
    (index, previous: ChatMessagesPage | null) => {
      if (!chatId) return null
      if (index > 0 && (!previous?.hasMore || !previous.oldestId)) return null
      const base = `${chatPath(chatId)}/messages?limit=${MESSAGES_PER_PAGE}&initial=false`
      return index === 0 ? base : `${base}&beforeId=${previous?.oldestId}`
    },
    (path: string) => apiGet<ChatMessagesPage>(path),
    { revalidateOnFocus: false, revalidateFirstPage: false, keepPreviousData: false }
  )

  // Cada página vem da mais antiga para a mais recente. As antigas entram por cima.
  const messages = data ? [...data].reverse().flatMap((page) => page.messages) : undefined
  const last = data?.[data.length - 1]

  return {
    messages,
    error,
    isLoading,
    isLoadingMore: isValidating && Boolean(data) && size > (data?.length ?? 0),
    hasMore: Boolean(last?.hasMore),
    loadMore: () => setSize(size + 1),
    reload: () => mutate(),
  }
}

export type ChatPatch = Partial<Pick<ChatDetail, "notes" | "assignedAccountId" | "teamId">>

export function useChatMutations(chatId: string) {
  const { mutate } = useSWRConfig()
  const path = chatPath(chatId)

  const setDetail = useCallback(
    (patch: Partial<ChatDetail>) =>
      mutate<ChatDetailResponse>(
        path,
        (current) => (current ? { ...current, chat: { ...current.chat, ...patch } } : current),
        { revalidate: false }
      ),
    [mutate, path]
  )

  const updateChat = useCallback(
    async (patch: ChatPatch) => {
      await apiPatch(path, { chat: patch })
      await setDetail(patch)
    },
    [path, setDetail]
  )

  const updateAttribute = useCallback(
    async (key: string, value: string | null) => {
      const { customAttributes } = await apiPut<{ customAttributes: Record<string, string> }>(
        `${path}/attributes`,
        { customAttributes: { [key]: value } }
      )
      await setDetail({ customAttributes })
    },
    [path, setDetail]
  )

  const applyTag = useCallback(
    async (tagId: string) => {
      const { tagIds } = await apiPut<{ tagIds: string[] }>(`/chat-tags/${tagId}/chats/${chatId}`)
      await setDetail({ tagIds })
      return tagIds
    },
    [chatId, setDetail]
  )

  const removeTag = useCallback(
    async (tagId: string) => {
      const { tagIds } = await apiDelete<{ tagIds: string[] }>(`/chat-tags/${tagId}/chats/${chatId}`)
      await setDetail({ tagIds })
      return tagIds
    },
    [chatId, setDetail]
  )

  return { updateChat, updateAttribute, applyTag, removeTag }
}

export type ChatTagInput = { name: string; color: string; description?: string | null }

export function useChatTagMutations() {
  const { mutate } = useSWRConfig()

  const createTag = useCallback(
    async (input: ChatTagInput) => {
      const { chatTag } = await apiPost<{ chatTag: ChatTag }>("/chat-tags", { chatTag: input })
      await mutate(CHAT_TAGS_KEY)
      return chatTag
    },
    [mutate]
  )

  const updateTag = useCallback(
    async (id: string, input: Partial<ChatTagInput>) => {
      const { chatTag } = await apiPatch<{ chatTag: ChatTag }>(`/chat-tags/${id}`, { chatTag: input })
      await mutate(CHAT_TAGS_KEY)
      return chatTag
    },
    [mutate]
  )

  const deleteTag = useCallback(
    async (id: string) => {
      await apiDelete(`/chat-tags/${id}`)
      await mutate(CHAT_TAGS_KEY)
    },
    [mutate]
  )

  const countTagUses = useCallback(async (id: string) => {
    const { count } = await apiGet<{ count: number }>(`/chat-tags/${id}/assigns`)
    return count
  }, [])

  return { createTag, updateTag, deleteTag, countTagUses }
}
