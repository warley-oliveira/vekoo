import { useCallback, useMemo } from "react"
import { mutate as globalMutate } from "swr"

import { useApi } from "@/hooks/use-api"
import { apiDelete, apiPatch, apiPost, type PaginationMeta } from "@/lib/api"
import { sanitizeLayout } from "@/lib/custom-dashboards/layout"
import { normalizeQuery } from "@/lib/custom-dashboards/query"
import type {
  CustomDashboard,
  CustomDashboardSummary,
  DashboardWidget,
  DataSourceMeta,
  FilterOptions,
} from "@/lib/custom-dashboards/types"

const BASE = "/custom-dashboards"
// Cabe tudo: uma organização tem até 100 dashboards.
export const DASHBOARD_LIST_KEY = `${BASE}?perPage=100`

export const dashboardKey = (id: string) => `${BASE}/${id}`

type ListResponse = { customDashboards: CustomDashboardSummary[]; meta: PaginationMeta }
type DetailResponse = { customDashboard: CustomDashboard }

/** O que veio da API, pronto para a tela: sem mapa faltando, e com a consulta no formato atual. */
export function normalizeWidget(widget: DashboardWidget): DashboardWidget {
  return {
    ...widget,
    query: normalizeQuery(widget.query),
    visualConfig: widget.visualConfig ?? {},
    layout: sanitizeLayout(widget.layout, widget.widgetType),
  }
}

export function normalizeDashboard(dashboard: CustomDashboard): CustomDashboard {
  return { ...dashboard, widgets: dashboard.widgets.map(normalizeWidget) }
}

export function useCustomDashboardList(enabled: boolean) {
  const { data, error, isLoading, mutate } = useApi<ListResponse>(enabled ? DASHBOARD_LIST_KEY : null, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  })

  return { dashboards: data?.customDashboards, error, isLoading, reload: mutate }
}

export function useCustomDashboard(id: string) {
  const { data, error, isLoading, isValidating, mutate } = useApi<DetailResponse>(dashboardKey(id), {
    revalidateOnFocus: false,
  })

  const dashboard = useMemo(() => (data ? normalizeDashboard(data.customDashboard) : undefined), [data])

  return { dashboard, error, isLoading, isValidating, reload: mutate }
}

/** As fontes que esta pessoa alcança. Muda pouco: é a mesma lista para todos os cards da tela. */
export function useDataSources() {
  const { data, error, isLoading, mutate } = useApi<{ dataSources: DataSourceMeta[] }>(`${BASE}/data-sources`, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  })

  return { dataSources: data?.dataSources, error, isLoading, reload: mutate }
}

export function useFilterOptions(sourceKey: string | null | undefined) {
  const { data, isLoading } = useApi<{ filterOptions: FilterOptions }>(
    sourceKey ? `${BASE}/filter-options?sourceKey=${encodeURIComponent(sourceKey)}` : null,
    { revalidateOnFocus: false, dedupingInterval: 120_000 }
  )

  return { filterOptions: data?.filterOptions, isLoading }
}

export type DashboardAttributes = {
  name?: string
  description?: string | null
  icon?: string | null
  widgets?: DashboardWidget[]
}

function isDashboardKey(key: unknown) {
  return typeof key === "string" && key.startsWith(BASE) && !key.includes("query") && !key.includes("data-sources") && !key.includes("filter-options")
}

/** Toda consulta de card em cache: atualizar o painel é pedir de novo só o que está na tela. */
export function isWidgetDataKey(key: unknown) {
  return typeof key === "string" && (key.startsWith(`${BASE}/query`) || key.startsWith(`${BASE}/compound-query`))
}

export function refreshWidgetData() {
  return globalMutate(isWidgetDataKey)
}

export async function storeDashboard(dashboard: CustomDashboard) {
  await globalMutate(dashboardKey(dashboard.id), { customDashboard: dashboard }, { revalidate: false })
  await globalMutate(DASHBOARD_LIST_KEY)
}

export function useDashboardMutations() {
  const create = useCallback(async (attributes: DashboardAttributes) => {
    const { customDashboard } = await apiPost<DetailResponse>(BASE, { customDashboard: attributes })
    await storeDashboard(customDashboard)
    return customDashboard
  }, [])

  const update = useCallback(async (id: string, attributes: DashboardAttributes) => {
    const { customDashboard } = await apiPatch<DetailResponse>(`${BASE}/${id}`, { customDashboard: attributes })
    await storeDashboard(customDashboard)
    return customDashboard
  }, [])

  const remove = useCallback(async (id: string) => {
    await apiDelete(`${BASE}/${id}`)
    await globalMutate(DASHBOARD_LIST_KEY)
    await globalMutate(dashboardKey(id), undefined, { revalidate: false })
  }, [])

  const duplicate = useCallback(async (id: string) => {
    const { customDashboard } = await apiPost<DetailResponse>(`${BASE}/${id}/duplicate`)
    await storeDashboard(customDashboard)
    return customDashboard
  }, [])

  const toggleFavorite = useCallback(async (id: string) => {
    const result = await apiPatch<{ isFavorite: boolean }>(`${BASE}/${id}/toggle-favorite`)
    await Promise.all([globalMutate(isDashboardKey)])
    return result.isFavorite
  }, [])

  return useMemo(() => ({ create, update, remove, duplicate, toggleFavorite }), [create, duplicate, remove, toggleFavorite, update])
}
