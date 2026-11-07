import { memo, useCallback, useEffect, useMemo, useRef } from "react"
import { useNavigate } from "react-router"
import { useTranslation } from "react-i18next"
import { MessagesSquare, SearchX } from "lucide-react"

import { InfiniteList } from "@/components/shared"
import {
  useChatConnectors,
  useChatPeople,
  useChatTags,
} from "@/hooks/chat/use-chat-refs"
import { useChatList } from "@/hooks/chat/use-chat-list"
import { useUnifiedContactList } from "@/hooks/chat/use-unified-contact-list"
import { seedChat } from "@/lib/chat/chat-store"
import { toQueryConditions } from "@/lib/chat/filters"
import { resolveInitialChat, type ChatListQuery } from "@/lib/chat/list-query"
import { useLastChannel, useListFilters, useOpenChatStore } from "@/lib/chat/stores"
import type { Chat, UnifiedContact } from "@/lib/chat/types"
import { selectableChatIds, useChatSelection } from "@/lib/chat-details/selection"
import { useChatVariant } from "../chat-variant"
import { ChatRow } from "./chat-row"
import { ChatListSkeleton } from "./row-parts"
import { UnifiedRow } from "./unified-row"

function useListQuery(): ChatListQuery {
  const search = useListFilters((state) => state.search)
  const status = useListFilters((state) => state.status)
  const connectorId = useListFilters((state) => state.connectorId)
  const conditions = useListFilters((state) => state.conditions)

  // Por conteúdo: uma linha pela metade no painel de filtros não refaz a lista.
  const signature = JSON.stringify(toQueryConditions(conditions))

  return useMemo(
    () => ({
      search,
      status,
      connectorId,
      conditions: JSON.parse(signature),
    }),
    [connectorId, search, signature, status]
  )
}

/** Navegar sem a linha precisar assinar a rota: a função é a mesma a vida inteira da lista. */
function useOpenChat() {
  const navigate = useNavigate()
  const navigateRef = useRef(navigate)
  useEffect(() => {
    navigateRef.current = navigate
  })

  return useCallback((chatId: string) => {
    const current = useOpenChatStore.getState().chatId
    if (current !== chatId) navigateRef.current(`/chat/${chatId}`)
  }, [])
}

/**
 * No celular a lista não tem altura mínima (deitado, com o teclado, sobra pouco), e o fim dela deixa
 * folga para a última linha não ficar atrás do botão de nova conversa.
 */
const MOBILE_LIST_STYLE = { minHeight: 0 }
const MOBILE_LIST_END = <span aria-hidden className="block h-14" />

function useEmptyState(query: ChatListQuery, onCreate: () => void) {
  const { t } = useTranslation()
  const clearAll = useListFilters((state) => state.clearAll)
  const setStatus = useListFilters((state) => state.setStatus)
  const filtered = Boolean(query.search) || query.conditions.length > 0 || query.status !== "all"

  return filtered
    ? {
        icon: <SearchX className="size-5" />,
        title: t("chat.list.noResults"),
        description: t("chat.list.noResultsHint"),
        action: {
          label: t("chat.list.clearFilters"),
          onClick: () => {
            clearAll()
            setStatus("all")
          },
        },
        className: "border-0",
      }
    : {
        icon: <MessagesSquare className="size-5" />,
        title: t("chat.list.empty"),
        description: t("chat.list.emptyHint"),
        action: { label: t("chat.list.newChat"), onClick: onCreate },
        className: "border-0",
      }
}

/** As conversas de um canal: uma linha por conversa, com etiquetas e quem atende. */
const ChannelChats = memo(function ChannelChats({
  query,
  onCreate,
}: {
  query: ChatListQuery
  onCreate: () => void
}) {
  const { t } = useTranslation()
  const list = useChatList(query)
  const { byId: connectors } = useChatConnectors()
  const { byId: tags } = useChatTags()
  const { byId: people } = useChatPeople()
  const openChat = useOpenChat()
  const empty = useEmptyState(query, onCreate)
  const mobile = Boolean(useChatVariant())

  useEffect(() => {
    useChatSelection.getState().setLoaded(list.items)
  }, [list.items])

  return (
    <InfiniteList
      aria-label={t("chat.list.label")}
      className="h-full"
      items={list.items}
      getItemKey={(id) => id}
      renderItem={(id) => (
        <ChatRow
          chatId={id}
          connectors={connectors}
          tags={tags}
          people={people}
          onOpen={openChat}
          holdToSelect={mobile}
        />
      )}
      hasMore={list.hasMore}
      loading={list.loading}
      loadingMore={list.loadingMore}
      onLoadMore={list.loadMore}
      error={list.items.length > 0 ? list.moreError : list.error}
      onRetry={list.retry}
      empty={empty}
      skeleton={<ChatListSkeleton />}
      endLabel={mobile ? MOBILE_LIST_END : false}
      style={mobile ? MOBILE_LIST_STYLE : undefined}
    />
  )
})

