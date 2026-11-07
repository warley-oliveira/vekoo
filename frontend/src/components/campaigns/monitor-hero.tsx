import { memo, useSyncExternalStore, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router"
import {
  CircleCheck,
  CircleSlash,
  Clock,
  FilePen,
  OctagonAlert,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react"

import { InlineError, type StatusTone } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { CHANNELS_PATH, CHANNELS_PERMISSION } from "@/hooks/campaigns/use-campaign-actions"
import { useCan } from "@/hooks/use-can"
import { useCampaignStats } from "@/hooks/campaigns/use-campaign-monitor"
import { formatWhen } from "@/lib/campaigns/format"
import { campaignHealth, type HealthKind } from "@/lib/campaigns/health"
import {
  DELIVERY_COLORS,
  numbersFromCampaign,
  numbersFromStats,
  processedCount,
  progressRatio,
  shareOf,
} from "@/lib/campaigns/progress"
import type { SendWindowState } from "@/lib/campaigns/send-window"
import { hasNotStarted } from "@/lib/campaigns/status"
import type { Campaign } from "@/lib/campaigns/types"
import { formatNumber, formatPercent } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { DeliveryBar } from "./delivery-bar"
import { LiveNumber } from "./live-number"

const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: "bg-status-neutral-soft text-status-neutral",
  success: "bg-status-success-soft text-status-success",
  warning: "bg-status-warning-soft text-status-warning",
  danger: "bg-status-danger-soft text-status-danger",
  info: "bg-status-info-soft text-status-info",
  accent: "bg-status-accent-soft text-status-accent",
}

const HEALTH_ICONS: Record<HealthKind, LucideIcon> = {
  draft: FilePen,
  scheduled: Clock,
  starting: Clock,
  healthy: CircleCheck,
  someFailures: TriangleAlert,
  manyFailures: OctagonAlert,
  outsideWindow: Clock,
  pausedByPerson: TriangleAlert,
  pausedNoChannel: OctagonAlert,
  pausedChannelFailing: OctagonAlert,
  finished: CircleCheck,
  finishedWithFailures: TriangleAlert,
  cancelled: CircleSlash,
}

/* ---------- relógio ---------- */

// O veredito depende da hora (janela de envio, previsão): relê a cada minuto, e só este painel.
const TICK = 60_000
let minute = Date.now()
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | undefined

function subscribeClock(listener: () => void) {
  listeners.add(listener)
  timer ??= setInterval(() => {
    minute = Date.now()
    listeners.forEach((notify) => notify())
  }, TICK)

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      clearInterval(timer)
      timer = undefined
    }
  }
}

function useClock() {
  return useSyncExternalStore(subscribeClock, () => minute)
}

/* ---------- painel ---------- */

type MonitorHeroProps = {
  campaign: Campaign
  connected: boolean
  /** Mostra na lista de destinatários só quem está nesta situação. */
  onFilterRecipients: (statuses: string[]) => void
}

/**
 * A primeira coisa da tela responde "está indo bem?" em uma frase, sem jargão. Os números vêm depois,
 * para quem quer conferir, e cada um é um atalho para ver quem está ali. Assina as estatísticas por
 * conta própria: é só este painel que muda a cada lote de mensagens.
 */
