import { useCallback, useRef, useState } from "react"
import { useReducedMotion } from "motion/react"
import { useTranslation } from "react-i18next"
import { Link, useNavigate, useParams, useSearchParams } from "react-router"
import { CircleSlash, Copy, Loader2, Megaphone, Pause, PencilLine, Play, Trash2 } from "lucide-react"

import { ActivityCard } from "@/components/campaigns/activity-card"
import { CampaignStatusBadge } from "@/components/campaigns/campaign-status-badge"
import { ConfigCard } from "@/components/campaigns/config-card"
import { MonitorHero } from "@/components/campaigns/monitor-hero"
import { MonitorSkeleton } from "@/components/campaigns/monitor-skeleton"
import { RecipientsSection } from "@/components/campaigns/recipients-section"
import {
  ActionsMenu,
  EmptyState,
  ErrorState,
  PageBody,
  PageHeader,
  type RowAction,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useCampaignActions } from "@/hooks/campaigns/use-campaign-actions"
import { useCampaign, useCampaignLive } from "@/hooks/campaigns/use-campaign-monitor"
import { ApiError } from "@/lib/api"
import { canCancel, canDelete, canEdit, canPause, canResume } from "@/lib/campaigns/status"
import type { CampaignDetail } from "@/lib/campaigns/types"

export default function CampaignMonitorPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { campaignId } = useParams<{ campaignId: string }>()
  const [, setParams] = useSearchParams()

  const { data, error, isLoading, mutate } = useCampaign(campaignId)
  const campaign = data?.campaign
  const { connected } = useCampaignLive(campaignId, campaign?.status)

  const recipients = useRef<HTMLElement>(null)
  const reducedMotion = useReducedMotion()

  // Tocar num número leva à lista já filtrada. O filtro mora na URL, onde a lista o lê.
  const filterRecipients = useCallback(
    (statuses: string[]) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          next.delete("page")
          next.delete("q")
          next.delete("status")
          statuses.forEach((status) => next.append("status", status))
          return next
        },
        { replace: true }
      )
      recipients.current?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" })
    },
    [reducedMotion, setParams]
  )

  const editAction = useCallback(() => navigate(`/campaigns/${campaignId}/edit`), [campaignId, navigate])
  const emptyAction = campaign?.status === "draft" ? { label: t("campaigns.actions.continueEditing"), onClick: editAction } : undefined

  if (error && !campaign) {
    const missing = error instanceof ApiError && error.status === 404

    return (
      <PageBody variant="wide">
        <PageHeader backTo="/campaigns" title={t("navigation.routes.campaign")} parentTitle={t("navigation.campaigns")} />
        {missing ? (
          <EmptyState
            icon={<Megaphone className="size-5" />}
            title={t("campaigns.monitor.notFound.title")}
            description={t("campaigns.monitor.notFound.description")}
            action={{ label: t("campaigns.monitor.notFound.action"), onClick: () => navigate("/campaigns") }}
          />
        ) : (
          <ErrorState error={error} onRetry={() => void mutate()} />
        )}
      </PageBody>
    )
  }

  if ((isLoading && !campaign) || !campaign || !campaignId) return <MonitorSkeleton />

  return (
    <PageBody variant="wide">
      <MonitorHeader campaign={campaign} />
      <MonitorHero campaign={campaign} connected={connected} onFilterRecipients={filterRecipients} />

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
        <RecipientsSection ref={recipients} campaignId={campaignId} emptyAction={emptyAction} />
        <aside className="flex min-w-0 flex-col gap-6">
          <ActivityCard events={campaign.activityEvents} />
          <ConfigCard campaign={campaign} />
        </aside>
      </div>
    </PageBody>
  )
}

/** Título, situação e o que dá para fazer agora. Só o principal fica à mostra, o resto no menu. */
function MonitorHeader({ campaign }: { campaign: CampaignDetail }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const actions = useCampaignActions()
  const [busy, setBusy] = useState(false)

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    try {
      await action()
    } finally {
      setBusy(false)
    }
  }

  const { status } = campaign
  const menu: RowAction[] = [
    {
      label: t("campaigns.actions.duplicate"),
      icon: <Copy />,
      onSelect: () => actions.duplicate(campaign),
    },
    {
      label: t("campaigns.actions.cancel"),
      icon: <CircleSlash />,
      destructive: true,
      separatorBefore: true,
      hidden: !canCancel(status),
      onSelect: () => void actions.cancel(campaign),
    },
    {
      label: t("campaigns.actions.delete"),
      icon: <Trash2 />,
      destructive: true,
      separatorBefore: true,
      hidden: !canDelete(status),
      onSelect: () => {
        void actions.remove(campaign).then((removed) => {
          if (removed) navigate("/campaigns")
        })
      },
    },
  ]

  const primary = canPause(status) ? (
    <Button
      type="button"
      variant="outline"
      disabled={busy}
      className="pointer-coarse:h-10"
      onClick={() => void run(() => actions.pause(campaign))}
    >
      {busy ? <Loader2 className="animate-spin" /> : <Pause />}
      {t("campaigns.actions.pause")}
    </Button>
  ) : canResume(status) ? (
    <Button
      type="button"
      disabled={busy}
      className="pointer-coarse:h-10"
      onClick={() => void run(() => actions.resume(campaign))}
    >
      {busy ? <Loader2 className="animate-spin" /> : <Play />}
      {t("campaigns.actions.resume")}
    </Button>
  ) : canEdit(status) ? (
    <Button nativeButton={false} className="pointer-coarse:h-10" render={<Link to={`/campaigns/${campaign.id}/edit`} />}>
      <PencilLine />
      {t("campaigns.actions.continueEditing")}
    </Button>
  ) : null

  const controls = (
    <>
      <CampaignStatusBadge status={status} className="max-md:hidden" />
      {primary}
      <ActionsMenu
        actions={menu}
        label={t("campaigns.monitor.moreActions")}
        className="pointer-coarse:size-10"
      />
    </>
  )

  return (
    <PageHeader
      title={campaign.name}
      backTo="/campaigns"
      parentTitle={t("navigation.campaigns")}
      actions={controls}
      mobilePlacement="inline"
    />
  )
}
