import { useCallback, useMemo } from "react"

import { useApi } from "@/hooks/use-api"
import { useLocalStorage } from "@/hooks/use-local-storage"
import type { RecipientsResponse } from "@/lib/campaigns/types"
import { useUrlQuery } from "./use-url-query"

export const RECIPIENT_PER_PAGE_OPTIONS = [25, 50, 100]

const DEFAULT_PER_PAGE = 25
const PER_PAGE_KEY = "vekoo.campaigns.recipients.perPage"

/** Quem recebeu, com filtro, busca e página na URL. A fusão ao vivo é de `useCampaignLive`. */
export function useCampaignRecipients(campaignId: string) {
  const { search, change, setPage } = useUrlQuery()
  const [storedPerPage, setStoredPerPage] = useLocalStorage<number>(PER_PAGE_KEY, DEFAULT_PER_PAGE)

  const filters = useMemo(() => {
    const current = new URLSearchParams(search)
    return {
      q: current.get("q") ?? "",
      statuses: current.getAll("status"),
      page: Math.max(1, Number(current.get("page")) || 1),
      perPage: RECIPIENT_PER_PAGE_OPTIONS.includes(storedPerPage) ? storedPerPage : DEFAULT_PER_PAGE,
    }
  }, [search, storedPerPage])

  const query = new URLSearchParams()
  if (filters.q) query.set("q", filters.q)
  if (filters.statuses.length > 0) query.set("status", filters.statuses.join(","))
  query.set("page", String(filters.page))
  query.set("perPage", String(filters.perPage))

  const response = useApi<RecipientsResponse>(`/campaigns/${campaignId}/recipients?${query}`, {
    keepPreviousData: true,
  })

  const setQuery = useCallback(
    (q: string) =>
      change((params) => {
        if (q) params.set("q", q)
        else params.delete("q")
      }),
    [change]
  )

  const setStatuses = useCallback(
    (statuses: string[]) =>
      change((params) => {
        params.delete("status")
        statuses.forEach((status) => params.append("status", status))
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
      change((params) => {
        params.delete("q")
        params.delete("status")
      }),
    [change]
  )

  return { ...response, filters, setQuery, setStatuses, setPage, setPerPage, clear }
}
