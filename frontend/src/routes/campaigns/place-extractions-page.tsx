import { useCallback, useEffect, useMemo } from "react"
import { AnimatePresence, motion } from "motion/react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router"
import { Info, MapPinned, Store } from "lucide-react"

import { CampaignsAreaNav } from "@/components/campaigns/campaigns-area-nav"
import { ExtractionResultsPanel } from "@/components/campaigns/extraction-results-panel"
import { ExtractionRow } from "@/components/campaigns/extraction-row"
import { PlaceCard } from "@/components/campaigns/place-card"
import {
  Callout,
  CardGridSkeleton,
  EmptyState,
  ErrorState,
  FacetedFilter,
  FilterBar,
  ListSkeleton,
  PageBody,
  SegmentedControl,
  TablePagination,
} from "@/components/shared"
import { useCampaignCapabilities } from "@/hooks/campaigns/use-campaigns"
import { useScrollPageTop } from "@/hooks/campaigns/use-scroll-page-top"
import {
  PLACES_PER_PAGE_OPTIONS,
  usePlaceContacts,
  usePlaceExtractionDelete,
  usePlaceExtractionList,
  usePlaceExtractionsLive,
  usePlacesQuery,
  type PlacesView,
} from "@/hooks/campaigns/use-place-extractions"
import { PLACE_EXTRACTION_STATUSES } from "@/lib/campaigns/types"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { useMotionPreset } from "@/lib/motion"
import { cn } from "@/lib/utils"

/**
 * As buscas de estabelecimentos e o que elas encontraram. A busca nova nasce no assistente de campanha,
 * como na origem: é lá que ela faz sentido. Aqui se acompanha, se confere e se reaproveita.
 */
export default function PlaceExtractionsPage() {
  const { t } = useTranslation()
  const { filters, setView, setQuery, setStatuses, setPage, setPerPage, clear, openResults } = usePlacesQuery()
  const capabilities = useCampaignCapabilities()
  const unavailable = capabilities?.placeExtractions.available === false

  const scrollTop = useScrollPageTop()
  const goToPage = useCallback(
    (page: number) => {
      setPage(page)
      scrollTop()
    },
    [scrollTop, setPage]
  )

  const closeResults = useCallback(() => openResults(null), [openResults])
  const showResults = useCallback((id: string) => openResults(id), [openResults])
  usePlaceExtractionsLive(showResults)

  return (
    <PageBody variant="wide">
      <CampaignsAreaNav />

      {unavailable ? (
        <Callout tone="info" role="status" icon={<Info />} title={t("campaigns.places.unavailable.title")}>
          {t("campaigns.places.unavailable.description")}
        </Callout>
      ) : null}

      <SegmentedControl<PlacesView>
        aria-label={t("campaigns.places.view.label")}
        value={filters.view}
        onChange={setView}
        options={[
          { value: "searches", label: t("campaigns.places.view.searches") },
          { value: "places", label: t("campaigns.places.view.places") },
        ]}
      />

      {filters.view === "searches" ? (
        <SearchesView
          filters={filters}
          unavailable={unavailable}
          onQuery={setQuery}
          onStatuses={setStatuses}
          onPage={goToPage}
          onPerPage={setPerPage}
          onClear={clear}
          onOpen={showResults}
        />
      ) : (
        <PlacesGrid
          filters={filters}
          unavailable={unavailable}
          onQuery={setQuery}
          onPage={goToPage}
          onPerPage={setPerPage}
          onClear={clear}
        />
      )}

      <ExtractionResultsPanel extractionId={filters.openResults} onClose={closeResults} />
    </PageBody>
  )
}

type ViewProps = {
  filters: ReturnType<typeof usePlacesQuery>["filters"]
  unavailable: boolean
  onQuery: (query: string) => void
  onPage: (page: number) => void
  onPerPage: (perPage: number) => void
  onClear: () => void
}

/** Vazio de verdade: com a chave, ensina onde a busca nasce; sem ela, não promete o que não há. */
function NothingFound({ unavailable, icon }: { unavailable: boolean; icon: React.ReactNode }) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <EmptyState
      icon={icon}
      title={t("campaigns.places.empty.title")}
      description={t(unavailable ? "campaigns.places.empty.unavailable" : "campaigns.places.empty.description")}
      action={
        unavailable
          ? undefined
          : { label: t("campaigns.list.create"), onClick: () => navigate("/campaigns/new") }
      }
    />
  )
}

function usePageThatVanished(
  meta: { page: number; totalPages: number } | undefined,
  validating: boolean,
  setPage: (page: number) => void
) {
  useEffect(() => {
    if (!meta || validating) return
    if (meta.page > 1 && meta.page > Math.max(meta.totalPages, 1)) setPage(Math.max(meta.totalPages, 1))
  }, [meta, setPage, validating])
}

