import { useMemo } from "react"
import type { SWRConfiguration } from "swr"

import { useApi } from "@/hooks/use-api"
import type { ChatConnector } from "@/lib/chat/channel"
import type {
  ChatPerson,
  ChatTag,
  ChatTagsResponse,
  ChatTeam,
  ChatView,
  ChatViewsResponse,
  CustomField,
  CustomFieldsResponse,
} from "@/lib/chat/types"

// O que muda pouco e muita tela lê: canais, etiquetas, pessoas. Um dado por chave do SWR, sem
// revalidar ao focar a janela: é o que permite um `useChatConnectors()` em cada linha da lista sem
// custar uma requisição a mais. Mensagens rápidas e anexos vêm de `@/hooks/content`.

const REFERENCE_DATA: SWRConfiguration = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  revalidateIfStale: false,
  dedupingInterval: 60_000,
}

const NO_CONNECTORS: ChatConnector[] = []
const NO_TAGS: ChatTag[] = []
const NO_PEOPLE: ChatPerson[] = []
const NO_TEAMS: ChatTeam[] = []
const NO_VIEWS: ChatView[] = []
const NO_FIELDS: CustomField[] = []

export const CHAT_CONNECTORS_KEY = "/chats/self-filter"
export const CHAT_TAGS_KEY = "/chat-tags"
export const CHAT_VIEWS_KEY = "/chat-views"

function indexById<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]))
}

/** Os canais de atendimento. Calendário não entra: não conversa. */
export function useChatConnectors() {
  const { data, error, isLoading } = useApi<{ connectors: ChatConnector[] }>(
    CHAT_CONNECTORS_KEY,
    REFERENCE_DATA
  )
  const connectors = data?.connectors ?? NO_CONNECTORS
  const byId = useMemo(() => indexById(connectors), [connectors])

  return { connectors, byId, error, isLoading }
}

export function useChatTags() {
  const { data, error, isLoading } = useApi<ChatTagsResponse>(CHAT_TAGS_KEY, REFERENCE_DATA)
  const tags = data?.chatTags ?? NO_TAGS
  const byId = useMemo(() => indexById(tags), [tags])

  return { tags, byId, error, isLoading }
}

export function useChatPeople() {
  const { data } = useApi<{ people: ChatPerson[] }>("/chats/people", REFERENCE_DATA)
  const people = data?.people ?? NO_PEOPLE
  const byId = useMemo(() => indexById(people), [people])

  return { people, byId }
}

export function useChatTeams() {
  const { data } = useApi<{ teams: ChatTeam[] }>("/chats/teams", REFERENCE_DATA)
  return { teams: data?.teams ?? NO_TEAMS }
}

export function useChatViews() {
  const { data, error, isLoading, mutate } = useApi<ChatViewsResponse>(
    CHAT_VIEWS_KEY,
    REFERENCE_DATA
  )
  return { views: data?.chatViews ?? NO_VIEWS, error, isLoading, mutate }
}

export function useCustomFields() {
  const { data } = useApi<CustomFieldsResponse>("/custom-fields", REFERENCE_DATA)
  return { customFields: data?.customFields ?? NO_FIELDS }
}
