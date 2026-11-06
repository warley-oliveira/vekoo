import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Zap } from "lucide-react"

import { StatTile, UserAvatar } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useIsMobile } from "@/hooks/use-is-mobile"
import { apiAssetUrl } from "@/lib/api"
import { formatNumber, formatPercent } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { Meter, RankedBars, type RankedItem } from "./bars"
import { CardEmpty, ChartCard, ChartLegend } from "./chart-card"
import { StackedColumns, type ColumnPoint, type ColumnSeries } from "./charts"
import { formatBucket, formatDayTick, formatDuration, formatHours, formatRate } from "./format"
import { bucketize, bucketSize, sum } from "./series"
import type { DashboardReport } from "./types"

/** Abaixo desta razão, a comparação entre automação e equipe não vira destaque. */
const HIGHLIGHT_RATIO = 1.5
/** Quantos da equipe aparecem de cara. A API manda até 20. */
const TEAM_VISIBLE = 6

type CardProps = { report: DashboardReport; className?: string }

/* ---------- volume de mensagens ---------- */

const VOLUME_KEYS = ["inbound", "automation", "human", "campaign"] as const

/**
 * A divisão mudando no tempo: colunas empilhadas. Recebidas em cinza, porque é o contexto; a cor
 * fica para quem respondeu. Sem campanha no período, a série some da legenda, e as outras mantêm a cor.
 */
export function MessageVolumeCard({ report, className }: CardProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const isMobile = useIsMobile()

  const size = bucketSize(report.messageVolume.length, isMobile)
  const buckets = useMemo(
    () => bucketize(report.messageVolume, VOLUME_KEYS, size),
    [report.messageVolume, size]
  )
  const data = useMemo<ColumnPoint[]>(
    () =>
      buckets.map((bucket) => ({
        id: bucket.to,
        tick: formatDayTick(bucket.from, language),
        title: formatBucket(bucket.from, bucket.to, language),
        inbound: bucket.inbound,
        automation: bucket.automation,
        human: bucket.human,
        campaign: bucket.campaign,
      })),
    [buckets, language]
  )

  const totals: Record<(typeof VOLUME_KEYS)[number], number> = {
    inbound: report.messagesInbound,
    automation: report.messagesSentByAutomation,
    human: report.messagesSentByHuman,
    campaign: report.messagesSentByCampaign,
  }

  const series: ColumnSeries[] = VOLUME_KEYS.filter(
    (key) => key !== "campaign" || totals.campaign > 0
  ).map((key) => ({
    key,
    label: t(`dashboard.volume.${key}`),
    color: `var(--viz-series-${key})`,
  }))

  const empty = sum(Object.values(totals)) === 0
  const granularity = t(`dashboard.granularity.${size === 1 ? "day" : size === 7 ? "week" : "month"}`)

  return (
    <ChartCard
      title={t("dashboard.volume.title")}
      description={t("dashboard.volume.description", { granularity })}
      className={className}
      summary={t("dashboard.volume.summary", {
        inbound: formatNumber(totals.inbound, language),
        automation: formatNumber(totals.automation, language),
        human: formatNumber(totals.human, language),
        campaign: formatNumber(totals.campaign, language),
      })}
      table={
        empty
          ? undefined
          : {
              columns: [
                { key: "date", label: t("dashboard.table.date") },
                ...series.map((entry) => ({ key: entry.key, label: entry.label, align: "right" as const })),
              ],
              rows: data.map((point) => ({
                id: point.id,
                cells: {
                  date: point.title,
                  inbound: formatNumber(Number(point.inbound), language),
                  automation: formatNumber(Number(point.automation), language),
                  human: formatNumber(Number(point.human), language),
                  campaign: formatNumber(Number(point.campaign), language),
                },
              })),
            }
      }
    >
      {empty ? (
        <CardEmpty title={t("dashboard.volume.emptyTitle")} description={t("dashboard.volume.emptyHint")} />
      ) : (
        <div className="flex flex-col gap-3">
          <ChartLegend
            items={series.map((entry) => ({
              key: entry.key,
              label: entry.label,
              color: entry.color,
              value: formatNumber(totals[entry.key as keyof typeof totals], language),
            }))}
          />
          <StackedColumns
            data={data}
            series={series}
            height={isMobile ? 200 : 240}
            totalLabel={(total) => t("dashboard.volume.total", { total })}
          />
        </div>
      )}
    </ChartCard>
  )
}

