import { useTranslation } from "react-i18next"
import { CircleDot, ThumbsDown, Trophy } from "lucide-react"

import { Money, SectionCard } from "@/components/shared"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import type { BoardMetrics } from "@/lib/pipelines-admin/types"

/**
 * Como os negócios do quadro estão divididos. Barra fina, sem texto: quem carrega os números é a lista
 * logo abaixo, com a amostra de cor em cada linha. Ganho e perdido querem dizer bom e ruim, então usam
 * os tons de status, sempre com ícone e palavra.
 */
export function DealSplit({ summary }: { summary: BoardMetrics["dealSummary"] }) {
  const { t } = useTranslation()
  const language = useLanguage()

  const parts = [
    {
      id: "open",
      label: t("pipelinesAdmin.metrics.deals.open"),
      count: summary.openCount,
      value: summary.openValue,
      swatch: "bg-status-neutral",
      icon: <CircleDot aria-hidden className="size-3.5 text-status-neutral" />,
    },
    {
      id: "won",
      label: t("pipelinesAdmin.metrics.deals.won"),
      count: summary.wonCount,
      value: summary.wonValue,
      swatch: "bg-status-success",
      icon: <Trophy aria-hidden className="size-3.5 text-status-success" />,
    },
    {
      id: "lost",
      label: t("pipelinesAdmin.metrics.deals.lost"),
      count: summary.lostCount,
      value: summary.lostValue,
      swatch: "bg-status-danger",
      icon: <ThumbsDown aria-hidden className="size-3.5 text-status-danger" />,
    },
  ]
  const total = parts.reduce((sum, part) => sum + part.count, 0)

  return (
    <SectionCard
      title={t("pipelinesAdmin.metrics.deals.title")}
      description={t("pipelinesAdmin.metrics.deals.description")}
    >
      {total === 0 ? (
        <p className="text-sm text-muted-foreground">{t("pipelinesAdmin.metrics.deals.empty")}</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div aria-hidden className="flex h-2 gap-0.5 overflow-hidden rounded-full">
            {parts
              .filter((part) => part.count > 0)
              .map((part) => (
                <div key={part.id} className={part.swatch} style={{ flexGrow: part.count, flexBasis: 0 }} />
              ))}
          </div>
          <ul className="flex flex-col gap-2">
            {parts.map((part) => (
              <li key={part.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  {part.icon}
                  <span className="truncate">{part.label}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {formatNumber(part.count, language)}
                  </span>
                </span>
                <Money value={part.value} className="shrink-0 font-medium" />
              </li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  )
}
