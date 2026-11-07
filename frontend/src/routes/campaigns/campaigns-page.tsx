import { useCallback, useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router"
import { Plus } from "lucide-react"

import { CampaignAttention } from "@/components/campaigns/campaign-attention"
import { CampaignBulkBar } from "@/components/campaigns/campaign-bulk-bar"
import {
  CAMPAIGN_ROW_GRID,
  CampaignRow,
  CampaignRowSkeleton,
} from "@/components/campaigns/campaign-row"
import { DeliveryLegend } from "@/components/campaigns/delivery-bar"
import { CampaignSummaryTiles } from "@/components/campaigns/campaign-summary"
import { CampaignsAreaNav } from "@/components/campaigns/campaigns-area-nav"
import { CampaignsEmpty } from "@/components/campaigns/campaigns-empty"
import {
  EmptyState,
  ErrorState,
  FacetedFilter,
  FilterBar,
  LoadingRegion,
  PageBody,
  PageHeader,
  SortMenu,
  TablePagination,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { useCampaignActions } from "@/hooks/campaigns/use-campaign-actions"
import {
  CAMPAIGN_PER_PAGE_OPTIONS,
  CAMPAIGN_SORTS,
  useCampaignFilters,
} from "@/hooks/campaigns/use-campaign-filters"
import { useCampaignListLive } from "@/hooks/campaigns/use-campaign-list-live"
import {
  useCampaignConnectors,
  useCampaignList,
  useCampaignSummary,
} from "@/hooks/campaigns/use-campaigns"
import { channelLabel, connectorLabel } from "@/lib/campaigns/format"
import { hasNotStarted } from "@/lib/campaigns/status"
import { CAMPAIGN_STATUSES, type Campaign } from "@/lib/campaigns/types"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { useMotionPreset } from "@/lib/motion"
import { cn } from "@/lib/utils"

const SKELETON_ROWS = 6
const NO_CAMPAIGNS: Campaign[] = []

export default function CampaignsPage() {
  const { t } = useTranslation()
  const language = useLanguage()
  const preset = useMotionPreset()

  const { filters, listPath, isFiltered, activeCount, setQuery, setStatuses, setConnectorIds, setSort, setPage, setPerPage, clear } =
    useCampaignFilters()
  const { data, error, isLoading, isValidating, mutate } = useCampaignList(listPath)
  const { data: summaryData } = useCampaignSummary()
  const { connectors, byId } = useCampaignConnectors()
  const actions = useCampaignActions()
  useCampaignListLive()

  const campaigns = data?.campaigns ?? NO_CAMPAIGNS
  const meta = data?.meta
  const total = meta?.total ?? 0
  const firstLoad = isLoading && !data

  /* ---------- seleção ---------- */

  // Guarda a campanha, e não só o id: a seleção sobrevive à troca de página, e as regras do lote são
  // por estado. Na linha que está à vista, vale o estado mais novo.
  const [selection, setSelection] = useState<Record<string, Campaign>>({})
  const clearSelection = useCallback(() => setSelection({}), [])

  const toggleSelected = useCallback((campaign: Campaign) => {
    setSelection((current) => {
      const next = { ...current }
      if (next[campaign.id]) delete next[campaign.id]
      else next[campaign.id] = campaign
      return next
    })
  }, [])

  // Mudou o que se está procurando: o que estava marcado pode nem estar mais à vista, e uma ação em
  // lote não pode alcançar o que a pessoa já não enxerga.
  const scope = JSON.stringify([filters.q, filters.statuses, filters.connectorIds])
  const [lastScope, setLastScope] = useState(scope)
  if (scope !== lastScope) {
    setLastScope(scope)
    setSelection({})
  }

  const rowsById = useMemo(() => new Map(campaigns.map((campaign) => [campaign.id, campaign])), [campaigns])
  const selected = useMemo(
    () => Object.keys(selection).map((id) => rowsById.get(id) ?? selection[id]),
    [rowsById, selection]
  )
  const selecting = selected.length > 0

  const pageSelected = campaigns.length > 0 && campaigns.every((campaign) => selection[campaign.id])
  const someOnPage = campaigns.some((campaign) => selection[campaign.id])

  function togglePage(checked: boolean) {
    setSelection((current) => {
      const next = { ...current }
      for (const campaign of campaigns) {
        if (checked) next[campaign.id] = campaign
        else delete next[campaign.id]
      }
      return next
    })
  }

  /* ---------- página que sumiu ---------- */

  // Excluir pode esvaziar a última página, e o link pode ser antigo.
  useEffect(() => {
    if (!meta || isValidating) return
    if (meta.page > 1 && meta.page > Math.max(meta.totalPages, 1)) setPage(Math.max(meta.totalPages, 1))
  }, [isValidating, meta, setPage])

  /* ---------- opções ---------- */

  const byStatus = summaryData?.summary.byStatus
  const statusOptions = useMemo(
    () =>
      CAMPAIGN_STATUSES.map((status) => ({
        value: status,
        label: t(`campaigns.status.${status}`),
        count: byStatus?.[status],
      })),
    [byStatus, t]
  )
  const channelOptions = useMemo(
    () =>
      (connectors ?? []).map((connector) => ({
        value: connector.id,
        label: connector.active
          ? connectorLabel(connector)
          : t("campaigns.list.disconnectedChannel", { name: connectorLabel(connector) }),
      })),
    [connectors, t]
  )
  const sortOptions = useMemo(
    () => CAMPAIGN_SORTS.map((value) => ({ value, label: t(`campaigns.list.sort.${value}`) })),
    [t]
  )

  /* ---------- tela ---------- */

  const createButton = (
    <Button nativeButton={false} className="pointer-coarse:h-10" render={<Link to="/campaigns/new" />}>
      <Plus />
      {t("campaigns.list.create")}
    </Button>
  )
  const header = (
    <PageHeader
      actions={createButton}
      mobileActions={
        <Button
          nativeButton={false}
          size="icon"
          className="size-10"
          aria-label={t("campaigns.list.create")}
          render={<Link to="/campaigns/new" />}
        >
          <Plus className="size-5" />
        </Button>
      }
      mobilePlacement="inline"
    />
  )

  if (error && !data) {
    return (
      <PageBody variant="wide">
        {header}
        <CampaignsAreaNav />
        <ErrorState error={error} onRetry={() => void mutate()} />
      </PageBody>
    )
  }

  // Sem campanha nenhuma: filtros e números não têm sobre o que agir.
  const nothingYet = data && total === 0 && !isFiltered && filters.page === 1

  return (
    // Com a barra de lote flutuando, o fim da página sobe para ela não cobrir a paginação.
    <PageBody variant="wide" className={selecting ? "pb-24" : undefined}>
      {header}
      <CampaignsAreaNav />

      {nothingYet ? (
        <CampaignsEmpty />
      ) : (
        <>
          <CampaignSummaryTiles />
          <CampaignAttention />

          <div className="flex min-w-0 flex-col gap-3">
            <FilterBar
              search={{
                value: filters.q,
                onChange: setQuery,
                placeholder: t("campaigns.list.search"),
                loading: isValidating && Boolean(filters.q),
                className: "md:w-72",
              }}
              activeCount={activeCount}
              onClear={clear}
              resultLabel={
                total > 0
                  ? t("campaigns.list.count", { count: total, formatted: formatNumber(total, language) })
                  : undefined
              }
              filters={
                <>
                  <FacetedFilter
                    title={t("campaigns.list.filters.status")}
                    options={statusOptions}
                    value={filters.statuses}
                    onChange={setStatuses}
                  />
                  {channelOptions.length > 0 ? (
                    <FacetedFilter
                      title={t("campaigns.list.filters.channel")}
                      options={channelOptions}
                      value={filters.connectorIds}
                      onChange={setConnectorIds}
                    />
                  ) : null}
                </>
              }
              sort={<SortMenu options={sortOptions} value={filters.sort} onChange={setSort} />}
            />

            {firstLoad ? (
              <LoadingRegion className="divide-y rounded-xl bg-card ring-1 ring-foreground/10">
                {Array.from({ length: SKELETON_ROWS }, (_, index) => (
                  <CampaignRowSkeleton key={index} />
                ))}
              </LoadingRegion>
            ) : campaigns.length === 0 ? (
              <EmptyState
                title={t("campaigns.list.noResults.title")}
                description={t("campaigns.list.noResults.description")}
                action={{ label: t("kit.filters.clear"), onClick: clear }}
              />
            ) : (
              <div
                className={cn(
                  "overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 transition-opacity",
                  isLoading && "opacity-60"
                )}
              >
                <div
                  className={cn(
                    "hidden border-b px-4 py-2 text-xs font-medium text-muted-foreground md:grid",
                    CAMPAIGN_ROW_GRID
                  )}
                >
                  <Checkbox
                    aria-label={t("campaigns.list.selectPage")}
                    checked={pageSelected}
                    indeterminate={!pageSelected && someOnPage}
                    className="border-muted-foreground/40 data-indeterminate:border-primary data-indeterminate:bg-primary data-indeterminate:text-primary-foreground"
                    onCheckedChange={(checked) => togglePage(Boolean(checked))}
                  />
                  <span>{t("campaigns.list.columns.campaign")}</span>
                  <span>{t("campaigns.list.columns.status")}</span>
                  <span>{t("campaigns.list.columns.progress")}</span>
                  <span className="hidden xl:block">{t("campaigns.list.columns.result")}</span>
                  <span aria-hidden />
                </div>
                <ul className="divide-y">
                  <AnimatePresence initial={false} mode="popLayout">
                    {campaigns.map((campaign) => (
                      <motion.li key={campaign.id} layout={!preset.reduced} {...preset.listItem}>
                        <CampaignRow
                          campaign={campaign}
                          channel={channelLabel(campaign, byId, t)}
                          actions={actions}
                          selected={Boolean(selection[campaign.id])}
                          selecting={selecting}
                          onToggleSelect={toggleSelected}
                        />
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              </div>
            )}

            {campaigns.some((campaign) => !hasNotStarted(campaign.status)) ? <DeliveryLegend /> : null}

            {meta && total > 0 ? (
              <TablePagination
                page={meta.page}
                totalPages={meta.totalPages}
                total={meta.total}
                perPage={meta.perPage}
                perPageOptions={CAMPAIGN_PER_PAGE_OPTIONS}
                onPageChange={setPage}
                onPerPageChange={setPerPage}
              />
            ) : null}
          </div>

          <CampaignBulkBar selected={selected} actions={actions} onClear={clearSelection} />
        </>
      )}
    </PageBody>
  )
}
