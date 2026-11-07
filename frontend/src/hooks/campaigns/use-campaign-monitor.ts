import { useEffect, useRef, useState } from "react"
import { mutate, useSWRConfig, type Arguments } from "swr"

import { useApi } from "@/hooks/use-api"
import { useChannel } from "@/hooks/use-channel"
import { createBatcher } from "@/lib/campaigns/live-batch"
import type {
  ActivityEvent,
  Campaign,
  CampaignChannelEvent,
  CampaignResponse,
  CampaignStatsResponse,
  CampaignStatus,
  LiveStats,
  Recipient,
  RecipientsResponse,
} from "@/lib/campaigns/types"
import { useOnReconnect } from "./use-on-reconnect"

export const campaignKeyOf = (id: string) => `/campaigns/${id}`
export const statsKeyOf = (id: string) => `/campaigns/${id}/stats`
export const recipientsKeyOf = (id: string) => (key: Arguments) =>
  typeof key === "string" && key.startsWith(`/campaigns/${id}/recipients`)

/** Os números mudam no máximo uma vez por segundo, por mais mensagens que saiam. */
const FLUSH_MS = 1_000
/** `pending` e `skipped` só saem em `GET /stats`: de tempos em tempos, confere a conta. */
const TRUE_UP_MS = 30_000
/** Lista filtrada: uma linha pode ter entrado no filtro, e só o servidor sabe em que página. */
const FILTERED_LIST_MS = 5_000
/** Mudou de estado: cancelar, por exemplo, muda muitos destinatários de uma vez. */
const AFTER_STATUS_MS = 800
/** Sem o canal, a tela não para: lê de tempos em tempos, em vez de ficar parada sem avisar. */
const FALLBACK_POLL_MS = 15_000
const ACTIVITY_LIMIT = 100

export function useCampaign(id: string | undefined) {
  return useApi<CampaignResponse>(id ? campaignKeyOf(id) : null, { keepPreviousData: false })
}

export function useCampaignStats(id: string) {
  return useApi<CampaignStatsResponse>(statsKeyOf(id), { keepPreviousData: false })
}

type Pending = {
  stats: LiveStats | null
  campaign: Campaign | null
  recipients: Map<string, Recipient>
  activity: ActivityEvent[]
}

const emptyPending = (): Pending => ({
  stats: null,
  campaign: null,
  recipients: new Map(),
  activity: [],
})

/** O evento não traz quem falta: desconta quem andou, e a conferência periódica acerta o resto. */
function mergeStats(current: CampaignStatsResponse | undefined, live: LiveStats) {
  if (!current) return current

  const before = current.stats
  const advanced = live.sent + live.failed - (before.sent + before.failed)
  return {
    stats: { ...before, ...live, pending: Math.max(before.pending - Math.max(advanced, 0), 0) },
  }
}

function mergeDetail(current: CampaignResponse | undefined, pending: Pending) {
  if (!current) return current

  const seen = new Set(current.campaign.activityEvents.map((event) => event.id))
  const fresh = pending.activity.filter((event) => !seen.has(event.id)).reverse()

  return {
    campaign: {
      ...current.campaign,
      ...pending.campaign,
      activityEvents: [...fresh, ...current.campaign.activityEvents].slice(0, ACTIVITY_LIMIT),
    },
  }
}

/** Os status pedidos na consulta, para saber se a linha ainda pertence a ela. */
function statusFilterOf(key: string): Set<string> | null {
  const status = new URLSearchParams(key.split("?")[1] ?? "").get("status")
  return status ? new Set(status.split(",")) : null
}

function matchesFilter(recipient: Recipient, statuses: Set<string>): boolean {
  return statuses.has(recipient.status) || (statuses.has("replied") && Boolean(recipient.repliedAt))
}

/** Funde por `id`. Página sem nenhuma das linhas devolve o mesmo objeto, e a tabela nem fica sabendo. */
function mergeRecipients(
  key: string,
  current: RecipientsResponse | undefined,
  updates: Map<string, Recipient>
): RecipientsResponse | undefined {
  if (!current) return current

  const statuses = statusFilterOf(key)
  let changed = false
  let removed = 0

  const recipients = current.recipients.flatMap((row) => {
    const update = updates.get(row.id)
    if (!update) return [row]

    changed = true
    if (statuses && !matchesFilter(update, statuses)) {
      removed += 1
      return []
    }
    return [update]
  })

  if (!changed) return current
  return { recipients, meta: { ...current.meta, total: current.meta.total - removed } }
}

