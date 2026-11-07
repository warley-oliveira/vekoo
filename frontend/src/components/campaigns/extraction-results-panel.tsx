import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router"
import { Megaphone, Store, Trash2 } from "lucide-react"

import {
  DetailSkeleton,
  EmptyState,
  ErrorState,
  SearchInput,
  SidePanel,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useOpenCount, useRetained } from "@/hooks/use-panel-session"
import {
  usePlaceExtraction,
  usePlaceExtractionDelete,
  usePlaceResults,
} from "@/hooks/campaigns/use-place-extractions"
import { campaignFromExtractionPath } from "@/lib/campaigns/status"
import type { Place } from "@/lib/campaigns/types"
import { matchesSearch } from "@/lib/search-text"
import { PlaceCard } from "./place-card"

/** Com poucos resultados, a busca só atrapalha. */
const SEARCH_FROM = 6

type ExtractionResultsPanelProps = {
  /** A busca aberta, vinda da URL. `null` fecha. */
  extractionId: string | null
  onClose: () => void
}

function matches(place: Place, query: string): boolean {
  return [place.title, place.address, place.phone, place.categoryName].some((text) =>
    matchesSearch(text ?? "", query)
  )
}

/** Os resultados de uma busca, sem sair da lista. O endereço diz qual está aberta. */
export function ExtractionResultsPanel({ extractionId, onClose }: ExtractionResultsPanelProps) {
  const { t } = useTranslation()
  const open = extractionId !== null
  // Durante a animação de saída, o conteúdo continua na tela.
  const id = useRetained(extractionId)
  const openCount = useOpenCount(open)

  const { data: detail } = usePlaceExtraction(extractionId)
  const { data, error, isLoading, mutate } = usePlaceResults(extractionId)
  const remove = usePlaceExtractionDelete()

  const extraction = detail?.extraction
  const results = data?.results
  const title = extraction?.searchQuery ?? t("campaigns.places.results.title")
  const description =
    extraction && data
      ? t(extraction.location ? "campaigns.places.results.descriptionLocated" : "campaigns.places.results.description", {
          count: data.resultsCount,
          location: extraction.location ?? "",
        })
      : undefined

  return (
    <SidePanel
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      size="xl"
      title={title}
      description={description}
      footer={
        id ? (
          <>
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive sm:mr-auto pointer-coarse:h-10"
              disabled={!extraction}
              onClick={() => {
                if (!extraction) return
                void remove(extraction).then((removed) => {
                  if (removed) onClose()
                })
              }}
            >
              <Trash2 />
              {t("campaigns.places.delete.action")}
            </Button>
            <Button
              nativeButton={false}
              className="pointer-coarse:h-10"
              disabled={(results?.length ?? 0) === 0}
              render={<Link to={campaignFromExtractionPath(id)} />}
            >
              <Megaphone />
              {t("campaigns.places.useInCampaign")}
            </Button>
          </>
        ) : undefined
      }
    >
      <ResultsBody
        key={openCount}
        results={results}
        loading={isLoading && !data}
        error={error}
        onRetry={() => void mutate()}
      />
    </SidePanel>
  )
}

function ResultsBody({
  results,
  loading,
  error,
  onRetry,
}: {
  results: Place[] | undefined
  loading: boolean
  error: unknown
  onRetry: () => void
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState("")

  const visible = useMemo(
    () => (query ? (results ?? []).filter((place) => matches(place, query)) : (results ?? [])),
    [query, results]
  )

  if (loading) return <DetailSkeleton rows={6} />
  if (error && !results) return <ErrorState error={error} onRetry={onRetry} />
  if (!results || results.length === 0) {
    return (
      <EmptyState
        icon={<Store className="size-5" />}
        title={t("campaigns.places.results.empty.title")}
        description={t("campaigns.places.results.empty.description")}
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {results.length >= SEARCH_FROM ? (
        <SearchInput
          value={query}
          onChange={setQuery}
          debounce={0}
          shortcut={false}
          placeholder={t("campaigns.places.results.search")}
        />
      ) : null}
      {visible.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {visible.map((place, index) => (
            <PlaceCard key={place.placeId || `${place.title}-${index}`} place={place} />
          ))}
        </div>
      ) : (
        <EmptyState
          title={t("campaigns.places.results.noMatch.title")}
          action={{ label: t("kit.filters.clear"), onClick: () => setQuery("") }}
        />
      )}
    </div>
  )
}
