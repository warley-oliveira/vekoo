import { useCallback, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { mutate, type Arguments } from "swr"
import { toast } from "sonner"

import { useConfirm } from "@/components/shared"
import { useApi } from "@/hooks/use-api"
import { useChannel } from "@/hooks/use-channel"
import { useLocalStorage } from "@/hooks/use-local-storage"
import { apiDelete } from "@/lib/api"
import {
  PLACE_EXTRACTION_STATUSES,
  type PlaceContactsResponse,
  type PlaceExtraction,
  type PlaceExtractionChannelEvent,
  type PlaceExtractionResultsResponse,
  type PlaceExtractionsResponse,
  type PlaceExtractionStatus,
} from "@/lib/campaigns/types"
import { useOnReconnect } from "./use-on-reconnect"
import { useUrlQuery } from "./use-url-query"

export const PLACES_PER_PAGE_OPTIONS = [12, 24, 48, 96]

const DEFAULT_PER_PAGE = 24
const PER_PAGE_KEY = "vekoo.campaigns.places.perPage"

const isExtractionListKey = (key: Arguments) =>
  typeof key === "string" && key.startsWith("/place-extractions?")
const isContactsKey = (key: Arguments) =>
  typeof key === "string" && key.startsWith("/place-extractions/contacts")

export type PlacesView = "searches" | "places"

function isStatus(value: string): value is PlaceExtractionStatus {
  return PLACE_EXTRACTION_STATUSES.includes(value as PlaceExtractionStatus)
}

/** A tela de estabelecimentos: qual visão, filtros, página e o painel aberto, tudo na URL. */
export function usePlacesQuery() {
  const { search, change, setPage } = useUrlQuery()
  const [storedPerPage, setStoredPerPage] = useLocalStorage<number>(PER_PAGE_KEY, DEFAULT_PER_PAGE)

  const filters = useMemo(() => {
    const current = new URLSearchParams(search)
    return {
      view: (current.get("view") === "places" ? "places" : "searches") as PlacesView,
      q: current.get("q") ?? "",
      statuses: current.getAll("status").filter(isStatus),
      page: Math.max(1, Number(current.get("page")) || 1),
      perPage: PLACES_PER_PAGE_OPTIONS.includes(storedPerPage) ? storedPerPage : DEFAULT_PER_PAGE,
      openResults: current.get("results"),
    }
  }, [search, storedPerPage])

  const setView = useCallback(
    (view: PlacesView) =>
      change((query) => {
        query.delete("q")
        query.delete("status")
        if (view === "places") query.set("view", view)
        else query.delete("view")
      }),
    [change]
  )

  const setQuery = useCallback(
    (q: string) =>
      change((query) => {
        if (q) query.set("q", q)
        else query.delete("q")
      }),
    [change]
  )

  const setStatuses = useCallback(
    (statuses: string[]) =>
      change((query) => {
        query.delete("status")
        statuses.filter(isStatus).forEach((status) => query.append("status", status))
      }),
    [change]
  )

  const setPerPage = useCallback(
    (perPage: number) => {
      setStoredPerPage(perPage)
      change(() => undefined)
    },
    [change, setStoredPerPage]
  )

  const clear = useCallback(
    () =>
      change((query) => {
        query.delete("q")
        query.delete("status")
      }),
    [change]
  )

  const openResults = useCallback(
    (id: string | null) =>
      change(
        (query) => {
          if (id) query.set("results", id)
          else query.delete("results")
        },
        { keepPage: true }
      ),
    [change]
  )

  return { filters, setView, setQuery, setStatuses, setPage, setPerPage, clear, openResults }
}

export function usePlaceExtractionList(filters: {
  q: string
  statuses: string[]
  page: number
  perPage: number
}) {
  const query = new URLSearchParams()
  if (filters.q) query.set("search", filters.q)
  if (filters.statuses.length > 0) query.set("status", filters.statuses.join(","))
  query.set("page", String(filters.page))
  query.set("perPage", String(filters.perPage))

  return useApi<PlaceExtractionsResponse>(`/place-extractions?${query}`, { keepPreviousData: true })
}

export function usePlaceContacts(filters: { q: string; page: number; perPage: number }) {
  const query = new URLSearchParams()
  if (filters.q) query.set("search", filters.q)
  query.set("page", String(filters.page))
  query.set("perPage", String(filters.perPage))

  return useApi<PlaceContactsResponse>(`/place-extractions/contacts?${query}`, { keepPreviousData: true })
}

export function usePlaceResults(id: string | null) {
  return useApi<PlaceExtractionResultsResponse>(id ? `/place-extractions/${id}/results` : null, {
    keepPreviousData: false,
  })
}

/** Uma busca só, para o painel aberto por um link: ela pode não estar na página à vista. */
export function usePlaceExtraction(id: string | null) {
  return useApi<{ extraction: PlaceExtraction }>(id ? `/place-extractions/${id}` : null, {
    keepPreviousData: false,
  })
}

/**
 * As buscas ao vivo, por `PlaceExtractionChannel`. Uma busca muda poucas vezes na vida, então cada
 * evento entra direto, sem lote. Os resultados não vêm no evento: quem quer ler busca a lista deles.
 */
export function usePlaceExtractionsLive(onOpenResults: (id: string) => void) {
  const { t } = useTranslation()

  const { connected } = useChannel<PlaceExtractionChannelEvent>(
    "PlaceExtractionChannel",
    undefined,
    ({ action, data }) => {
      void mutate<PlaceExtractionsResponse>(
        isExtractionListKey,
        (current) =>
          current && {
            ...current,
            extractions: current.extractions.map((extraction) =>
              extraction.id === data.id ? { ...extraction, ...data } : extraction
            ),
          },
        { revalidate: false }
      )
      void mutate(`/place-extractions/${data.id}`)

      if (data.status === "failed") {
        toast.error(t("campaigns.places.feedback.failed", { query: data.searchQuery }), {
          description: data.errorMessage ?? undefined,
        })
      } else if (action === "extraction_completed") {
        void mutate(isContactsKey)
        void mutate(`/place-extractions/${data.id}/results`)
        toast.success(
          t("campaigns.places.feedback.completed", {
            count: data.resultsCount,
            query: data.searchQuery,
          }),
          {
            action: {
              label: t("campaigns.places.seeResults"),
              onClick: () => onOpenResults(data.id),
            },
          }
        )
      }
    }
  )

  useOnReconnect(connected, () => {
    void mutate(isExtractionListKey)
    void mutate(isContactsKey)
  })
}

/** Excluir leva os resultados juntos, e quem usou numa campanha continua com os contatos dela. */
export function usePlaceExtractionDelete() {
  const { t } = useTranslation()
  const confirm = useConfirm()

  return useCallback(
    async (extraction: Pick<PlaceExtraction, "id" | "searchQuery">) => {
      const confirmed = await confirm({
        title: t("campaigns.places.delete.title", { query: extraction.searchQuery }),
        description: t("campaigns.places.delete.description"),
        confirmLabel: t("campaigns.places.delete.confirm"),
        cancelLabel: t("campaigns.confirm.keep"),
        destructive: true,
        onConfirm: async () => {
          await apiDelete(`/place-extractions/${extraction.id}`)
          await Promise.all([mutate(isExtractionListKey), mutate(isContactsKey)])
        },
      })
      if (confirmed) toast.success(t("campaigns.places.delete.done"))
      return confirmed
    },
    [confirm, t]
  )
}
