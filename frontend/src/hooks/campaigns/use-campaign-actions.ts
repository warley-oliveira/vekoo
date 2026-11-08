import { useCallback, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "@/lib/router"
import { mutate } from "swr"
import { toast } from "sonner"

import { useConfirm } from "@/components/shared"
import { useCan } from "@/hooks/use-can"
import { ApiError, apiDelete, apiPost } from "@/lib/api"
import {
  canCancel,
  canDelete,
  canPause,
  canResume,
  duplicatePath,
} from "@/lib/campaigns/status"
import type { Campaign, CampaignResponse } from "@/lib/campaigns/types"
import {
  isCampaignListKey,
  patchCampaignRows,
  reloadCampaignLists,
  reloadCampaignSummary,
} from "./use-campaigns"
import { recipientsKeyOf, statsKeyOf, campaignKeyOf } from "./use-campaign-monitor"

/** Canal é do domínio de integrações. É para lá que manda quem precisa reconectar. */
export const CHANNELS_PATH = "/settings/integrations"
export const CHANNELS_PERMISSION = "core_settings"

/** Quantas requisições por vez, num lote: a API é a mesma de quem está enviando mensagem. */
const BULK_CONCURRENCY = 4

/** A resposta da API já é a verdade: entra na tela sem esperar outra consulta. */
async function applyCampaign(campaign: Campaign) {
  await Promise.all([
    mutate<CampaignResponse>(
      campaignKeyOf(campaign.id),
      (current) => (current ? { campaign: { ...current.campaign, ...campaign } } : current),
      { revalidate: true }
    ),
    // A linha muda agora; a revalidação cuida de quem saiu do filtro.
    mutate(
      isCampaignListKey,
      (current?: Parameters<typeof patchCampaignRows>[0]) =>
        patchCampaignRows(current, (row) => (row.id === campaign.id ? { ...row, ...campaign } : row)),
      { revalidate: true }
    ),
    reloadCampaignSummary(),
    mutate(statsKeyOf(campaign.id)),
    mutate(recipientsKeyOf(campaign.id)),
  ])
}

function serverMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError && error.serverMessage ? error.serverMessage : fallback
}

async function inChunks<T, R>(items: T[], size: number, run: (item: T) => Promise<R>) {
  const results: PromiseSettledResult<R>[] = []
  for (let index = 0; index < items.length; index += size) {
    results.push(...(await Promise.allSettled(items.slice(index, index + size).map(run))))
  }
  return results
}

export type BulkKind = "pause" | "resume" | "cancel" | "delete"

const BULK_RULES: Record<BulkKind, (campaign: Campaign) => boolean> = {
  pause: (campaign) => canPause(campaign.status),
  resume: (campaign) => canResume(campaign.status),
  cancel: (campaign) => canCancel(campaign.status),
  delete: (campaign) => canDelete(campaign.status),
}

/** Quem da seleção aceita a ação: as regras são por estado, e a seleção pode misturar estados. */
export function eligibleFor(kind: BulkKind, campaigns: Campaign[]): Campaign[] {
  return campaigns.filter(BULK_RULES[kind])
}

/**
 * Pausar, retomar, cancelar, excluir e duplicar, com o retorno de cada um. Pausar não confirma: é
 * o que a pessoa faz com pressa, e desfazer está no próprio aviso. Cancelar e excluir confirmam,
 * porque não têm volta.
 */