function reloadMonitor(id: string) {
  void mutate(campaignKeyOf(id))
  void mutate(statsKeyOf(id))
  void mutate(recipientsKeyOf(id))
}

/**
 * O monitor ao vivo, por `CampaignChannel`. Só escreve no cache do SWR, em lotes de um segundo, e cada
 * pedaço da tela assina a própria chave: os números não refazem a lista, e um destinatário de outra
 * página não refaz nada. Este hook só devolve `connected`, que quase nunca muda.
 */
export function useCampaignLive(id: string | undefined, status: CampaignStatus | undefined) {
  const { cache } = useSWRConfig()
  const pending = useRef<Pending>(emptyPending())
  const idRef = useRef(id)
  idRef.current = id

  const [trueUpBatch] = useState(() =>
    createBatcher(TRUE_UP_MS, () => {
      if (idRef.current) void mutate(statsKeyOf(idRef.current))
    })
  )

  const [filteredListBatch] = useState(() =>
    createBatcher(FILTERED_LIST_MS, () => {
      if (!idRef.current) return
      const isRecipients = recipientsKeyOf(idRef.current)
      void mutate((key) => isRecipients(key) && statusFilterOf(key as string) !== null)
    })
  )

  const [afterStatusBatch] = useState(() =>
    createBatcher(AFTER_STATUS_MS, () => {
      if (!idRef.current) return
      void mutate(statsKeyOf(idRef.current))
      void mutate(recipientsKeyOf(idRef.current))
    })
  )

  const [flushBatch] = useState(() =>
    createBatcher(FLUSH_MS, () => {
      const batch = pending.current
      pending.current = emptyPending()
      const campaignId = idRef.current
      if (!campaignId) return

      if (batch.stats) {
        const live = batch.stats
        void mutate<CampaignStatsResponse>(statsKeyOf(campaignId), (current) => mergeStats(current, live), {
          revalidate: false,
        })
      }
      if (batch.campaign || batch.activity.length > 0) {
        void mutate<CampaignResponse>(campaignKeyOf(campaignId), (current) => mergeDetail(current, batch), {
          revalidate: false,
        })
      }
      if (batch.recipients.size > 0) {
        const isRecipients = recipientsKeyOf(campaignId)
        let filtered = false

        for (const key of cache.keys()) {
          if (!isRecipients(key)) continue
          filtered ||= statusFilterOf(key) !== null
          void mutate<RecipientsResponse>(key, (current) => mergeRecipients(key, current, batch.recipients), {
            revalidate: false,
          })
        }
        if (filtered) filteredListBatch.schedule()
      }
    })
  )

  const { connected } = useChannel<CampaignChannelEvent>(
    id ? "CampaignChannel" : null,
    id ? { campaignId: id } : undefined,
    (event) => {
      if (event.campaignId !== idRef.current) return

      switch (event.event) {
        case "progress":
          pending.current.stats = event.stats
          trueUpBatch.schedule()
          break
        case "recipient":
          pending.current.recipients.set(event.recipient.id, event.recipient)
          break
        case "status":
          pending.current.campaign = event.campaign
          afterStatusBatch.schedule()
          break
        case "activity":
          pending.current.activity.push(event.activity)
          break
      }
      flushBatch.schedule()
    }
  )

  useOnReconnect(connected, () => {
    if (id) reloadMonitor(id)
  })

  // O canal caiu, ou foi recusado: enquanto a campanha pode mudar, a tela relê sozinha.
  const canStillChange = status === "running" || status === "paused"
  useEffect(() => {
    if (!id || connected || !canStillChange) return

    const timer = setInterval(() => reloadMonitor(id), FALLBACK_POLL_MS)
    return () => clearInterval(timer)
  }, [id, connected, canStillChange])

  useEffect(
    () => () => {
      flushBatch.cancel()
      trueUpBatch.cancel()
      filteredListBatch.cancel()
      afterStatusBatch.cancel()
    },
    [flushBatch, trueUpBatch, filteredListBatch, afterStatusBatch]
  )

  return { connected }
}
