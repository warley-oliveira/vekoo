import { memo } from "react"
import { useTranslation } from "react-i18next"

import { UserAvatar } from "@/components/shared"
import { apiAssetUrl } from "@/lib/api"
import {
  channelKey,
  contactHandle,
  isConnectorDown,
  type ChatConnector,
} from "@/lib/chat/channel"
import { useOpenChatStore } from "@/lib/chat/stores"
import type { UnifiedContact } from "@/lib/chat/types"
import { selectableChatIds, useChatSelection } from "@/lib/chat-details/selection"
import { cn } from "@/lib/utils"
import { ChannelBadge, ChannelIcon } from "../channel-icon"
import { LastMessagePreview, ListRow, RowName, RowTime, UnreadBadge } from "./row-parts"

export type UnifiedRowProps = {
  contact: UnifiedContact
  connectors: Map<string, ChatConnector>
  onOpen: (contact: UnifiedContact) => void
}

/**
 * Um contato, com todas as suas conversas: uma marca por canal. A conversa de um canal que não
 * casou com o filtro fica em cinza, para mostrar que existe sem parecer resultado.
 */
export const UnifiedRow = memo(function UnifiedRow({ contact, connectors, onOpen }: UnifiedRowProps) {
  const { t } = useTranslation()
  const selected = useOpenChatStore((state) => state.externalId === contact.externalId)
  const selecting = useChatSelection((state) => state.active)
  // Uma linha de contato pode ser várias conversas: marcar marca as que casaram com o filtro.
  const chatIds = selectableChatIds(contact.chats)
  const checked = useChatSelection(
    (state) => chatIds.length > 0 && chatIds.every((id) => state.ids.has(id))
  )

  const main = contact.chats[0]
  const mainConnector = main?.connectorId ? connectors.get(main.connectorId) : undefined
  const channel = channelKey(mainConnector, main?.audienceType)
  const handle = contactHandle(
    { externalId: contact.externalId, phoneNumber: null, audienceUserName: null },
    channel
  )
  const name =
    contact.name ||
    handle ||
    (channel === "web" ? t("chat.contact.visitor") : t("chat.contact.fallback"))
  const unread = contact.totalUnread > 0
  const previewType = contact.lastMessageType ?? (contact.lastMessageContent === "-" ? "audio" : null)

  return (
    <ListRow
      href={main ? `/chat/${main.chatId}` : "/chat"}
      selected={selected}
      onOpen={() => onOpen(contact)}
      selection={
        selecting
          ? {
              checked,
              label: t("chatDetails.bulk.selectRow", { name }),
              onToggle: () => useChatSelection.getState().toggle(chatIds),
            }
          : undefined
      }
      avatar={
        <>
          <UserAvatar
            size="lg"
            name={name}
            src={contact.profilePictureUrl ? apiAssetUrl(contact.profilePictureUrl) : null}
          />
          {contact.chats.length === 1 ? (
            <ChannelBadge channel={channel} label={t(`chat.channel.${channel}`)} />
          ) : null}
        </>
      }
      title={<RowName unread={unread}>{name}</RowName>}
      meta={<RowTime at={contact.lastMessageAt} unread={unread} />}
    >
      <span className="flex items-center justify-between gap-2">
        <LastMessagePreview
          type={previewType}
          content={contact.lastMessageContent}
          by={contact.lastMessageBy}
          unread={unread}
        />
        <UnreadBadge
          count={contact.totalUnread}
          label={t("chat.list.unread", { count: contact.totalUnread })}
        />
      </span>

      {contact.chats.length > 1 ? (
        <span className="mt-0.5 flex items-center gap-1.5">
          {contact.chats.map((chat) => {
            const connector = chat.connectorId ? connectors.get(chat.connectorId) : undefined
            const key = channelKey(connector, chat.audienceType)
            const dim = !chat.matched || isConnectorDown(connector)
            return (
              <span
                key={chat.chatId}
                role="img"
                aria-label={t(`chat.channel.${key}`)}
                title={connector?.name ?? t(`chat.channel.${key}`)}
                className={cn(
                  "flex size-4 items-center justify-center rounded-full",
                  chat.matched ? "text-foreground/70" : "text-muted-foreground",
                  dim && "opacity-40"
                )}
              >
                <ChannelIcon channel={key} className="size-3" />
              </span>
            )
          })}
        </span>
      ) : null}
    </ListRow>
  )
})
