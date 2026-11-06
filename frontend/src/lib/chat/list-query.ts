import { appendFilterParams, evaluateConditions, supportsClientFilter } from "./filters"
import type { Chat, FilterCondition, UnifiedContact, UnifiedContactChat } from "./types"

// O recorte da lista, sem React: como vira URL, e como um evento do socket se encaixa nele.
// As regras vêm de `conversation-list-helpers.ts` da origem.

export type StatusFilter = "open" | "closed" | "all"

export type ChatListQuery = {
  search: string
  status: StatusFilter
  conditions: FilterCondition[]
  /** Aba de canal. `null` é "Todos", que a tela mostra como contatos unificados. */
  connectorId: string | null
}

export const PAGE_SIZE = 25

/** A partir daqui a URL pode ser recusada por algum proxy: vai pelo corpo de `/chats/search`. */
const MAX_QUERY_LENGTH = 1800

function queryParams(page: number, query: ChatListQuery): URLSearchParams {
  const params = new URLSearchParams({ page: String(page) })
  if (query.search) params.set("q", query.search)
  if (query.status !== "all") params.set("status", query.status)
  return params
}

/** A lista clássica: `GET /chats`, ou `POST /chats/search` quando não cabe na URL. */
export function chatsRequest(
  page: number,
  query: ChatListQuery
): { path: string; body?: Record<string, unknown> } {
  const params = queryParams(page, query)
  params.set("perPage", String(PAGE_SIZE))
  if (query.connectorId) params.append("connectorIds[]", query.connectorId)
  appendFilterParams(params, query.conditions)

  const search = params.toString()
  if (search.length <= MAX_QUERY_LENGTH) return { path: `/chats?${search}` }

  return {
    path: "/chats/search",
    body: {
      page,
      perPage: PAGE_SIZE,
      ...(query.search ? { q: query.search } : {}),
      ...(query.status !== "all" ? { status: query.status } : {}),
      ...(query.connectorId ? { connectorIds: [query.connectorId] } : {}),
      filters: query.conditions,
    },
  }
}

export function unifiedContactsPath(page: number, query: ChatListQuery): string {
  const params = queryParams(page, query)
  appendFilterParams(params, query.conditions)
  return `/unified-contacts?${params.toString()}`
}

export function unifiedMessagesPath(externalId: string): string {
  // `externalId` pode ter `@` e `.`: a rota aceita, desde que codificado.
  return `/unified-contacts/${encodeURIComponent(externalId)}/messages`
}

/** Este recorte dá para reavaliar com o evento do socket? Senão, quem decide é o servidor. */
export function canEvaluateLocally(query: ChatListQuery): boolean {
  return supportsClientFilter(query.conditions)
}

/** O evento casa com o recorte? A busca do servidor ignora máscara e caixa; aqui também. */
export function matchesChatQuery(chat: Chat, query: ChatListQuery): boolean {
  if (query.connectorId && chat.connectorId !== query.connectorId) return false
  if (query.status !== "all" && chat.status !== query.status) return false

  if (query.search) {
    const term = query.search.trim().toLowerCase()
    const digits = term.replace(/[()+\s-]/g, "")
    const inName = [chat.userName, chat.displayName].some((name) =>
      name?.toLowerCase().includes(term)
    )
    const inExternal = digits.length > 0 && chat.externalId?.toLowerCase().includes(digits)
    if (!inName && !inExternal) return false
  }

  return evaluateConditions(chat, query.conditions)
}

/**
 * Onde a conversa entra numa lista ordenada pela última mensagem. Se a ordem continua certa
 * (mudou só a etiqueta, ou as não lidas), a referência fica e a lista nem se desenha.
 */
export function placeId(
  ids: string[],
  id: string,
  belongs: boolean,
  orderOf: (id: string) => number,
  hasMore: boolean
): string[] {
  const position = ids.indexOf(id)

  if (!belongs) {
    return position < 0 ? ids : ids.filter((other) => other !== id)
  }

  const at = orderOf(id)

  if (position >= 0) {
    const fitsAbove = position === 0 || orderOf(ids[position - 1]) >= at
    const fitsBelow = position === ids.length - 1 || orderOf(ids[position + 1]) <= at
    if (fitsAbove && fitsBelow) return ids
  } else if (hasMore && ids.length > 0 && at < orderOf(ids[ids.length - 1])) {
    // É de uma página que ainda não veio: entra quando ela vier.
    return ids
  }

  const rest = position >= 0 ? ids.filter((other) => other !== id) : ids
  let index = rest.findIndex((other) => orderOf(other) <= at)
  if (index < 0) index = rest.length
  return [...rest.slice(0, index), id, ...rest.slice(index)]
}

