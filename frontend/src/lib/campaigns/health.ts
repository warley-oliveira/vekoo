import type { StatusTone } from "@/components/shared"
import { processedCount, type DeliveryNumbers } from "./progress"
import { sendWindowState, type SendWindowState } from "./send-window"
import type { Campaign } from "./types"

// A pergunta da tela, em uma frase: "está indo bem?". O veredito vem daqui, sem texto: quem traduz é
// a tela, por `campaigns.health.<kind>`.
//
// Só a falha pesa. Entregue e lido chegam atrasados, e há canal que nem avisa: julgar por eles faria
// uma campanha saudável parecer doente.

export type HealthKind =
  | "draft"
  | "scheduled"
  | "starting"
  | "healthy"
  | "someFailures"
  | "manyFailures"
  | "outsideWindow"
  | "pausedByPerson"
  | "pausedNoChannel"
  | "pausedChannelFailing"
  | "finished"
  | "finishedWithFailures"
  | "cancelled"

export type CampaignHealth = {
  kind: HealthKind
  tone: StatusTone
  window: SendWindowState
}

/** A partir daqui já vale avisar: poucas falhas numa lista grande são normais. */
const SOME_FAILURES = { rate: 0.05, count: 2 }
/** A partir daqui, pode ser o canal ou a lista: vale parar para olhar. */
const MANY_FAILURES = { rate: 0.2, count: 3 }

function failureLevel(numbers: DeliveryNumbers): "none" | "some" | "many" {
  const processed = processedCount(numbers)
  if (processed === 0) return "none"

  const rate = numbers.failed / processed
  if (numbers.failed >= MANY_FAILURES.count && rate >= MANY_FAILURES.rate) return "many"
  if (numbers.failed >= SOME_FAILURES.count && rate >= SOME_FAILURES.rate) return "some"
  return "none"
}

export function campaignHealth(
  campaign: Pick<
    Campaign,
    "status" | "pauseReason" | "sendWindowStart" | "sendWindowEnd" | "sendDays" | "timezone"
  >,
  numbers: DeliveryNumbers,
  now = new Date()
): CampaignHealth {
  const window = sendWindowState(campaign, now)
  const failures = failureLevel(numbers)
  const health = (kind: HealthKind, tone: StatusTone): CampaignHealth => ({ kind, tone, window })

  switch (campaign.status) {
    case "draft":
      return health("draft", "neutral")
    case "scheduled":
      return health("scheduled", "info")
    case "paused":
      if (campaign.pauseReason === "noActiveConnectors") return health("pausedNoChannel", "danger")
      if (campaign.pauseReason === "channelFailing") return health("pausedChannelFailing", "danger")
      return health("pausedByPerson", "warning")
    case "completed":
      return failures === "none"
        ? health("finished", "success")
        : health("finishedWithFailures", "warning")
    case "cancelled":
      return health("cancelled", "neutral")
    case "running":
    default:
      // Muitas falhas vêm antes do horário: é o que a pessoa precisa resolver, mesmo com tudo parado.
      if (failures === "many") return health("manyFailures", "danger")
      if (!window.open) return health("outsideWindow", "info")
      if (failures === "some") return health("someFailures", "warning")
      return processedCount(numbers) === 0 ? health("starting", "info") : health("healthy", "success")
  }
}
