import { useCallback, useMemo } from "react"

import { useLocalStorage } from "@/hooks/use-local-storage"
import { CAMPAIGN_STATUSES, type CampaignStatus } from "@/lib/campaigns/types"
import { useUrlQuery } from "./use-url-query"

export const CAMPAIGN_SORTS = ["recent", "oldest", "name", "largest", "failures"] as const
export type CampaignSort = (typeof CAMPAIGN_SORTS)[number]

export const CAMPAIGN_PER_PAGE_OPTIONS = [10, 25, 50, 100]

const DEFAULT_SORT: CampaignSort = "recent"
const DEFAULT_PER_PAGE = 25
const PER_PAGE_KEY = "vekoo.campaigns.perPage"

export type CampaignFilters = {
  q: string
  statuses: CampaignStatus[]
  connectorIds: string[]
  sort: CampaignSort
  page: number
  perPage: number
}

function isSort(value: string | null): value is CampaignSort {
  return CAMPAIGN_SORTS.includes(value as CampaignSort)
}

function isStatus(value: string): value is CampaignStatus {
  return CAMPAIGN_STATUSES.includes(value as CampaignStatus)
}

export function campaignListPath(filters: CampaignFilters): string {
  const query = new URLSearchParams()
  if (filters.q) query.set("q", filters.q)
  if (filters.statuses.length > 0) query.set("status", filters.statuses.join(","))
  if (filters.connectorIds.length > 0) query.set("connectorId", filters.connectorIds.join(","))
  if (filters.sort !== DEFAULT_SORT) query.set("sort", filters.sort)
  query.set("page", String(filters.page))
  query.set("perPage", String(filters.perPage))
  return `/campaigns?${query}`
}

/** Os filtros da lista de campanhas. Só o tamanho da página fica no navegador. */
export function useCampaignFilters() {
  const { search, change, setPage } = useUrlQuery()
  const [storedPerPage, setStoredPerPage] = useLocalStorage<number>(PER_PAGE_KEY, DEFAULT_PER_PAGE)

  const filters = useMemo<CampaignFilters>(() => {
    const current = new URLSearchParams(search)
    const sort = current.get("sort")
    return {
      q: current.get("q") ?? "",
      statuses: current.getAll("status").filter(isStatus),
      connectorIds: current.getAll("channel"),
      sort: isSort(sort) ? sort : DEFAULT_SORT,
      page: Math.max(1, Number(current.get("page")) || 1),
      perPage: CAMPAIGN_PER_PAGE_OPTIONS.includes(storedPerPage) ? storedPerPage : DEFAULT_PER_PAGE,
    }
  }, [search, storedPerPage])

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

  const setConnectorIds = useCallback(
    (ids: string[]) =>
      change((query) => {
        query.delete("channel")
        ids.forEach((id) => query.append("channel", id))
      }),
    [change]
  )

  const setSort = useCallback(
    (sort: CampaignSort) =>
      change((query) => {
        if (sort === DEFAULT_SORT) query.delete("sort")
        else query.set("sort", sort)
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
        query.delete("channel")
      }),
    [change]
  )

  return {
    filters,
    listPath: campaignListPath(filters),
    isFiltered: Boolean(filters.q || filters.statuses.length || filters.connectorIds.length),
    activeCount: (filters.statuses.length ? 1 : 0) + (filters.connectorIds.length ? 1 : 0),
    setQuery,
    setStatuses,
    setConnectorIds,
    setSort,
    setPage,
    setPerPage,
    clear,
  }
}
