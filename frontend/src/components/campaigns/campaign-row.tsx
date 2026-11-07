import { memo, useMemo } from "react"
import { Trans, useTranslation } from "react-i18next"
import { Link, useNavigate } from "react-router"
import { AlertCircle, CircleSlash, Copy, Eye, Pause, PencilLine, Play, SquareCheck, Trash2 } from "lucide-react"

import { ActionsMenu, RelativeTime, type RowAction } from "@/components/shared"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { CampaignActions } from "@/hooks/campaigns/use-campaign-actions"
import { useLongPress } from "@/hooks/use-long-press"
import { useIsTouch } from "@/hooks/use-media-query"
import { numbersFromCampaign, processedCount, progressRatio, readShare } from "@/lib/campaigns/progress"
import {
  campaignPath,
  canCancel,
  canDelete,
  canEdit,
  canPause,
  canResume,
  hasNotStarted,
} from "@/lib/campaigns/status"
import type { Campaign } from "@/lib/campaigns/types"
import { formatNumber, formatPercent } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { CampaignStatusBadge } from "./campaign-status-badge"
import { DeliveryBar } from "./delivery-bar"
import { LiveNumber } from "./live-number"

// As colunas moram aqui para o cabeçalho e o esqueleto alinharem com as linhas. Abaixo do `md`, cada
// linha é um card empilhado.
export const CAMPAIGN_ROW_GRID =
  "md:grid md:grid-cols-[1.25rem_minmax(0,1fr)_9.5rem_minmax(11rem,16rem)_8.5rem_2rem] md:items-center md:gap-x-4"

type CampaignRowProps = {
  campaign: Campaign
  channel: string
  actions: CampaignActions
  selected: boolean
  /** Há algo selecionado: tocar passa a marcar, e não a abrir. */
  selecting: boolean
  onToggleSelect: (campaign: Campaign) => void
}

function useRowActions(
  campaign: Campaign,
  actions: CampaignActions,
  onToggleSelect: (campaign: Campaign) => void
): RowAction[] {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { status } = campaign

  return useMemo(
    () => [
      {
        label: t("campaigns.actions.continueEditing"),
        icon: <PencilLine />,
        hidden: !canEdit(status),
        onSelect: () => navigate(`/campaigns/${campaign.id}/edit`),
      },
      {
        label: t("campaigns.actions.view"),
        icon: <Eye />,
        hidden: canEdit(status),
        onSelect: () => navigate(`/campaigns/${campaign.id}`),
      },
      {
        label: t("campaigns.actions.pause"),
        icon: <Pause />,
        hidden: !canPause(status),
        onSelect: () => void actions.pause(campaign),
      },
      {
        label: t("campaigns.actions.resume"),
        icon: <Play />,
        hidden: !canResume(status),
        onSelect: () => void actions.resume(campaign),
      },
      {
        label: t("campaigns.actions.duplicate"),
        icon: <Copy />,
        onSelect: () => actions.duplicate(campaign),
      },
      {
        label: t("campaigns.actions.select"),
        icon: <SquareCheck />,
        onSelect: () => onToggleSelect(campaign),
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
        onSelect: () => void actions.remove(campaign),
      },
    ],
    [actions, campaign, navigate, onToggleSelect, status, t]
  )
}

/** Quando, em uma frase, com a data completa ao passar o mouse. */
function RowTime({ campaign }: { campaign: Campaign }) {
  const time = (value: number | null) => <RelativeTime value={value} className="whitespace-nowrap" />

  switch (campaign.status) {
    case "scheduled":
      return <Trans i18nKey="campaigns.row.startsAt" components={{ time: time(campaign.scheduledAt) }} />
    case "running":
      return campaign.estimatedCompletionAt && campaign.estimatedCompletionAt > Date.now() ? (
        <Trans i18nKey="campaigns.row.endsAt" components={{ time: time(campaign.estimatedCompletionAt) }} />
      ) : (
        <Trans i18nKey="campaigns.row.startedAt" components={{ time: time(campaign.startedAt) }} />
      )
    case "completed":
      return <Trans i18nKey="campaigns.row.finishedAt" components={{ time: time(campaign.completedAt) }} />
    case "cancelled":
      return <Trans i18nKey="campaigns.row.cancelledAt" components={{ time: time(campaign.completedAt) }} />
    case "paused":
      return <Trans i18nKey="campaigns.row.pausedAt" components={{ time: time(campaign.updatedAt) }} />
    case "draft":
    default:
      return <Trans i18nKey="campaigns.row.createdAt" components={{ time: time(campaign.createdAt) }} />
  }
}

