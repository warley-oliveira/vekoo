import { memo } from "react"
import { useTranslation } from "react-i18next"
import { Layers, TriangleAlert } from "lucide-react"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  channelKey,
  connectorNumber,
  isConnectorDown,
  type ChatConnector,
} from "@/lib/chat/channel"
import type { UnifiedContactChat } from "@/lib/chat/types"
import { cn } from "@/lib/utils"
import { ChannelIcon } from "../channel-icon"

export const ALL_CHATS_TAB = "all"

/**
 * Uma aba por conversa do contato, e "Todos", com a linha do tempo de todas. A aba é a conversa, e
 * não o conector: uma WABA com vários números tem uma conversa por número. A aba que não casou com
 * o filtro fica em cinza, e a de canal desconectado avisa.
 */
export const ThreadTabs = memo(function ThreadTabs({
  chats,
  connectors,
  value,
  onChange,
}: {
  chats: UnifiedContactChat[]
  connectors: Map<string, ChatConnector>
  value: string
  onChange: (value: string) => void
}) {
  const { t } = useTranslation()

  return (
    <Tabs value={value} onValueChange={(next) => onChange(String(next))}>
      <div className="overflow-x-auto border-b px-3 [scrollbar-width:none] md:px-4 [&::-webkit-scrollbar]:hidden">
        <TabsList variant="line" aria-label={t("chat.tabs.label")} className="h-11 w-max gap-3">
          {chats.map((chat) => {
            const connector = chat.connectorId ? connectors.get(chat.connectorId) : undefined
            const channel = channelKey(connector, chat.audienceType)
            const number = connectorNumber(connector, chat.senderPhoneNumberId)
            const down = isConnectorDown(connector)
            const name = connector?.name ?? t(`chat.channel.${channel}`)

            return (
              <TabsTrigger
                key={chat.chatId}
                value={chat.chatId}
                className={cn("h-10 flex-none gap-1.5 px-1", !chat.matched && "opacity-50 grayscale")}
              >
                <ChannelIcon channel={channel} colored className="size-3.5" />
                <span className="flex flex-col items-start leading-tight">
                  <span className="flex items-center gap-1 text-[0.8125rem]">
                    <span className="max-w-36 truncate">{name}</span>
                    {chat.unread > 0 ? (
                      <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.625rem] font-semibold text-primary-foreground tabular-nums">
                        {chat.unread > 99 ? "99+" : chat.unread}
                      </span>
                    ) : null}
                    {down ? (
                      <TriangleAlert
                        role="img"
                        aria-label={t("chat.tabs.disconnected")}
                        className="size-3 text-status-warning"
                      />
                    ) : null}
                  </span>
                  {number ? (
                    <span className="text-[0.6875rem] font-normal text-muted-foreground">{number}</span>
                  ) : null}
                </span>
              </TabsTrigger>
            )
          })}
          <TabsTrigger value={ALL_CHATS_TAB} className="h-10 flex-none gap-1.5 px-1 text-[0.8125rem]">
            <Layers className="size-3.5" />
            {t("chat.tabs.all")}
          </TabsTrigger>
        </TabsList>
      </div>
    </Tabs>
  )
})
