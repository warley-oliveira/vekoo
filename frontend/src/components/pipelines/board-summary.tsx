import { memo, useMemo } from "react"
import { useTranslation } from "react-i18next"

import { formatCurrency, formatPercent } from "@/lib/format-number"
import { boardSummary } from "@/lib/pipelines/card-meta"
import { formatDealValue } from "@/lib/pipelines/format"
import type { StageWithCards } from "@/lib/pipelines/types"

function Item({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div title={hint} className="flex shrink-0 items-baseline gap-1.5 whitespace-nowrap">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium tabular-nums">{value}</dd>
    </div>
  )
}

/**
 * O resumo do pipeline de vendas, numa linha só e sem caixas: o quadro é o protagonista. Conta o
 * que está na tela, então acompanha o filtro.
 */
export const BoardSummaryStrip = memo(function BoardSummaryStrip({
  stages,
  language,
}: {
  stages: StageWithCards[]
  language: string
}) {
  const { t } = useTranslation()
  const summary = useMemo(() => boardSummary(stages), [stages])

  return (
    <dl
      aria-label={t("pipelines.summary.title")}
      className="flex min-w-0 items-baseline gap-x-5 overflow-x-auto [scrollbar-width:none]"
    >
      <Item
        label={t("pipelines.summary.open")}
        value={formatCurrency(summary.openValue, language, { maximumFractionDigits: 0 })}
        hint={t("pipelines.summary.openHint", { count: summary.openCount })}
      />
      <Item
        label={t("pipelines.summary.weighted")}
        value={formatDealValue(summary.weightedValue, language)}
        hint={t("pipelines.summary.weightedHint")}
      />
      <Item
        label={t("pipelines.summary.average")}
        value={formatDealValue(summary.averageDeal, language)}
        hint={t("pipelines.summary.averageHint")}
      />
      <Item
        label={t("pipelines.summary.conversion")}
        value={
          summary.conversionRate === null
            ? t("pipelines.summary.noConversion")
            : formatPercent(summary.conversionRate, language)
        }
        hint={t("pipelines.summary.conversionHint")}
      />
      <Item
        label={t("pipelines.summary.won")}
        value={formatDealValue(summary.wonValue, language)}
        hint={t("pipelines.summary.wonHint")}
      />
    </dl>
  )
})
