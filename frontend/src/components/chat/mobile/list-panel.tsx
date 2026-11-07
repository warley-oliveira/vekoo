import { lazy, memo, Suspense, useMemo, useState } from "react"
import { motion } from "motion/react"
import { useTranslation } from "react-i18next"
import { CheckSquare, ListFilter, MoreHorizontal, Plus, Settings2, Sparkles, WifiOff } from "lucide-react"

import { BottomSheet } from "@/components/shell/bottom-sheet"
import { SearchInput } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useChatConnectors } from "@/hooks/chat/use-chat-refs"
import { useOfflineNotice } from "@/hooks/chat/use-offline-notice"
import { useChatPreferencesPanel, useListCleanup } from "@/hooks/chat-details/use-list-extras"
import { channelKey, isConnectorDown } from "@/lib/chat/channel"
import { toQueryConditions } from "@/lib/chat/filters"
import { STATUS_OPTIONS } from "@/lib/chat/list-query"
import { useListFilters } from "@/lib/chat/stores"
import { toggleCopilot } from "@/lib/chat-details/panel-store"
import { useChatSelection } from "@/lib/chat-details/selection"
import { useKeyboardOpen } from "@/lib/chat-mobile/keyboard"
import { useMotionPreset } from "@/lib/motion"
import { cn } from "@/lib/utils"
import { ChannelIcon } from "../channel-icon"
import { ListSelection } from "../extension-points"
import { ActiveFilters } from "../list/active-filters"
import { ListBody } from "../list/list-body"
import { SheetRow } from "./sheet-row"

const FilterPanel = lazy(() => import("../list/filter-panel"))
const NewChatDialog = lazy(() => import("../list/new-chat-dialog"))

function Chip({
  selected,
  onSelect,
  title,
  children,
}: {
  selected: boolean
  onSelect: () => void
  title?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      data-slot="chip"
      role="radio"
      aria-checked={selected}
      title={title}
      onClick={onSelect}
      className={cn(
        "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[0.8125rem] whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-3.5",
        selected
          ? "bg-accent font-medium text-accent-foreground"
          : "bg-muted/70 text-muted-foreground active:bg-muted"
      )}
    >
      {children}
    </button>
  )
}

/**
 * Situação e canal numa fileira só, que rola de lado. Na tela larga são duas linhas: aqui, cada uma
 * tiraria duas conversas da tela.
 */
