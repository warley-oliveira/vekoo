import { useTranslation } from "react-i18next"

import { Money, SectionCard, UserAvatar } from "@/components/shared"
import { apiAssetUrl } from "@/lib/api"
import { formatPercent } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import type { RankingEntry } from "@/lib/pipelines-admin/types"
import { cn } from "@/lib/utils"

/** Quem mais fechou no período, com o valor escrito e a barra só para comparar. */
export function RankingList({ ranking }: { ranking: RankingEntry[] }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const top = Math.max(...ranking.map((entry) => entry.wonValue), 0)

  return (
    <SectionCard
      title={t("pipelinesAdmin.metrics.ranking.title")}
      description={t("pipelinesAdmin.metrics.ranking.description")}
    >
      {ranking.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("pipelinesAdmin.metrics.ranking.empty")}</p>
      ) : (
        <ol className="flex flex-col gap-4">
          {ranking.map((entry, index) => (
            <li key={entry.user.id} className="flex items-center gap-3">
              <span className="w-4 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{index + 1}</span>
              <UserAvatar
                name={entry.user.name ?? ""}
                src={entry.user.avatarUrl ? apiAssetUrl(entry.user.avatarUrl) : undefined}
                size="sm"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate font-medium">{entry.user.name}</span>
                  <Money value={entry.wonValue} className="shrink-0 font-medium" />
                </div>
                <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-muted">
                  {entry.wonValue > 0 ? (
                    <div
                      className={cn(
                        "h-full origin-left rounded-full motion-safe:transition-transform motion-safe:duration-300",
                        index === 0 ? "bg-primary" : "bg-chart-2"
                      )}
                      style={{ transform: `scaleX(${top > 0 ? entry.wonValue / top : 0})` }}
                    />
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("pipelinesAdmin.metrics.ranking.detail", {
                    won: t("pipelinesAdmin.metrics.ranking.won", { count: entry.wonCount }),
                    lost: t("pipelinesAdmin.metrics.ranking.lost", { count: entry.lostCount }),
                    rate: formatPercent(entry.conversionRate / 100, language, { maximumFractionDigits: 0 }),
                  })}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  )
}