/** Uma campanha na lista. Memorizada: um evento de outra campanha não passa por aqui. */
export const CampaignRow = memo(function CampaignRow({
  campaign,
  channel,
  actions,
  selected,
  selecting,
  onToggleSelect,
}: CampaignRowProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const navigate = useNavigate()
  const isTouch = useIsTouch()
  const { handlers, didFire } = useLongPress(() => onToggleSelect(campaign))

  const rowActions = useRowActions(campaign, actions, onToggleSelect)
  const path = campaignPath(campaign.id, campaign.status)
  const numbers = numbersFromCampaign(campaign)
  const notStarted = hasNotStarted(campaign.status)
  const read = readShare(numbers)
  const total = formatNumber(numbers.total, language)

  return (
    <div
      data-state={selected ? "selected" : undefined}
      className={cn(
        "group/row relative flex flex-col gap-3 p-4 transition-colors has-[a:focus-visible]:bg-muted/40 hover:bg-muted/40 data-[state=selected]:bg-accent/60 md:px-4 md:py-3",
        CAMPAIGN_ROW_GRID
      )}
    >
      {/* Fora do fluxo no celular: selecionar começa por segurar a linha ou pelo menu. */}
      <div
        className={cn(
          "relative z-10 hidden md:flex md:opacity-0 md:transition-opacity md:group-hover/row:opacity-100 md:focus-within:opacity-100",
          (selecting || selected) && "flex md:opacity-100"
        )}
      >
        <Checkbox
          checked={selected}
          aria-label={t("campaigns.list.selectRow", { name: campaign.name })}
          className="border-muted-foreground/40"
          onCheckedChange={() => onToggleSelect(campaign)}
        />
      </div>

      {/* O nome é o link, e ele cobre a linha: teclado e leitor de tela encontram um alvo só. */}
      <div className="flex min-w-0 items-start gap-2 md:block">
        <div className="min-w-0 flex-1">
          <Link
            to={path}
            {...(isTouch ? handlers : {})}
            onClick={(event) => {
              if (didFire()) {
                event.preventDefault()
              } else if (selecting) {
                event.preventDefault()
                onToggleSelect(campaign)
              }
            }}
            className="block truncate text-sm font-medium outline-none after:absolute after:inset-0 focus-visible:after:rounded-md focus-visible:after:ring-3 focus-visible:after:ring-ring/50 focus-visible:after:ring-inset"
          >
            {campaign.name}
          </Link>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{channel}</p>
        </div>
        <div className="relative z-10 -my-1 -mr-1 md:hidden">
          <ActionsMenu actions={rowActions} label={t("campaigns.list.actionsOf", { name: campaign.name })} />
        </div>
      </div>

      <div className="order-last flex flex-wrap items-center gap-x-2 gap-y-1 md:order-none md:flex-col md:items-start md:gap-y-0.5">
        <CampaignStatusBadge status={campaign.status} />
        <p className="relative z-10 min-w-0 text-xs text-muted-foreground">
          <RowTime campaign={campaign} />
        </p>
      </div>

      <div className="min-w-0">
        {notStarted ? (
          <p className="text-xs text-muted-foreground tabular-nums">
            {t("campaigns.row.contacts", { count: numbers.total, formatted: total })}
          </p>
        ) : (
          <>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-xs tabular-nums">
              <span className="truncate text-muted-foreground">
                {t("campaigns.row.progress", {
                  processed: formatNumber(processedCount(numbers), language),
                  total,
                })}
              </span>
              <LiveNumber
                value={Math.round(progressRatio(numbers) * 100)}
                format={(value) => formatPercent(value / 100, language, { maximumFractionDigits: 0 })}
                className="font-medium"
              />
            </div>
            <div className="relative z-10">
              <DeliveryBar numbers={numbers} size="sm" onClick={() => navigate(path)} />
            </div>
          </>
        )}
      </div>

      {notStarted ? (
        <div aria-hidden className="hidden md:block" />
      ) : (
        <div className="relative z-10 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs tabular-nums md:flex-col md:items-start">
          {read !== null ? (
            <Tooltip>
              <TooltipTrigger render={<span />}>
                {t("campaigns.row.readShare", { share: formatPercent(read, language, { maximumFractionDigits: 0 }) })}
              </TooltipTrigger>
              <TooltipContent>
                {t("campaigns.row.readTooltip", {
                  read: formatNumber(numbers.read, language),
                  sent: formatNumber(numbers.sent, language),
                })}
              </TooltipContent>
            </Tooltip>
          ) : (
            <span className="text-muted-foreground">{t("kit.noValue")}</span>
          )}
          {numbers.replied ? (
            <span className="text-muted-foreground">
              {t("campaigns.row.replied", {
                count: numbers.replied,
                formatted: formatNumber(numbers.replied, language),
              })}
            </span>
          ) : null}
          {numbers.failed > 0 ? (
            <span className="inline-flex items-center gap-1 text-status-danger">
              <AlertCircle aria-hidden className="size-3" />
              {t("campaigns.row.failed", {
                count: numbers.failed,
                formatted: formatNumber(numbers.failed, language),
              })}
            </span>
          ) : null}
        </div>
      )}

      <div className="relative z-10 hidden justify-end md:flex">
        <ActionsMenu actions={rowActions} label={t("campaigns.list.actionsOf", { name: campaign.name })} />
      </div>
    </div>
  )
})

/** O esqueleto das linhas, com as mesmas colunas: nada pula quando os dados chegam. */
export function CampaignRowSkeleton() {
  return (
    <div className={cn("flex flex-col gap-3 p-4 md:px-4 md:py-3", CAMPAIGN_ROW_GRID)}>
      <div aria-hidden className="hidden md:block" />
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/3" />
      </div>
      <div className="order-last flex items-center gap-2 md:order-none md:flex-col md:items-start md:gap-1.5">
        <Skeleton className="h-5 w-24 rounded-full" />
        <Skeleton className="h-3 w-20" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-1.5 w-full rounded-full" />
      </div>
      <div className="hidden flex-col gap-1.5 md:flex">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-20" />
      </div>
      <div aria-hidden className="hidden md:block" />
    </div>
  )
}