export function useCampaignActions() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const canSeeChannels = useCan(CHANNELS_PERMISSION)

  const showChannels = useMemo(
    () =>
      canSeeChannels
        ? { label: t("campaigns.actions.seeChannels"), onClick: () => navigate(CHANNELS_PATH) }
        : undefined,
    [canSeeChannels, navigate, t]
  )

  const resume = useCallback(
    async (campaign: Campaign) => {
      try {
        const { campaign: updated } = await apiPost<CampaignResponse>(`/campaigns/${campaign.id}/resume`)
        await applyCampaign(updated)
        toast.success(t("campaigns.feedback.resumed", { name: campaign.name }))
      } catch (error) {
        const message = serverMessage(error, t("campaigns.feedback.resumeFailed"))
        const noChannel = error instanceof ApiError && error.code === "noActiveConnectors"
        toast.error(message, noChannel && showChannels ? { action: showChannels } : undefined)
      }
    },
    [showChannels, t]
  )

  const pause = useCallback(
    async (campaign: Campaign) => {
      try {
        const { campaign: updated } = await apiPost<CampaignResponse>(`/campaigns/${campaign.id}/pause`)
        await applyCampaign(updated)
        toast.success(t("campaigns.feedback.paused", { name: campaign.name }), {
          action: { label: t("campaigns.actions.resume"), onClick: () => void resume(updated) },
        })
      } catch (error) {
        toast.error(serverMessage(error, t("campaigns.feedback.pauseFailed")))
      }
    },
    [resume, t]
  )

  const cancel = useCallback(
    async (campaign: Campaign) => {
      const scheduled = campaign.status === "scheduled"
      const confirmed = await confirm({
        title: t(scheduled ? "campaigns.confirm.cancelScheduled.title" : "campaigns.confirm.cancel.title", {
          name: campaign.name,
        }),
        description: t(
          scheduled ? "campaigns.confirm.cancelScheduled.description" : "campaigns.confirm.cancel.description"
        ),
        confirmLabel: t("campaigns.actions.cancel"),
        cancelLabel: t("campaigns.confirm.keep"),
        destructive: true,
        onConfirm: async () => {
          const { campaign: updated } = await apiPost<CampaignResponse>(`/campaigns/${campaign.id}/cancel`)
          await applyCampaign(updated)
        },
      })
      if (confirmed) toast.success(t("campaigns.feedback.cancelled", { name: campaign.name }))
    },
    [confirm, t]
  )

  /** Resolve `true` se excluiu: quem está na tela da campanha precisa sair dela. */
  const remove = useCallback(
    async (campaign: Campaign) => {
      const confirmed = await confirm({
        title: t("campaigns.confirm.delete.title", { name: campaign.name }),
        description: t("campaigns.confirm.delete.description"),
        confirmLabel: t("campaigns.actions.delete"),
        cancelLabel: t("campaigns.confirm.keep"),
        destructive: true,
        onConfirm: async () => {
          await apiDelete(`/campaigns/${campaign.id}`)
          await Promise.all([reloadCampaignLists(), reloadCampaignSummary()])
        },
      })
      if (confirmed) toast.success(t("campaigns.feedback.deleted", { name: campaign.name }))
      return confirmed
    },
    [confirm, t]
  )

  const duplicate = useCallback(
    (campaign: Campaign) => {
      navigate(duplicatePath(campaign.id))
    },
    [navigate]
  )

  /* ---------- em lote ---------- */

  const announceBulk = useCallback(
    (kind: BulkKind, results: PromiseSettledResult<unknown>[]) => {
      const done = results.filter((result) => result.status === "fulfilled").length
      const failed = results.length - done

      if (failed === 0) {
        toast.success(t(`campaigns.bulk.done.${kind}`, { count: done }))
        return
      }

      const first = results.find((result): result is PromiseRejectedResult => result.status === "rejected")
      const description = first ? serverMessage(first.reason, "") : ""
      const notify = done > 0 ? toast.warning : toast.error
      notify(t("campaigns.bulk.partial", { done, count: results.length }), {
        description: description || undefined,
      })
    },
    [t]
  )

  const runBulk = useCallback(
    async (kind: BulkKind, campaigns: Campaign[]) => {
      const results = await inChunks(campaigns, BULK_CONCURRENCY, async (campaign) => {
        if (kind === "delete") return apiDelete(`/campaigns/${campaign.id}`)
        return apiPost<CampaignResponse>(`/campaigns/${campaign.id}/${kind}`)
      })
      await Promise.all([reloadCampaignLists(), reloadCampaignSummary()])
      announceBulk(kind, results)
    },
    [announceBulk]
  )

  /** Resolve `true` se a ação rodou, para quem chamou limpar a seleção. */
  const bulk = useCallback(
    async (kind: BulkKind, selected: Campaign[]) => {
      const targets = eligibleFor(kind, selected)
      if (targets.length === 0) return false

      if (kind === "pause" || kind === "resume") {
        await runBulk(kind, targets)
        return true
      }

      // A confirmação fecha logo: uma falha em uma de dez campanhas é retorno, não motivo para travar.
      const skipped = selected.length - targets.length
      return confirm({
        title: t(`campaigns.bulk.confirm.${kind}.title`, { count: targets.length }),
        description: [
          t(`campaigns.bulk.confirm.${kind}.description`, { count: targets.length }),
          skipped > 0 ? t("campaigns.bulk.confirm.skipped", { count: skipped }) : "",
        ]
          .filter(Boolean)
          .join(" "),
        confirmLabel: t(`campaigns.bulk.confirm.${kind}.confirm`, { count: targets.length }),
        cancelLabel: t("campaigns.confirm.keep"),
        destructive: true,
        onConfirm: () => runBulk(kind, targets),
      })
    },
    [confirm, runBulk, t]
  )

  return useMemo(
    () => ({ pause, resume, cancel, remove, duplicate, bulk }),
    [pause, resume, cancel, remove, duplicate, bulk]
  )
}

export type CampaignActions = ReturnType<typeof useCampaignActions>
