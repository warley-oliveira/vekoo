import { useMemo } from "react"

import { useApi } from "@/hooks/use-api"
import type { Connector, WhatsappCloudConnector, WhatsappTemplate, WhatsappWebConnector } from "@/lib/connectors/types"
import type {
  Capabilities,
  CampaignFlow,
  CampaignTag,
  RecipientSummary,
} from "@/lib/campaigns-wizard/types"

// O que o assistente oferece. Nada aqui muda enquanto a pessoa monta a campanha: sem revalidar ao focar,
// inclusive porque ler os modelos sincroniza com a Meta.

const STABLE = { revalidateOnFocus: false, dedupingInterval: 30_000 }
const NO_CONNECTORS: Connector[] = []

export function useCampaignCapabilities() {
  const { data, error, isLoading, mutate } = useApi<{ capabilities: Capabilities }>(
    "/campaigns/capabilities",
    STABLE
  )
  return { capabilities: data?.capabilities ?? null, error, isLoading, reload: () => mutate() }
}

export type CampaignChannels = {
  /** Só `whatsapp_web` no modo texto: fora da janela de 24 horas a WABA só aceita modelo. */
  web: WhatsappWebConnector[]
  waba: WhatsappCloudConnector[]
  all: Connector[]
  isLoading: boolean
  error: unknown
  reload: () => void
}

export function useCampaignChannels(): CampaignChannels {
  const { data, error, isLoading, mutate } = useApi<{ connectors: Connector[] }>(
    "/campaigns/available-connectors",
    STABLE
  )
  const all = data?.connectors ?? NO_CONNECTORS

  return useMemo(
    () => ({
      web: all.filter((item): item is WhatsappWebConnector => item.type === "whatsapp_web"),
      waba: all.filter((item): item is WhatsappCloudConnector => item.type === "whatsapp_cloud"),
      all,
      isLoading,
      error,
      reload: () => void mutate(),
    }),
    [all, error, isLoading, mutate]
  )
}

export function useCampaignTags() {
  const { data, error, isLoading, mutate } = useApi<{ tags: CampaignTag[] }>(
    "/campaigns/available-tags",
    STABLE
  )
  return { tags: data?.tags, error, isLoading, reload: () => mutate() }
}

export function useCampaignFlows() {
  const { data, error, isLoading, mutate } = useApi<{ flows: CampaignFlow[] }>(
    "/campaigns/available-flows",
    STABLE
  )
  return { flows: data?.flows, error, isLoading, reload: () => mutate() }
}

export function useConnectorTemplates(connectorId: string | null) {
  const { data, error, isLoading, mutate } = useApi<{ templates: WhatsappTemplate[] }>(
    connectorId ? `/connectors/${connectorId}/templates` : null,
    { revalidateOnFocus: false, keepPreviousData: false }
  )
  return { templates: data?.templates, error, isLoading, reload: () => mutate() }
}

export const EMPTY_SUMMARY: RecipientSummary = {
  total: 0,
  fromContacts: 0,
  imported: 0,
  variables: [],
  sample: null,
}

export function recipientSummaryKey(campaignId: string) {
  return `/campaigns/${campaignId}/recipient-summary`
}

export function useRecipientSummary(campaignId: string | null) {
  const { data, error, isLoading, mutate } = useApi<{ summary: RecipientSummary }>(
    campaignId ? recipientSummaryKey(campaignId) : null,
    { revalidateOnFocus: false, keepPreviousData: true }
  )
  return {
    summary: data?.summary ?? EMPTY_SUMMARY,
    error,
    isLoading: isLoading && !data,
    reload: () => mutate(),
  }
}
