import { useMemo } from "react"

import { useApi } from "@/hooks/use-api"
import { ApiError } from "@/lib/api"
import { hasPhone } from "@/lib/campaigns-wizard/places"
import type { Connector, WhatsappCloudConnector, WhatsappTemplate, WhatsappWebConnector } from "@/lib/connectors/types"
import type {
  Capabilities,
  CampaignFlow,
  CampaignTag,
  LinkedPlaces,
  PlaceExtraction,
  PlaceResult,
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

export type LinkedExtractionState =
  | { state: "loading" }
  | { state: "notFound" }
  | { state: "failed"; reason: string | null }
  | { state: "empty" }
  | { state: "error"; retry: () => void }
  | { state: "ready"; search: LinkedPlaces }

// O cache pode estar velho (a busca terminou, ou foi apagada): vale a resposta de agora.
const FRESH = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  revalidateOnMount: true,
  dedupingInterval: 0,
  keepPreviousData: false,
}

/**
 * A busca que veio em `?placeExtraction=`. Lê só o que está gravado, então vale mesmo sem a chave do Apify.
 * De outra organização e inexistente respondem igual, 404: para quem está na tela, nenhuma das duas existe.
 */
export function useLinkedExtraction(id: string): LinkedExtractionState {
  const path = `/place-extractions/${encodeURIComponent(id)}`
  const info = useApi<{ extraction: PlaceExtraction }>(path, FRESH)
  const extraction = info.data?.extraction
  const list = useApi<{ results: PlaceResult[] }>(
    extraction?.status === "completed" && extraction.resultsCount > 0 ? `${path}/results` : null,
    FRESH
  )

  if (info.isValidating || list.isValidating) return { state: "loading" }

  const failure = info.error ?? list.error
  if (failure instanceof ApiError && failure.status === 404) return { state: "notFound" }
  if (failure) {
    return {
      state: "error",
      retry: () => void (info.error ? info.mutate() : list.mutate()),
    }
  }

  if (!extraction) return { state: "loading" }
  if (extraction.status === "failed") return { state: "failed", reason: extraction.errorMessage }
  // Ainda procurando: o painel acompanha, e marca todo mundo quando terminar.
  if (extraction.status !== "completed") return { state: "ready", search: { extraction, results: [] } }
  if (extraction.resultsCount === 0) return { state: "empty" }
  if (!list.data) return { state: "loading" }

  return list.data.results.some(hasPhone)
    ? { state: "ready", search: { extraction, results: list.data.results } }
    : { state: "empty" }
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
