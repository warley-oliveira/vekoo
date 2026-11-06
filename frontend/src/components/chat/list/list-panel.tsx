import { lazy, memo, Suspense, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { ListFilter, Plus, WifiOff } from "lucide-react"

import { SearchInput, SegmentedControl } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { toQueryConditions } from "@/lib/chat/filters"
import type { StatusFilter } from "@/lib/chat/list-query"
import { useListFilters } from "@/lib/chat/stores"
import { cn } from "@/lib/utils"
import { ListHeaderExtras, ListSelection } from "../extension-points"
import { ActiveFilters } from "./active-filters"
import { ChannelTabs } from "./channel-tabs"
import { ListBody } from "./list-body"

// Abrem pouco e pesam: o painel de filtros traz seletores e calendário, e o de nova conversa, um
// formulário inteiro. Só descem quando alguém pede.
const FilterPanel = lazy(() => import("./filter-panel"))
const NewChatDialog = lazy(() => import("./new-chat-dialog"))

/** Só avisa depois desse tempo: uma reconexão rápida não merece aparecer. */
const OFFLINE_NOTICE_DELAY_MS = 4_000

function useOfflineNotice(connected: boolean): boolean {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (connected) {
      setShow(false)
      return
    }
    const timer = setTimeout(() => setShow(true), OFFLINE_NOTICE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [connected])

  return show
}

const STATUS_OPTIONS: StatusFilter[] = ["all", "open", "closed"]

export const ListPanel = memo(function ListPanel({ connected }: { connected: boolean }) {
  const { t } = useTranslation()
  const search = useListFilters((state) => state.search)
  const setSearch = useListFilters((state) => state.setSearch)
  const status = useListFilters((state) => state.status)
  const setStatus = useListFilters((state) => state.setStatus)
  const activeCount = useListFilters((state) => toQueryConditions(state.conditions).length)

  // Montados na primeira abertura e mantidos, para a animação de saída e o estado do painel.
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filtersEverOpen, setFiltersEverOpen] = useState(false)
  const [newChatOpen, setNewChatOpen] = useState(false)
  const [newChatEverOpen, setNewChatEverOpen] = useState(false)

  const offline = useOfflineNotice(connected)

  const openNewChat = () => {
    setNewChatEverOpen(true)
    setNewChatOpen(true)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-col gap-2.5 px-3 pt-3">
        <div className="flex items-center gap-1.5">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t("chat.list.search")}
            className="min-w-0 flex-1"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("chat.filters.openWithCount", { count: activeCount })}
            title={t("chat.filters.title")}
            className={cn("relative shrink-0 pointer-coarse:size-10", activeCount > 0 && "text-primary")}
            onClick={() => {
              setFiltersEverOpen(true)
              setFiltersOpen(true)
            }}
          >
            <ListFilter />
            {activeCount > 0 ? (
              <span className="absolute top-1 right-1 size-1.5 rounded-full bg-primary" />
            ) : null}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("chat.list.newChat")}
            title={t("chat.list.newChat")}
            className="shrink-0 pointer-coarse:size-10"
            onClick={openNewChat}
          >
            <Plus />
          </Button>
          <ListHeaderExtras />
        </div>

        <SegmentedControl<StatusFilter>
          aria-label={t("chat.list.status")}
          fullWidth
          value={status}
          onChange={setStatus}
          options={STATUS_OPTIONS.map((value) => ({
            value,
            label: t(`chat.list.statusFilter.${value}`),
          }))}
        />

        <ChannelTabs />
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

      <div className="min-h-0 flex-1 pt-1">
        <ListBody onCreate={openNewChat} />
      </div>

      <Suspense fallback={null}>
        {filtersEverOpen ? <FilterPanel open={filtersOpen} onOpenChange={setFiltersOpen} /> : null}
        {newChatEverOpen ? <NewChatDialog open={newChatOpen} onOpenChange={setNewChatOpen} /> : null}
      </Suspense>
    </div>
  )
})
