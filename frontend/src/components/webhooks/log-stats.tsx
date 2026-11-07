import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import { InlineError, StatTile } from "@/components/shared"
import { formatNumber, formatPercent } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import type { WebhookDayStats, WebhookLogStats } from "@/lib/webhooks/types"

import { formatMs } from "./log-detail-panel"

// Os indicadores do histórico: uma fileira de números, com a tendência em miniatura onde ela diz alguma coisa. Sem
// gráfico: a pergunta aqui é "está dando erro?" e "desde quando?", e o número e a linha respondem. A cor fica nos selos da
// lista, porque status é para o que tem estado, e não para enfeitar número.

const DAY_MS = 24 * 60 * 60 * 1000

/** A API só devolve os dias com requisição. Sem os zeros, uma semana parada desapareceria da linha. */
function fillDays(daily: Record<string, WebhookDayStats>, periodDays: number): WebhookDayStats[] {
  const keys = Object.keys(daily).sort()
  const empty: WebhookDayStats = { total: 0, success: 0, error: 0, skipped: 0 }
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`).getTime()
  const lastKey = keys.at(-1)
  const end = lastKey ? Math.max(today, new Date(`${lastKey}T00:00:00Z`).getTime()) : today
  const series: WebhookDayStats[] = []
  for (let offset = periodDays - 1; offset >= 0; offset -= 1) {
    const key = new Date(end - offset * DAY_MS).toISOString().slice(0, 10)
    series.push(daily[key] ?? empty)
  }
  return series
}

export function LogStats({ stats, loading, onRetry }: { stats: WebhookLogStats | null; loading: boolean; onRetry: () => void }) {
  const { t } = useTranslation()
  const language = useLanguage()

  const series = useMemo(() => (stats ? fillDays(stats.dailyStats, stats.periodDays) : []), [stats])

  if (loading && !stats) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <StatTile key={index} label="" value={0} loading />
        ))}
      </div>
    )
  }
  if (!stats) return <InlineError onRetry={onRetry} />

  const total = stats.totalRequests
  const executed = stats.successCount + stats.errorCount
  const rate = executed > 0 ? stats.successCount / executed : null

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile
        label={t("webhooks.logs.stats.total")}
        value={total}
        sparkline={series.map((day) => day.total)}
        hint={stats.skippedCount > 0 ? t("webhooks.logs.stats.skipped", { count: stats.skippedCount }) : undefined}
      />
      <StatTile
        label={t("webhooks.logs.stats.success")}
        value={stats.successCount}
        hint={rate !== null ? t("webhooks.logs.stats.rate", { value: formatPercent(rate, language) }) : undefined}
      />
      <StatTile
        label={t("webhooks.logs.stats.errors")}
        value={stats.errorCount}
        sparkline={series.map((day) => day.error)}
        formatSparklineValue={(value) => formatNumber(value, language)}
        hint={stats.errorCount === 0 && total > 0 ? t("webhooks.logs.stats.noErrors") : undefined}
      />
      <StatTile
        label={t("webhooks.logs.stats.average")}
        value={stats.avgProcessingTimeMs > 0 ? (formatMs(stats.avgProcessingTimeMs, language) ?? "") : t("webhooks.logs.stats.noAverage")}
        hint={t("webhooks.logs.stats.averageHint")}
      />
    </div>
  )
}
