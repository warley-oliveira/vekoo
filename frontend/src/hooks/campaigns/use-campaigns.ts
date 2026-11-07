import { useMemo } from "react"
import { mutate, type Arguments } from "swr"

import { useApi } from "@/hooks/use-api"
import type {
  Campaign,
  CampaignsResponse,
  CampaignSummaryResponse,
  CapabilitiesResponse,
  ConnectorsResponse,
  FlowsResponse,
  TagsResponse,
} from "@/lib/campaigns/types"

export const SUMMARY_KEY = "/campaigns/summary"

/** Tudo que é uma lista de campanhas: a da tela, em qualquer filtro, e a dos avisos. */
export const isCampaignListKey = (key: Arguments) =>
  typeof key === "string" && key.startsWith("/campaigns?")

export function reloadCampaignLists() {
  return mutate(isCampaignListKey)
}

export function reloadCampaignSummary() {
  return mutate(SUMMARY_KEY)
}

/** Troca as linhas de uma lista já carregada, sem refazer a consulta. Linha igual mantém o objeto. */
export function patchCampaignRows(
  current: CampaignsResponse | undefined,
  patch: (campaign: Campaign) => Campaign
): CampaignsResponse | undefined {
  if (!current) return current

  let changed = false
  const campaigns = current.campaigns.map((campaign) => {
    const next = patch(campaign)
    if (next !== campaign) changed = true
    return next
  })
  return changed ? { ...current, campaigns } : current
}

export function useCampaignList(path: string) {
  return useApi<CampaignsResponse>(path, { keepPreviousData: true })
}

export function useCampaignSummary() {
  return useApi<CampaignSummaryResponse>(SUMMARY_KEY)
}

/** Pausadas: é onde estão as que a plataforma parou. O filtro fino é do chamador. */
const PAUSED_KEY = "/campaigns?status=paused&perPage=100"

export function usePlatformPausedCampaigns() {
  const { data } = useApi<CampaignsResponse>(PAUSED_KEY)
  return useMemo(
    () => (data?.campaigns ?? []).filter((campaign) => campaign.pauseReason !== null),
    [data]
  )
}

/** Os canais que disparam, em todos os estados: o filtro e as linhas precisam do nome. */
export function useCampaignConnectors() {
  const { data, isLoading, error } = useApi<ConnectorsResponse>("/campaigns/available-connectors", {
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
  })

  const byId = useMemo(
    () => new Map((data?.connectors ?? []).map((connector) => [connector.id, connector])),
    [data]
  )

  return { connectors: data?.connectors, byId, isLoading, error }
}

export function useCampaignTags(enabled: boolean) {
  const { data } = useApi<TagsResponse>(enabled ? "/campaigns/available-tags" : null, {
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
  })
  return data?.tags
}

export function useCampaignFlows(enabled: boolean) {
  const { data } = useApi<FlowsResponse>(enabled ? "/campaigns/available-flows" : null, {
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
  })
  return data?.flows
}

/** O que depende de chave no servidor. Sem resposta, a tela não afirma nada. */
export function useCampaignCapabilities() {
  const { data } = useApi<CapabilitiesResponse>("/campaigns/capabilities", {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  })
  return data?.capabilities
}