const ListChips = memo(function ListChips() {
  const { t } = useTranslation()
  const status = useListFilters((state) => state.status)
  const setStatus = useListFilters((state) => state.setStatus)
  const connectorId = useListFilters((state) => state.connectorId)
  const setConnectorId = useListFilters((state) => state.setConnectorId)
  const { connectors, byId } = useChatConnectors()

  // O canal lembrado pode ter sido removido: volta para "todos", em vez de uma lista vazia.
  const channel = connectorId && byId.has(connectorId) ? connectorId : null

  const tabs = useMemo(
    () =>
      connectors.map((connector) => ({
        id: connector.id,
        name: connector.name,
        key: channelKey(connector, null),
        down: isConnectorDown(connector),
      })),
    [connectors]
  )

  return (
    <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto px-3 py-1.5 [scrollbar-width:none] landscape:flex-1 landscape:pl-0 [&::-webkit-scrollbar]:hidden">
      <div role="radiogroup" aria-label={t("chat.list.status")} className="flex shrink-0 gap-1.5">
        {STATUS_OPTIONS.map((value) => (
          <Chip key={value} selected={status === value} onSelect={() => setStatus(value)}>
            {t(`chat.list.statusFilter.${value}`)}
          </Chip>
        ))}
      </div>

      {tabs.length > 0 ? (
        <>
          <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-border" />
          <div role="radiogroup" aria-label={t("chat.list.channels")} className="flex shrink-0 gap-1.5">
            <Chip selected={channel === null} onSelect={() => setConnectorId(null)}>
              {t("chatMobile.list.allChannels")}
            </Chip>
            {tabs.map((tab) => (
              <Chip
                key={tab.id}
                selected={channel === tab.id}
                title={tab.down ? t("chat.list.channelDown", { name: tab.name }) : tab.name}
                onSelect={() => setConnectorId(tab.id)}
              >
                <ChannelIcon channel={tab.key} />
                <span className="max-w-32 truncate">{tab.name}</span>
                {tab.down ? (
                  <span
                    role="img"
                    aria-label={t("chat.list.channelDown", { name: tab.name })}
                    className="size-1.5 rounded-full bg-status-warning"
                  />
                ) : null}
              </Chip>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
})

/**
 * A lista do celular. O corpo é o mesmo da tela larga: muda só o que fica em volta. Buscar e filtrar
 * no alto, o resto numa folha, e "Nova conversa" onde o polegar alcança sem esticar.
 */
export const MobileListPanel = memo(function MobileListPanel({ connected }: { connected: boolean }) {
  const { t } = useTranslation()
  const preset = useMotionPreset()
  const search = useListFilters((state) => state.search)
  const setSearch = useListFilters((state) => state.setSearch)
  const activeCount = useListFilters((state) => toQueryConditions(state.conditions).length)
  const selecting = useChatSelection((state) => state.active)
  const enterSelection = useChatSelection((state) => state.enter)
  const keyboardOpen = useKeyboardOpen()

  // Montados na primeira abertura e mantidos, para a animação de saída e o estado do painel.
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filtersEverOpen, setFiltersEverOpen] = useState(false)
  const [newChatOpen, setNewChatOpen] = useState(false)
  const [newChatEverOpen, setNewChatEverOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const preferences = useChatPreferencesPanel()
  const offline = useOfflineNotice(connected)
  useListCleanup()

  const openNewChat = () => {
    setNewChatEverOpen(true)
    setNewChatOpen(true)
  }

  const fromMenu = (action: () => void) => () => {
    setMenuOpen(false)
    action()
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-col pt-2 landscape:flex-row landscape:items-center landscape:pt-0">
        <div className="flex min-w-0 items-center gap-0.5 pr-1 pl-3 landscape:w-96 landscape:shrink-0">
          <SearchInput
            value={search}
            onChange={setSearch}
            shortcut={false}
            placeholder={t("chat.list.search")}
            className="h-11 min-w-0 flex-1 rounded-full border-transparent bg-muted/70 shadow-none"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("chat.filters.openWithCount", { count: activeCount })}
            className={cn(
              "relative size-11 shrink-0 rounded-full [&_svg]:size-5",
              activeCount > 0 && "text-primary"
            )}
            onClick={() => {
              setFiltersEverOpen(true)
              setFiltersOpen(true)
            }}
          >
            <ListFilter />
            {activeCount > 0 ? (
              <span className="absolute top-2 right-2 size-2 rounded-full bg-primary" />
            ) : null}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("chatDetails.list.more")}
            className="size-11 shrink-0 rounded-full [&_svg]:size-5"
            onClick={() => setMenuOpen(true)}
          >
            <MoreHorizontal />
          </Button>
        </div>

        <ListChips />
      </div>

      <div className="h-px shrink-0 bg-border" />

      <ActiveFilters />
      <ListSelection />

      {offline ? (
        <p
          role="status"
          className="flex shrink-0 items-center gap-2 bg-status-warning-soft px-4 py-1.5 text-xs text-status-warning"
        >
          <WifiOff aria-hidden className="size-3.5 shrink-0" />
          {t("chat.list.offline")}
        </p>
      ) : null}

      <div className="min-h-0 flex-1">
        <ListBody onCreate={openNewChat} />
      </div>

      {!selecting && !keyboardOpen ? (
        <motion.div {...preset.slideUp} className="absolute right-4 bottom-4 pr-safe">
          <Button
            type="button"
            aria-label={t("chat.list.newChat")}
            className="size-14 rounded-2xl shadow-lg [&_svg]:size-6"
            onClick={openNewChat}
          >
            <Plus />
          </Button>
        </motion.div>
      ) : null}

      <BottomSheet open={menuOpen} onClose={() => setMenuOpen(false)} title={t("chatDetails.list.more")}>
        <div className="chat-touch flex flex-col gap-0.5 pb-3">
          <SheetRow
            icon={<Sparkles />}
            title={t("chatDetails.copilot.open")}
            hint={t("chatMobile.list.copilotHint")}
            onClick={fromMenu(toggleCopilot)}
          />
          <SheetRow
            icon={<CheckSquare />}
            title={t("chatDetails.list.select")}
            hint={t("chatMobile.list.selectHint")}
            onClick={fromMenu(enterSelection)}
          />
          <SheetRow
            icon={<Settings2 />}
            title={t("chatDetails.list.preferences")}
            hint={t("chatMobile.list.preferencesHint")}
            onClick={fromMenu(preferences.open)}
          />
        </div>
      </BottomSheet>

      <Suspense fallback={null}>
        {filtersEverOpen ? <FilterPanel open={filtersOpen} onOpenChange={setFiltersOpen} /> : null}
        {newChatEverOpen ? <NewChatDialog open={newChatOpen} onOpenChange={setNewChatOpen} /> : null}
      </Suspense>
      {preferences.panel}
    </div>
  )
})