function SearchesView({
  filters,
  unavailable,
  onQuery,
  onStatuses,
  onPage,
  onPerPage,
  onClear,
  onOpen,
}: ViewProps & { onStatuses: (statuses: string[]) => void; onOpen: (id: string) => void }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const preset = useMotionPreset()
  const { data, error, isLoading, isValidating, mutate } = usePlaceExtractionList(filters)
  const remove = usePlaceExtractionDelete()
  const onDelete = useCallback<(extraction: { id: string; searchQuery: string }) => void>(
    (extraction) => void remove(extraction),
    [remove]
  )

  const meta = data?.meta
  const total = meta?.total ?? 0
  const isFiltered = Boolean(filters.q || filters.statuses.length)
  usePageThatVanished(meta, isValidating, onPage)

  const statusOptions = useMemo(
    () =>
      PLACE_EXTRACTION_STATUSES.map((status) => ({
        value: status,
        label: t(`campaigns.places.status.${status}`),
      })),
    [t]
  )

  if (error && !data) return <ErrorState error={error} onRetry={() => void mutate()} />
  if (data && total === 0 && !isFiltered && filters.page === 1) {
    return <NothingFound unavailable={unavailable} icon={<MapPinned className="size-5" />} />
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <FilterBar
        search={{
          value: filters.q,
          onChange: onQuery,
          placeholder: t("campaigns.places.searches.search"),
          loading: isValidating && Boolean(filters.q),
          className: "md:w-72",
        }}
        activeCount={filters.statuses.length > 0 ? 1 : 0}
        onClear={onClear}
        resultLabel={
          total > 0
            ? t("campaigns.places.searches.count", { count: total, formatted: formatNumber(total, language) })
            : undefined
        }
        filters={
          <FacetedFilter
            title={t("campaigns.places.searches.status")}
            options={statusOptions}
            value={filters.statuses}
            onChange={onStatuses}
          />
        }
      />

      {isLoading && !data ? (
        <div className="rounded-xl bg-card px-4 ring-1 ring-foreground/10">
          <ListSkeleton rows={4} />
        </div>
      ) : total === 0 ? (
        <EmptyState
          title={t("campaigns.places.searches.noResults")}
          action={{ label: t("kit.filters.clear"), onClick: onClear }}
        />
      ) : (
        <ul
          className={cn(
            "divide-y overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 transition-opacity",
            isLoading && "opacity-60"
          )}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {(data?.extractions ?? []).map((extraction) => (
              <motion.li key={extraction.id} layout={!preset.reduced} {...preset.listItem}>
                <ExtractionRow extraction={extraction} onOpen={onOpen} onDelete={onDelete} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      {meta && total > 0 ? (
        <TablePagination
          page={meta.page}
          totalPages={meta.totalPages}
          total={meta.total}
          perPage={meta.perPage}
          perPageOptions={PLACES_PER_PAGE_OPTIONS}
          onPageChange={onPage}
          onPerPageChange={onPerPage}
        />
      ) : null}
    </div>
  )
}

function PlacesGrid({ filters, unavailable, onQuery, onPage, onPerPage, onClear }: ViewProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const { data, error, isLoading, isValidating, mutate } = usePlaceContacts(filters)

  const meta = data?.meta
  const total = meta?.total ?? 0
  usePageThatVanished(meta, isValidating, onPage)

  if (error && !data) return <ErrorState error={error} onRetry={() => void mutate()} />
  if (data && total === 0 && !filters.q && filters.page === 1) {
    return <NothingFound unavailable={unavailable} icon={<Store className="size-5" />} />
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <FilterBar
        search={{
          value: filters.q,
          onChange: onQuery,
          placeholder: t("campaigns.places.grid.search"),
          loading: isValidating && Boolean(filters.q),
          className: "md:w-96",
        }}
        onClear={onClear}
        resultLabel={
          total > 0
            ? t("campaigns.places.grid.count", { count: total, formatted: formatNumber(total, language) })
            : undefined
        }
      />

      {isLoading && !data ? (
        <CardGridSkeleton cards={6} />
      ) : total === 0 ? (
        <EmptyState
          title={t("campaigns.places.grid.noResults")}
          action={{ label: t("kit.filters.clear"), onClick: onClear }}
        />
      ) : (
        <div
          className={cn(
            "grid grid-cols-1 items-start gap-3 transition-opacity sm:grid-cols-2 xl:grid-cols-3",
            isLoading && "opacity-60"
          )}
        >
          {(data?.contacts ?? []).map((place, index) => (
            <PlaceCard
              key={place.placeId ? `${place.placeId}-${place.extractionId}` : `row-${index}`}
              place={place}
            />
          ))}
        </div>
      )}

      {meta && total > 0 ? (
        <TablePagination
          page={meta.page}
          totalPages={meta.totalPages}
          total={meta.total}
          perPage={meta.perPage}
          perPageOptions={PLACES_PER_PAGE_OPTIONS}
          onPageChange={onPage}
          onPerPageChange={onPerPage}
        />
      ) : null}
    </div>
  )
}
