import { memo } from "react"
import { useTranslation } from "react-i18next"
import { Bot } from "lucide-react"

import { TagChip, UserAvatar } from "@/components/shared"
import { apiAssetUrl } from "@/lib/api"
import { channelKey, contactHandle, type ChatConnector } from "@/lib/chat/channel"
import { chatDisplayName, useChat } from "@/lib/chat/chat-store"
import { useOpenChatStore } from "@/lib/chat/stores"
import type { ChatPerson, ChatTag } from "@/lib/chat/types"
import { useChatListPrefs } from "@/lib/chat-details/list-prefs"
import { useChatSelection } from "@/lib/chat-details/selection"
import { haptic } from "@/lib/chat-mobile/haptics"
import { ChannelBadge } from "../channel-icon"
import { LastMessagePreview, ListRow, RowName, RowTime, UnreadBadge } from "./row-parts"

const MAX_TAGS = 2

export type ChatRowProps = {
  chatId: string
  connectors: Map<string, ChatConnector>
  tags: Map<string, ChatTag>
  people: Map<string, ChatPerson>
  onOpen: (chatId: string) => void
  /** No celular, segurar a linha entra na escolha de conversas, já com esta marcada. */
  holdToSelect?: boolean
}

/**
 * Uma conversa na lista. Lê a própria conversa do store, por id: o que muda nela desenha só esta
 * linha, e selecionar outra conversa desenha só as duas envolvidas.
 */
export const ChatRow = memo(function ChatRow({
  chatId,
  connectors,
  tags,
  people,
  onOpen,
  holdToSelect = false,
}: ChatRowProps) {
  const { t } = useTranslation()
  const chat = useChat(chatId)
  const selected = useOpenChatStore((state) => state.chatId === chatId)
  const selecting = useChatSelection((state) => state.active)
  const checked = useChatSelection((state) => state.ids.has(chatId))
  const showTags = useChatListPrefs((state) => state.showTags)
  const showPhone = useChatListPrefs((state) => state.showPhone)

  if (!chat) return null

  const connector = chat.connectorId ? connectors.get(chat.connectorId) : undefined
  const channel = channelKey(connector, chat.audienceType)
  const name = chatDisplayName(chat, {
    visitor: t("chat.contact.visitor"),
    contact: t("chat.contact.fallback"),
  })
  const handle = contactHandle(chat, channel)
  const unread = chat.unreadMessages > 0
  const assignee = chat.assignedAccountId ? people.get(chat.assignedAccountId) : undefined
  const chatTags = chat.tagIds.flatMap((id) => {
    const tag = tags.get(id)
    return tag ? [tag] : []
  })

  return (
    <ListRow
      href={`/chat/${chat.id}`}
      selected={selected}
      onOpen={() => onOpen(chat.id)}
      onHold={
        holdToSelect
          ? () => {
              haptic()
              useChatSelection.getState().enter()
              useChatSelection.getState().toggle([chatId])
            }
          : undefined
      }
      selection={
        selecting
          ? {
              checked,
              label: t("chatDetails.bulk.selectRow", { name }),
              onToggle: () => useChatSelection.getState().toggle([chatId]),
            }
          : undefined
      }
      avatar={
        <>
          <UserAvatar
            size="lg"
            name={name}
            src={chat.profilePictureUrl ? apiAssetUrl(chat.profilePictureUrl) : null}
          />
          <ChannelBadge channel={channel} label={t(`chat.channel.${channel}`)} />
        </>
      }
      title={
        <RowName unread={unread} officialApi={holdToSelect && connector?.type === "whatsapp_cloud"}>
          {name}
        </RowName>
      }
      meta={
        <>
          {chat.automationEnabled ? (
            <Bot
              role="img"
              aria-label={t("chat.automation.on")}
              className="size-3.5 text-muted-foreground"
            />
          ) : null}
          <RowTime at={chat.lastMessageAt} unread={unread} />
        </>
      }
    >
      <span className="flex items-center justify-between gap-2">
        <LastMessagePreview
          type={chat.lastMessageType}
          content={chat.lastMessageContent}
          by={chat.lastMessageBy}
          unread={unread}
        />
        <span className="flex shrink-0 items-center gap-1.5">
          {assignee ? (
            <UserAvatar
              name={assignee.name}
              src={assignee.avatarUrl ? apiAssetUrl(assignee.avatarUrl) : null}
              className="size-4 text-[0.5rem] [&_[data-slot=avatar-fallback]]:text-[0.5rem]"
            />
          ) : null}
          <UnreadBadge
            count={chat.unreadMessages}
            label={t("chat.list.unread", { count: chat.unreadMessages })}
          />
        </span>
      </span>

      {handle && showPhone ? (
        <span className="truncate text-xs text-muted-foreground">{handle}</span>
      ) : null}

      {chatTags.length > 0 && showTags ? (
        <span className="mt-0.5 flex min-w-0 items-center gap-1 overflow-hidden">
          {chatTags.slice(0, MAX_TAGS).map((tag) => (
            <TagChip key={tag.id} color={tag.color} className="h-[1.125rem] px-1 text-[0.6875rem]">
              {tag.name}
            </TagChip>
          ))}
          {chatTags.length > MAX_TAGS ? (
            <span className="text-[0.6875rem] text-muted-foreground">
              {t("chat.list.moreTags", { count: chatTags.length - MAX_TAGS })}
            </span>
          ) : null}
        </span>
      ) : null}
    </ListRow>
  )
})
