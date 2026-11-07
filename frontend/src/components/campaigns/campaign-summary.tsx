import { memo } from "react"
import { useTranslation } from "react-i18next"

import { InlineError, StatTile } from "@/components/shared"
import { reloadCampaignSummary, useCampaignSummary } from "@/hooks/campaigns/use-campaigns"
import { shareOf } from "@/lib/campaigns/progress"
import { formatNumber, formatPercent } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"

/**
 * Os números do topo, da organização inteira. Assina o resumo por conta própria: quando ele muda, é
 * só isto que re-renderiza, e não a lista.
 */
export const CampaignSummaryTiles = memo(function CampaignSummaryTiles() {
  const { t } = useTranslation()
  const language = useLanguage()
  const { data, error, isLoading } = useCampaignSummary()
  const summary = data?.summary

  if (error && !summary) {
    return (
      <div className="rounded-lg border border-dashed">
        <InlineError onRetry={() => void reloadCampaignSummary()} />
      </div>
    )
  }

  const loading = isLoading && !summary
  const percent = (ratio: number | null) =>
    ratio === null ? t("kit.noValue") : formatPercent(ratio, language, { maximumFractionDigits: 0 })
  const sent = summary?.sent ?? 0

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <StatTile
        className="col-span-2 lg:col-span-1"
        loading={loading}
        label={t("campaigns.summary.running")}
        value={summary?.byStatus.running ?? 0}
        hint={t("campaigns.summary.runningHint", {
          count: summary?.total ?? 0,
          formatted: formatNumber(summary?.total ?? 0, language),
        })}
      />
      <StatTile
        loading={loading}
        label={t("campaigns.summary.sent")}
        value={sent}
        hint={t("campaigns.summary.sentHint", {
          count: summary?.delivered ?? 0,
          formatted: formatNumber(summary?.delivered ?? 0, language),
        })}
      />
      <StatTile
        loading={loading}
        label={t("campaigns.summary.read")}
        value={percent(shareOf(summary?.read ?? 0, sent))}
        hint={t("campaigns.summary.readHint", {
          read: formatNumber(summary?.read ?? 0, language),
          sent: formatNumber(sent, language),
        })}
      />
      {summary?.replied !== undefined || loading ? (
        <StatTile
          loading={loading}
          label={t("campaigns.summary.replied")}
          value={summary?.replied ?? 0}
          hint={t("campaigns.summary.repliedHint", {
            share: percent(shareOf(summary?.replied ?? 0, sent)),
          })}
        />
      ) : null}
      <StatTile
        loading={loading}
        label={t("campaigns.summary.failed")}
        value={summary?.failed ?? 0}
        hint={t("campaigns.summary.failedHint", {
          share: percent(shareOf(summary?.failed ?? 0, sent + (summary?.failed ?? 0))),
        })}
      />
    </div>
  )
})
