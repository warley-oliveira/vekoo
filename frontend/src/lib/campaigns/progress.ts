import type { Campaign, CampaignStats } from "./types"

/** As cores da barra e da legenda dela. Os tokens são os de `viz-tokens.css`, que a barra carrega. */
export const DELIVERY_COLORS = {
  sent: "var(--viz-step-1)",
  delivered: "var(--viz-step-3)",
  read: "var(--viz-step-5)",
  failed: "var(--viz-no-show)",
  pending: "var(--viz-track)",
} as const

/** Os números de uma campanha, do jeito que a lista e o monitor os mostram. */
export type DeliveryNumbers = {
  total: number
  sent: number
  delivered: number
  read: number
  failed: number
  /** `null`: o servidor não informa, e a tela não mostra zero no lugar de "não sei". */
  replied: number | null
}

export function numbersFromCampaign(campaign: Campaign): DeliveryNumbers {
  return {
    total: campaign.totalContacts,
    sent: campaign.sentCount,
    delivered: campaign.deliveredCount,
    read: campaign.readCount,
    failed: campaign.failedCount,
    replied: campaign.repliedCount ?? null,
  }
}

export function numbersFromStats(stats: CampaignStats): DeliveryNumbers {
  return {
    total: stats.totalContacts,
    sent: stats.sent,
    delivered: stats.delivered,
    read: stats.read,
    failed: stats.failed,
    replied: stats.replied ?? null,
  }
}

/**
 * Quantos já tiveram uma tentativa. Uma falha depois de aceita conta em `sent` e em `failed`, porque
 * a Meta avisa depois: o contrato manda somar e limitar ao total.
 */
export function processedCount(numbers: DeliveryNumbers): number {
  return Math.min(numbers.sent + numbers.failed, numbers.total)
}

export function progressRatio(numbers: DeliveryNumbers): number {
  return numbers.total > 0 ? Math.min(processedCount(numbers) / numbers.total, 1) : 0
}

/** Parte sobre o todo, de 0 a 1. Sem base, é `null`: "0%" diria que algo foi medido. */
export function shareOf(part: number, whole: number): number | null {
  return whole > 0 ? Math.min(part / whole, 1) : null
}

/** A taxa que a lista usa: lidas sobre enviadas, como `GET /campaigns/summary`. */
export function readShare(numbers: DeliveryNumbers): number | null {
  return shareOf(numbers.read, numbers.sent)
}