export const MonitorHero = memo(function MonitorHero({
  campaign,
  connected,
  onFilterRecipients,
}: MonitorHeroProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const now = Math.max(useClock(), Date.now())
  const { data, error, mutate } = useCampaignStats(campaign.id)
  const stats = data?.stats

  const numbers = stats ? numbersFromStats(stats) : numbersFromCampaign(campaign)
  const processed = processedCount(numbers)
  const pending = stats?.pending ?? Math.max(numbers.total - processed, 0)
  const skipped = stats?.skipped ?? 0
  const health = campaignHealth(campaign, numbers, new Date(now))
  const Icon = HEALTH_ICONS[health.kind]
  const notStarted = hasNotStarted(campaign.status)
  const running = campaign.status === "running"

  const whenWindowOpens = (window: SendWindowState) => {
    if (window.open) return ""
    const time = campaign.sendWindowStart ?? ""
    if (window.daysAhead === 0) return t("campaigns.when.today", { time })
    if (window.daysAhead === 1) return t("campaigns.when.tomorrow", { time })
    const weekday = new Intl.DateTimeFormat(language, {
      weekday: "long",
      timeZone: campaign.timezone,
    }).format(window.at)
    return t("campaigns.when.weekday", { weekday, time })
  }

  const description = t(`campaigns.health.${health.kind}.description`, {
    count: health.kind === "scheduled" ? numbers.total : pending,
    total: formatNumber(numbers.total, language),
    processed: formatNumber(processed, language),
    sent: formatNumber(numbers.sent, language),
    read: formatNumber(numbers.read, language),
    failed: formatNumber(numbers.failed, language),
    pending: formatNumber(pending, language),
    skipped: formatNumber(skipped, language),
    when:
      health.kind === "scheduled" && campaign.scheduledAt
        ? formatWhen(campaign.scheduledAt, language, t, now)
        : whenWindowOpens(health.window),
  })

  const percentOf = (part: number, whole: number) => {
    const share = shareOf(part, whole)
    return share === null ? t("kit.noValue") : formatPercent(share, language, { maximumFractionDigits: 0 })
  }

  const eta = stats?.estimatedCompletion ?? campaign.estimatedCompletionAt
  const showEta = running && pending > 0 && eta !== null && eta > now
  const rate = stats?.messagesPerHour ?? 0

  return (
    <section
      aria-labelledby="campaign-verdict"
      className="flex flex-col gap-5 rounded-xl bg-card p-4 ring-1 ring-foreground/10 md:p-6"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 gap-3">
          <span
            aria-hidden
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-full md:size-10",
              TONE_CLASSES[health.tone]
            )}
          >
            <Icon className="size-4.5 md:size-5" />
          </span>
          <div className="min-w-0 space-y-1">
            {/* Só muda quando o veredito muda: os números não são anunciados a cada lote. */}
            <h2
              id="campaign-verdict"
              aria-live="polite"
              className="font-heading text-xl leading-tight font-semibold tracking-tight text-balance md:text-2xl"
            >
              {t(`campaigns.health.${health.kind}.title`)}
            </h2>
            <p className="max-w-2xl text-sm text-pretty text-muted-foreground">{description}</p>
          </div>
        </div>

        {running ? (
          <dl className="flex shrink-0 flex-wrap gap-x-6 gap-y-2 text-sm lg:justify-end lg:text-right">
            <Fact label={t("campaigns.monitor.live.label")}>
              <LiveIndicator connected={connected} />
            </Fact>
            {rate >= 1 ? (
              <Fact label={t("campaigns.monitor.rate.label")}>
                {t("campaigns.monitor.rate.value", { rate: formatNumber(Math.round(rate), language) })}
              </Fact>
            ) : null}
            {showEta && eta !== null ? (
              <Fact label={t("campaigns.monitor.eta")}>{formatWhen(eta, language, t, now)}</Fact>
            ) : null}
          </dl>
        ) : null}
      </div>

      {notStarted ? null : (
        <>
          <div className="flex items-center gap-3">
            <LiveNumber
              value={Math.round(progressRatio(numbers) * 100)}
              format={(value) => formatPercent(value / 100, language, { maximumFractionDigits: 0 })}
              className="font-heading w-14 shrink-0 text-2xl leading-none font-semibold tracking-tight"
            />
            <DeliveryBar numbers={numbers} className="flex-1" />
          </div>

          {/* A legenda da barra: cada número é também o atalho para ver quem está ali. */}
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-6">
            <NumberCell
              color={DELIVERY_COLORS.sent}
              label={t("campaigns.numbers.sent")}
              value={numbers.sent}
              caption={t("campaigns.numbers.ofList", { share: percentOf(numbers.sent, numbers.total) })}
              onClick={() => onFilterRecipients(["sent", "delivered", "read"])}
            />
            <NumberCell
              color={DELIVERY_COLORS.delivered}
              label={t("campaigns.numbers.delivered")}
              value={numbers.delivered}
              caption={t("campaigns.numbers.ofSent", { share: percentOf(numbers.delivered, numbers.sent) })}
              onClick={() => onFilterRecipients(["delivered", "read"])}
            />
            <NumberCell
              color={DELIVERY_COLORS.read}
              label={t("campaigns.numbers.read")}
              value={numbers.read}
              caption={t("campaigns.numbers.ofDelivered", { share: percentOf(numbers.read, numbers.delivered) })}
              onClick={() => onFilterRecipients(["read"])}
            />
            {numbers.replied !== null ? (
              <NumberCell
                label={t("campaigns.numbers.replied")}
                value={numbers.replied}
                caption={t("campaigns.numbers.ofSent", { share: percentOf(numbers.replied, numbers.sent) })}
                onClick={() => onFilterRecipients(["replied"])}
              />
            ) : null}
            <NumberCell
              color={DELIVERY_COLORS.failed}
              label={t("campaigns.numbers.failed")}
              value={numbers.failed}
              caption={t("campaigns.numbers.ofList", { share: percentOf(numbers.failed, numbers.total) })}
              onClick={() => onFilterRecipients(["failed"])}
            />
            {skipped > 0 ? (
              <NumberCell
                color={DELIVERY_COLORS.pending}
                label={t("campaigns.numbers.skipped")}
                value={skipped}
                caption={t("campaigns.numbers.ofList", { share: percentOf(skipped, numbers.total) })}
                onClick={() => onFilterRecipients(["skipped"])}
              />
            ) : (
              <NumberCell
                color={DELIVERY_COLORS.pending}
                label={t("campaigns.numbers.pending")}
                value={pending}
                caption={t("campaigns.numbers.ofList", { share: percentOf(pending, numbers.total) })}
                onClick={() => onFilterRecipients(["pending", "sending"])}
              />
            )}
          </div>
        </>
      )}

      {error && !data ? (
        <div className="rounded-lg border border-dashed">
          <InlineError onRetry={() => void mutate()} />
        </div>
      ) : null}

      <HeroActions
        kind={health.kind}
        campaignId={campaign.id}
        onShowFailures={() => onFilterRecipients(["failed"])}
      />
    </section>
  )
})

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{children}</dd>
    </div>
  )
}

