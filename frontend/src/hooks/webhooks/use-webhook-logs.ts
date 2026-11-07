import { useEffect, useRef } from "react"

import { useApi } from "@/hooks/use-api"
import type { PaginationMeta } from "@/lib/api"
import type { WebhookLog, WebhookLogStats, WebhookLogStatus } from "@/lib/webhooks/types"

export type LogFilters = {
  webhookId: string | null
  status: WebhookLogStatus | null
  from: Date | null
  to: Date | null
  page: number
  perPage: number
}

const NO_LOGS: WebhookLog[] = []

function logsPath(filters: LogFilters) {
  const params = new URLSearchParams({ page: String(filters.page), perPage: String(filters.perPage) })
  if (filters.webhookId) params.set("webhookId", filters.webhookId)
  if (filters.status) params.set("status", filters.status)
  if (filters.from) params.set("startDate", filters.from.toISOString())
  if (filters.to) params.set("endDate", filters.to.toISOString())
  return `/webhook-logs?${params}`
}

/** Na primeira página, confere de tempos em tempos: é o que faz a requisição que acabou de chegar aparecer sozinha. */
export function useWebhookLogs(filters: LogFilters) {
  const path = logsPath(filters)
  const { data, error, isLoading, isValidating, mutate } = useApi<{ logs: WebhookLog[]; meta: PaginationMeta }>(path, {
    keepPreviousData: true,
    refreshInterval: filters.page === 1 ? 10_000 : 0,
  })

  // A conferência de fundo não mexe na tela; trocar de filtro ou de página, sim.
  const settled = useRef(path)
  useEffect(() => {
    if (!isValidating) settled.current = path
  }, [isValidating, path])
  const changing = isValidating && settled.current !== path

  return { logs: data?.logs ?? NO_LOGS, meta: data?.meta, error, isLoading, changing, reload: () => mutate() }
}

/** O detalhe vem da lista quando dá; por aqui só quem abriu o endereço de um registro direto. */
export function useWebhookLog(id: string | null, known: WebhookLog | null) {
  const { data, error, isLoading, mutate } = useApi<{ log: WebhookLog }>(id && !known ? `/webhook-logs/${id}` : null, {
    revalidateOnFocus: false,
  })
  return { log: known ?? data?.log ?? null, error, isLoading, reload: () => mutate() }
}

export function useWebhookLogStats(webhookId: string | null, days: number) {
  const params = new URLSearchParams({ days: String(days) })
  if (webhookId) params.set("webhookId", webhookId)
  const { data, error, isLoading, mutate } = useApi<{ stats: WebhookLogStats }>(`/webhook-logs/stats?${params}`, {
    keepPreviousData: true,
    refreshInterval: 30_000,
  })
  return { stats: data?.stats ?? null, error, isLoading, reload: () => mutate() }
}
