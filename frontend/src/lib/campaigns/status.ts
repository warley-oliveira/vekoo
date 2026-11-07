import type { StatusTone } from "@/components/shared"
import type { CampaignStatus, PlaceExtractionStatus, RecipientStatus } from "./types"

export const CAMPAIGN_TONES: Record<CampaignStatus, StatusTone> = {
  draft: "neutral",
  scheduled: "info",
  running: "accent",
  paused: "warning",
  completed: "success",
  // Cancelar foi escolha de alguém: não é alarme.
  cancelled: "neutral",
}

export const RECIPIENT_TONES: Record<RecipientStatus, StatusTone> = {
  pending: "neutral",
  sending: "accent",
  sent: "info",
  delivered: "info",
  read: "success",
  failed: "danger",
  skipped: "neutral",
}

export const EXTRACTION_TONES: Record<PlaceExtractionStatus, StatusTone> = {
  pending: "neutral",
  running: "accent",
  completed: "success",
  failed: "danger",
}

/** O que dá para fazer em cada estado. As regras são as da API: ela recusa o resto. */
export const canPause = (status: CampaignStatus) => status === "running"
export const canResume = (status: CampaignStatus) => status === "paused"
export const canCancel = (status: CampaignStatus) =>
  status === "scheduled" || status === "running" || status === "paused"
export const canEdit = (status: CampaignStatus) => status === "draft"
export const canDelete = (status: CampaignStatus) => status === "draft"

/** Ainda não saiu nada, e nem vai sair sem alguém mandar: não há progresso para mostrar. */
export const hasNotStarted = (status: CampaignStatus) =>
  status === "draft" || status === "scheduled"

/** Rascunho se continua editando: não há o que acompanhar. */
export function campaignPath(id: string, status: CampaignStatus): string {
  return status === "draft" ? `/campaigns/${id}/edit` : `/campaigns/${id}`
}

export function duplicatePath(id: string): string {
  return `/campaigns/new?duplicate=${encodeURIComponent(id)}`
}

/** Abre o assistente já com os estabelecimentos de uma busca. */
export function campaignFromExtractionPath(id: string): string {
  return `/campaigns/new?placeExtraction=${encodeURIComponent(id)}`
}