function LiveIndicator({ connected }: { connected: boolean }) {
  const { t } = useTranslation()

  if (!connected) {
    return <span className="font-normal text-muted-foreground">{t("campaigns.monitor.live.polling")}</span>
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className="relative flex size-2">
        <span className="absolute inset-0 rounded-full bg-status-success motion-safe:animate-ping" />
        <span className="relative size-2 rounded-full bg-status-success" />
      </span>
      {t("campaigns.monitor.live.on")}
    </span>
  )
}

function NumberCell({
  color,
  label,
  value,
  caption,
  onClick,
}: {
  color?: string
  label: string
  value: number
  caption: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-w-0 flex-col items-start gap-0.5 rounded-lg px-2 py-2 text-left transition-colors outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="flex max-w-full items-center gap-1.5 text-xs text-muted-foreground">
        {color ? (
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-[2px] ring-1 ring-foreground/10"
            style={{ backgroundColor: color }}
          />
        ) : null}
        <span className="truncate">{label}</span>
      </span>
      <LiveNumber value={value} className="font-heading text-xl leading-tight font-semibold tracking-tight" />
      <span className="max-w-full truncate text-xs text-muted-foreground">{caption}</span>
    </button>
  )
}

function HeroActions({
  kind,
  campaignId,
  onShowFailures,
}: {
  kind: HealthKind
  campaignId: string
  onShowFailures: () => void
}) {
  const { t } = useTranslation()
  const canSeeChannels = useCan(CHANNELS_PERMISSION)

  if (kind === "pausedNoChannel" || kind === "pausedChannelFailing") {
    if (!canSeeChannels) return null

    return (
      <div className="flex flex-wrap gap-2">
        <Button
          nativeButton={false}
          variant="outline"
          size="sm"
          className="pointer-coarse:h-10"
          render={<Link to={CHANNELS_PATH} />}
        >
          {t("campaigns.actions.seeChannels")}
        </Button>
      </div>
    )
  }
  if (kind === "someFailures" || kind === "manyFailures" || kind === "finishedWithFailures") {
    return (
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="pointer-coarse:h-10"
          onClick={onShowFailures}
        >
          {t("campaigns.monitor.seeFailures")}
        </Button>
      </div>
    )
  }
  if (kind === "draft") {
    return (
      <div className="flex flex-wrap gap-2">
        <Button
          nativeButton={false}
          size="sm"
          className="pointer-coarse:h-10"
          render={<Link to={`/campaigns/${campaignId}/edit`} />}
        >
          {t("campaigns.actions.continueEditing")}
        </Button>
      </div>
    )
  }
  return null
}