/* ---------- contatos unificados ---------- */

function chatEntry(chat: Chat, previous: UnifiedContactChat | undefined): UnifiedContactChat {
  return {
    chatId: chat.id,
    connectorId: chat.connectorId,
    unread: chat.unreadMessages ?? 0,
    lastMessageAt: chat.lastMessageAt,
    senderPhoneNumberId: chat.senderPhoneNumberId,
    audienceType: chat.audienceType,
    status: chat.status,
    matched: previous?.matched ?? true,
  }
}

function summarize(contact: UnifiedContact, chats: UnifiedContactChat[]): UnifiedContact {
  const sorted = [...chats].sort((a, b) => {
    if (a.matched !== b.matched) return a.matched ? -1 : 1
    return (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0)
  })

  return {
    ...contact,
    chats: sorted,
    totalUnread: sorted.reduce((sum, chat) => sum + chat.unread, 0),
    lastMessageAt: sorted.reduce<number | null>(
      (latest, chat) =>
        chat.lastMessageAt !== null && (latest === null || chat.lastMessageAt > latest)
          ? chat.lastMessageAt
          : latest,
      null
    ),
  }
}

/** Reflete a conversa na linha do contato, sem mudar o lugar da linha. */
export function patchContact(contact: UnifiedContact, chat: Chat): UnifiedContact {
  const previous = contact.chats.find((entry) => entry.chatId === chat.id)
  const next = chatEntry(chat, previous)

  const sameChat =
    previous &&
    previous.unread === next.unread &&
    previous.lastMessageAt === next.lastMessageAt &&
    previous.status === next.status &&
    previous.connectorId === next.connectorId

  const isLatest = (chat.lastMessageAt ?? 0) >= (contact.lastMessageAt ?? 0)
  const name = chat.displayName || chat.userName || contact.name
  const picture = chat.profilePictureUrl ?? contact.profilePictureUrl
  const samePreview =
    !isLatest ||
    (contact.lastMessageContent === chat.lastMessageContent &&
      contact.lastMessageBy === chat.lastMessageBy)

  if (sameChat && samePreview && contact.name === name && contact.profilePictureUrl === picture) {
    return contact
  }

  const chats = previous
    ? contact.chats.map((entry) => (entry.chatId === chat.id ? next : entry))
    : [...contact.chats, next]

  return summarize(
    {
      ...contact,
      name,
      profilePictureUrl: picture,
      ...(isLatest
        ? {
            lastMessageContent: chat.lastMessageContent,
            lastMessageBy: chat.lastMessageBy,
            lastMessageType: chat.lastMessageType,
          }
        : {}),
    },
    chats
  )
}

/** A linha de quem ainda não estava na lista. */
export function contactFromChat(chat: Chat): UnifiedContact {
  return summarize(
    {
      externalId: chat.externalId,
      audienceId: chat.audienceId,
      name: chat.displayName || chat.userName,
      profilePictureUrl: chat.profilePictureUrl,
      totalUnread: 0,
      matchCount: 1,
      lastMessageAt: chat.lastMessageAt,
      lastMessageContent: chat.lastMessageContent,
      lastMessageBy: chat.lastMessageBy,
      lastMessageType: chat.lastMessageType,
      chats: [],
    },
    [chatEntry(chat, undefined)]
  )
}

/** Tira a conversa da linha; sem nenhuma conversa, a linha sai (`null`). */
export function withoutChat(contact: UnifiedContact, chatId: string): UnifiedContact | null {
  const chats = contact.chats.filter((entry) => entry.chatId !== chatId)
  if (chats.length === contact.chats.length) return contact
  if (chats.length === 0) return null
  return summarize(contact, chats)
}

/** Abre no último canal usado, ou na conversa mais recente que casa com o filtro. */
export function resolveInitialChat(
  contact: UnifiedContact,
  lastChats: Record<string, string>
): UnifiedContactChat | undefined {
  // Com filtro ativo a primeira é a que casou, e é ela que a pessoa foi procurar.
  if (contact.chats.some((chat) => !chat.matched)) return contact.chats[0]

  const remembered = lastChats[contact.externalId]
  return contact.chats.find((chat) => chat.chatId === remembered) ?? contact.chats[0]
}