/* ---------- tempo de primeira resposta ---------- */

export function ResponseTimeCard({ report, className }: CardProps) {
  const { t } = useTranslation()
  const language = useLanguage()

  const rows = [
    {
      key: "automation",
      label: t("dashboard.responseTime.automation"),
      seconds: report.firstResponseAutomationSeconds,
      count: report.firstResponseAutomationCount,
    },
    {
      key: "human",
      label: t("dashboard.responseTime.team"),
      seconds: report.firstResponseHumanSeconds,
      count: report.firstResponseHumanCount,
    },
  ]
  // Barra proporcional ao tempo: mais longa é mais lenta.
  const slowest = Math.max(...rows.map((row) => row.seconds ?? 0), 1)
  const empty = rows.every((row) => row.seconds === null)

  const automation = report.firstResponseAutomationSeconds
  const human = report.firstResponseHumanSeconds
  const ratio = automation && human ? human / automation : null

  return (
    <ChartCard
      title={t("dashboard.responseTime.title")}
      description={t("dashboard.responseTime.description")}
      className={className}
      contentClassName="flex flex-col"
    >
      {empty ? (
        <CardEmpty
          title={t("dashboard.responseTime.emptyTitle")}
          description={t("dashboard.responseTime.emptyHint")}
        />
      ) : (
        <div className="flex h-full flex-col gap-5">
          {rows.map((row) => (
            <div key={row.key} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-muted-foreground">{row.label}</span>
                {row.seconds === null ? (
                  <span className="text-sm text-muted-foreground">{t("dashboard.responseTime.noSample")}</span>
                ) : (
                  <span className="font-heading text-2xl leading-tight font-semibold tracking-tight">
                    {formatDuration(row.seconds, language)}
                  </span>
                )}
              </div>
              <div
                aria-hidden
                className="h-1.5 rounded-r-full bg-(--viz-ink)"
                style={{
                  width: `${row.seconds ? Math.max((row.seconds / slowest) * 100, 2) : 0}%`,
                }}
              />
              <p className="text-xs text-muted-foreground">
                {t("dashboard.responseTime.sample", { count: row.count, value: formatNumber(row.count, language) })}
              </p>
            </div>
          ))}
          {ratio && ratio >= HIGHLIGHT_RATIO ? (
            <p className="mt-auto flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs">
              <Zap aria-hidden className="mt-px size-3.5 shrink-0 text-muted-foreground" />
              {t("dashboard.responseTime.ratio", {
                ratio: formatNumber(ratio, language, { maximumFractionDigits: 1 }),
              })}
            </p>
          ) : null}
        </div>
      )}
    </ChartCard>
  )
}

/* ---------- canais ---------- */

const KNOWN_CHANNELS = ["whatsapp_api", "instagram", "facebook", "web", "import_feature"]

/** Comparar as partes: barras ranqueadas de uma cor só, no lugar da rosca da origem. */
export function ChannelMixCard({ report, className }: CardProps) {
  const { t } = useTranslation()
  const language = useLanguage()

  const entries = Object.entries(report.chatsByChannel)
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a)
  const total = sum(entries.map(([, count]) => count))

  const items: RankedItem[] = entries.map(([channel, count]) => ({
    id: channel,
    label: KNOWN_CHANNELS.includes(channel) ? t(`dashboard.channels.${channel}`) : t("dashboard.channels.other"),
    value: count,
    valueLabel: formatNumber(count, language),
    shareLabel: formatPercent(count / total, language),
  }))

  return (
    <ChartCard
      title={t("dashboard.channels.title")}
      description={t("dashboard.channels.description")}
      className={className}
    >
      {items.length ? (
        <RankedBars items={items} />
      ) : (
        <CardEmpty title={t("dashboard.channels.emptyTitle")} description={t("dashboard.channels.emptyHint")} />
      )}
    </ChartCard>
  )
}