function seedFromContact(contact: UnifiedContact, chatId: string) {
  const entry = contact.chats.find((chat) => chat.chatId === chatId)

  // Só para o cabeçalho, até `GET /chats/:id` responder. Nada aqui decide regra da conversa.
  const seed: Chat = {
    id: chatId,
    connectorId: entry?.connectorId ?? null,
    audienceId: contact.audienceId,
    externalId: contact.externalId,
    phoneNumber: contact.externalId,
    userName: contact.name,
    displayName: null,
    abbreviatedName: null,
    audienceType: entry?.audienceType ?? null,
    audienceUserName: null,
    profilePictureUrl: contact.profilePictureUrl,
    status: entry?.status ?? "open",
    automationEnabled: false,
    automationResumeAt: null,
    assignedAccountId: null,
    teamId: null,
    unreadMessages: entry?.unread ?? 0,
    senderPhoneNumberId: entry?.senderPhoneNumberId ?? null,
    sessionStartAt: null,
    activeSession: true,
    lastMessageAt: entry?.lastMessageAt ?? null,
    lastMessageFrom: null,
    lastMessageType: null,
    lastMessageBy: null,
    lastMessageContent: null,
    notes: null,
    tagIds: [],
    customAttributes: {},
    funnelStages: {},
    createdAt: null,
    updatedAt: null,
  }
  seedChat(seed)
}

/** "Todos": uma linha por contato. Abre no último canal usado, ou no que casou com o filtro. */
const AllContacts = memo(function AllContacts({
  query,
  onCreate,
}: {
  query: ChatListQuery
  onCreate: () => void
}) {
  const { t } = useTranslation()
  const list = useUnifiedContactList(query)
  const { byId: connectors } = useChatConnectors()
  const openChat = useOpenChat()
  const empty = useEmptyState(query, onCreate)
  const mobile = Boolean(useChatVariant())

  useEffect(() => {
    useChatSelection
      .getState()
      .setLoaded(list.items.flatMap((contact) => selectableChatIds(contact.chats)))
  }, [list.items])

  const openContact = useCallback(
    (contact: UnifiedContact) => {
      const chat = resolveInitialChat(contact, useLastChannel.getState().lastChatByContact)
      if (!chat) return

      seedFromContact(contact, chat.chatId)
      useOpenChatStore.setState({
        externalId: contact.externalId,
        matches: Object.fromEntries(contact.chats.map((entry) => [entry.chatId, entry.matched])),
      })
      openChat(chat.chatId)
    },
    [openChat]
  )

  return (
    <InfiniteList
      aria-label={t("chat.list.label")}
      className="h-full"
      items={list.items}
      getItemKey={(contact) => contact.externalId}
      renderItem={(contact) => (
        <UnifiedRow
          contact={contact}
          connectors={connectors}
          onOpen={openContact}
          holdToSelect={mobile}
        />
      )}
      hasMore={list.hasMore}
      loading={list.loading}
      loadingMore={list.loadingMore}
      onLoadMore={list.loadMore}
      error={list.items.length > 0 ? list.moreError : list.error}
      onRetry={list.retry}
      empty={empty}
      skeleton={<ChatListSkeleton />}
      endLabel={mobile ? MOBILE_LIST_END : false}
      style={mobile ? MOBILE_LIST_STYLE : undefined}
    />
  )
})

/** Qual lista mostrar sai da aba: "Todos" junta os canais por contato, e um canal lista conversas. */
export function ListBody({ onCreate }: { onCreate: () => void }) {
  const query = useListQuery()

  return query.connectorId ? (
    <ChannelChats query={query} onCreate={onCreate} />
  ) : (
    <AllContacts query={query} onCreate={onCreate} />
  )
}
