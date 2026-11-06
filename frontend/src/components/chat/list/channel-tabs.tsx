import { memo, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Layers } from "lucide-react"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useChatConnectors } from "@/hooks/chat/use-chat-refs"
import { channelKey, isConnectorDown } from "@/lib/chat/channel"
import { useListFilters } from "@/lib/chat/stores"
import { ChannelIcon } from "../channel-icon"

const ALL_TAB = "all"

/** Uma aba por canal, e "Todos", que junta os canais por contato. Rola de lado se não couber. */
export const ChannelTabs = memo(function ChannelTabs() {
  const { t } = useTranslation()
  const { connectors, byId } = useChatConnectors()
  const connectorId = useListFilters((state) => state.connectorId)
  const setConnectorId = useListFilters((state) => state.setConnectorId)

  // O canal lembrado pode ter sido removido: volta para "Todos", em vez de uma lista vazia.
  const value = connectorId && byId.has(connectorId) ? connectorId : ALL_TAB

  const tabs = useMemo(
    () =>
      connectors.map((connector) => ({
        id: connector.id,
        name: connector.name,
        channel: channelKey(connector, null),
        down: isConnectorDown(connector),
      })),
    [connectors]
  )

  return (
    <Tabs
      value={value}
      onValueChange={(next) => setConnectorId(next === ALL_TAB ? null : String(next))}
    >
      <div className="-mx-3 overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <TabsList variant="line" aria-label={t("chat.list.channels")} className="h-8 w-max gap-2">
          <TabsTrigger value={ALL_TAB} className="flex-none px-1.5 text-[0.8125rem]">
            <Layers className="size-3.5" />
            {t("chat.list.allChannels")}
          </TabsTrigger>
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              title={tab.down ? t("chat.list.channelDown", { name: tab.name }) : tab.name}
              className="flex-none px-1.5 text-[0.8125rem]"
            >
              <ChannelIcon channel={tab.channel} className="size-3.5" />
              <span className="max-w-28 truncate">{tab.name}</span>
              {tab.down ? (
                <span aria-hidden className="size-1.5 rounded-full bg-status-warning" />
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
    </Tabs>
  )
})