/* ---------- automação ---------- */

export function AutonomyCard({ report, className }: CardProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const rate = report.automationResolutionRate
  const rateLabel = formatRate(rate, language)

  return (
    <ChartCard
      title={t("dashboard.autonomy.title")}
      description={t("dashboard.autonomy.description")}
      className={className}
    >
      {report.chatsTotal === 0 ? (
        <CardEmpty title={t("dashboard.autonomy.emptyTitle")} description={t("dashboard.autonomy.emptyHint")} />
      ) : (
        <div className="flex flex-col gap-3">
          <p className="font-heading text-3xl leading-none font-semibold tracking-tight">{rateLabel}</p>
          <Meter
            value={rate}
            label={t("dashboard.autonomy.title")}
            valueText={rateLabel}
            color="var(--viz-accent)"
          />
          <p className="text-xs text-muted-foreground">
            {t("dashboard.autonomy.detail", {
              handled: formatNumber(report.chatsHandledByAutomation, language),
              total: formatNumber(report.chatsTotal, language),
            })}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("dashboard.autonomy.humanTouch", {
              count: report.chatsWithHumanTouch,
              value: formatNumber(report.chatsWithHumanTouch, language),
              rate: formatRate(report.humanTouchRate, language),
            })}
          </p>
        </div>
      )}
    </ChartCard>
  )
}

/** O que a automação poupou. Horas é estimativa, e o card diz isso em voz alta. */
export function AutomationTiles({ report, className }: CardProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const isMobile = useIsMobile()

  return (
    <div className={className}>
      <div className="grid h-full grid-cols-2 gap-3">
        <StatTile
          label={t("dashboard.automation.hoursSaved")}
          value={formatHours(report.hoursSaved, language)}
          hint={t("dashboard.automation.hoursSavedHint")}
        />
        <StatTile
          label={t("dashboard.automation.messagesAvoided")}
          value={report.messagesAvoided}
          hint={t("dashboard.automation.messagesAvoidedHint")}
        />
        <StatTile
          label={t("dashboard.automation.outOfHours")}
          value={report.outOfHoursMessages}
          hint={t("dashboard.automation.outOfHoursHint")}
        />
        <StatTile
          label={t(isMobile ? "dashboard.automation.bookingsShort" : "dashboard.automation.bookings")}
          value={report.automationBookings}
          hint={t("dashboard.automation.bookingsHint")}
        />
      </div>
    </div>
  )
}

/* ---------- equipe ---------- */

export function TeamRankingCard({ report, className }: CardProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const [showAll, setShowAll] = useState(false)

  const people = report.messagesByAccount
  const total = sum(people.map((person) => person.messages))
  const visible = showAll ? people : people.slice(0, TEAM_VISIBLE)

  const items: RankedItem[] = visible.map((person) => {
    const name = person.name ?? t("dashboard.team.removed")
    return {
      id: person.id,
      leading: (
        <UserAvatar
          name={name}
          src={person.avatarUrl ? apiAssetUrl(person.avatarUrl) : null}
          className="size-8"
        />
      ),
      label: name,
      title: name,
      value: person.messages,
      valueLabel: formatNumber(person.messages, language),
      shareLabel: total > 0 ? formatPercent(person.messages / total, language) : undefined,
    }
  })

  return (
    <ChartCard
      title={t("dashboard.team.title")}
      description={t("dashboard.team.description")}
      className={className}
      actions={
        people.length > TEAM_VISIBLE ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={showAll}
            onClick={() => setShowAll((current) => !current)}
          >
            {showAll ? t("dashboard.team.showLess") : t("dashboard.team.showAll", { count: people.length })}
          </Button>
        ) : undefined
      }
    >
      {items.length ? (
        <RankedBars items={items} />
      ) : (
        <CardEmpty title={t("dashboard.team.emptyTitle")} description={t("dashboard.team.emptyHint")} />
      )}
    </ChartCard>
  )
}
