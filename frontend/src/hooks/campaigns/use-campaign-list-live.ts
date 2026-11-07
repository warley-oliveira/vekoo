import { useEffect, useRef, useState } from "react"
import { mutate } from "swr"

import { useChannel } from "@/hooks/use-channel"
import { createBatcher } from "@/lib/campaigns/live-batch"
import type { Campaign, CampaignChannelEvent, CampaignsResponse, LiveStats } from "@/lib/campaigns/types"
import {
  isCampaignListKey,
  patchCampaignRows,
  reloadCampaignLists,
  reloadCampaignSummary,
} from "./use-campaigns"
import { useOnReconnect } from "./use-on-reconnect"

/** A lista muda no máximo uma vez por segundo, por mais campanhas que estejam enviando. */
const FLUSH_MS = 1_000
/** Os números do topo somam a organização inteira: não precisam acompanhar cada mensagem. */
const SUMMARY_MS = 15_000
/** Mudou de estado: a linha já mudou, e a consulta confere quem entrou ou saiu do filtro. */
const MEMBERSHIP_MS = 1_500

type Patch = { stats?: LiveStats; campaign?: Campaign }

function applyPatch(row: Campaign, { stats, campaign }: Patch): Campaign {
  return {
    ...row,
    ...campaign,
    ...(stats
      ? {
          totalContacts: stats.totalContacts,
          sentCount: stats.sent,
          deliveredCount: stats.delivered,
          readCount: stats.read,
          failedCount: stats.failed,
          repliedCount: stats.replied ?? row.repliedCount,
          estimatedCompletionAt: stats.estimatedCompletion,
        }
      : {}),
  }
}

function reloadEverything() {
  void reloadCampaignLists()
  void reloadCampaignSummary()
}

/**
 * A lista ao vivo, por `CampaignChannel` sem parâmetros. Só escreve no cache do SWR, em lotes: a tela
 * não re-renderiza por causa deste hook, e só a linha que mudou recebe um objeto novo.
 */
export function useCampaignListLive() {
  const patches = useRef(new Map<string, Patch>())

  const [flushBatch] = useState(() =>
    createBatcher(FLUSH_MS, () => {
      const batch = patches.current
      if (batch.size === 0) return
      patches.current = new Map()

      void mutate(
        isCampaignListKey,
        (current?: CampaignsResponse) =>
          patchCampaignRows(current, (row) => {
            const patch = batch.get(row.id)
            return patch ? applyPatch(row, patch) : row
          }),
        { revalidate: false }
      )
    })
  )
  const [summaryBatch] = useState(() => createBatcher(SUMMARY_MS, () => void reloadCampaignSummary()))
  const [membershipBatch] = useState(() => createBatcher(MEMBERSHIP_MS, reloadEverything))

  const { connected } = useChannel<CampaignChannelEvent>("CampaignChannel", undefined, (event) => {
    if (event.event !== "progress" && event.event !== "status") return

    const current = patches.current.get(event.campaignId)
    if (event.event === "progress") {
      patches.current.set(event.campaignId, { ...current, stats: event.stats })
      summaryBatch.schedule()
    } else {
      patches.current.set(event.campaignId, { ...current, campaign: event.campaign })
      membershipBatch.schedule()
    }
    flushBatch.schedule()
  })

  useOnReconnect(connected, reloadEverything)

  useEffect(
    () => () => {
      flushBatch.cancel()
      summaryBatch.cancel()
      membershipBatch.cancel()
    },
    [flushBatch, summaryBatch, membershipBatch]
  )
}
