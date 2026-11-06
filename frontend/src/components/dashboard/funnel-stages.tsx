import { useTranslation } from "react-i18next"
import { ArrowDownRight } from "lucide-react"

import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { ChartTableData } from "./chart-card"
import { formatRate } from "./format"

// As etapas de um funil, em barras na mesma base. A cor é ordinal, um matiz só e do claro ao escuro:
// trocar a ordem das etapas muda o sentido, e a rampa mostra isso. Serve ao Dashboard e ao quadro.

/** Acima desta queda, a etapa é o gargalo. Vem da origem. */
const BOTTLENECK_DROP = 50

export type StageRow = {
  id: string
  name: string
  /** Estão na etapa. */
  count: number
  /** Chegaram até ela. */
  reached: number
  conversionRate: number
  stepRate: number
}

/** A posição na rampa de seis passos. Funil mais longo reparte os mesmos seis. */
export function stageColor(index: number, total: number): string {
  if (total <= 1) return "var(--viz-step-4)"
  return `var(--viz-step-${1 + Math.round((index / (total - 1)) * 5)})`
}

/** O maior tropeço, se chegar a metade. */
export function findBottleneck(stages: StageRow[]): { stage: StageRow; drop: number } | null {
  let worst: { stage: StageRow; drop: number } | null = null
  stages.forEach((stage, index) => {
    if (index === 0 || stages[index - 1].reached === 0) return
    const drop = 100 - stage.stepRate
    if (drop >= BOTTLENECK_DROP && (!worst || drop > worst.drop)) worst = { stage, drop }
  })
  return worst
}

export function FunnelStages({ stages }: { stages: StageRow[] }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const top = Math.max(...stages.map((stage) => stage.reached), 1)
  const bottleneck = findBottleneck(stages)

  return (
    <ol className="flex flex-col gap-3">
      {stages.map((stage, index) => {
        const isBottleneck = bottleneck?.stage.id === stage.id
        const drop = 100 - stage.stepRate
        return (
          <li key={stage.id} className="flex flex-col gap-1">
            <div className="flex items-baseline gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate" title={stage.name}>
                {stage.name}
              </span>
              <span className="font-medium tabular-nums">{formatNumber(stage.reached, language)}</span>
              <span className="w-12 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                {formatRate(stage.conversionRate, language)}
              </span>
            </div>
            <div
              aria-hidden
              className="h-3 rounded-r-[4px]"
              style={{
                backgroundColor: stageColor(index, stages.length),
                width: `${Math.max((stage.reached / top) * 100, stage.reached > 0 ? 1.5 : 0)}%`,
              }}
            />
            <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
              <span>
                {t("dashboard.funnel.inStage", {
                  count: stage.count,
                  value: formatNumber(stage.count, language),
                })}
              </span>
              {index > 0 && drop > 0 ? (
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5",
                    isBottleneck && "font-medium text-status-danger"
                  )}
                >
                  <ArrowDownRight aria-hidden className="size-3" />
                  {t("dashboard.funnel.drop", { value: formatRate(drop, language) })}
                </span>
              ) : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/** Conversão total e maior gargalo, em texto: é o que se quer saber do funil em uma linha. */
export function FunnelFootnote({ stages }: { stages: StageRow[] }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const last = stages[stages.length - 1]
  const bottleneck = findBottleneck(stages)
  if (!last) return null

  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
      <div className="flex gap-1">
        <dt>{t("dashboard.funnel.totalConversion")}</dt>
        <dd className="font-medium text-foreground tabular-nums">{formatRate(last.conversionRate, language)}</dd>
      </div>
      {bottleneck ? (
        <div className="flex min-w-0 gap-1">
          <dt className="shrink-0">{t("dashboard.funnel.bottleneck")}</dt>
          <dd className="truncate font-medium text-foreground">
            {t("dashboard.funnel.bottleneckValue", {
              name: bottleneck.stage.name,
              value: formatRate(bottleneck.drop, language),
            })}
          </dd>
        </div>
      ) : null}
    </dl>
  )
}

export function useStagesTable(stages: StageRow[]): ChartTableData {
  const { t } = useTranslation()
  const language = useLanguage()

  return {
    columns: [
      { key: "stage", label: t("dashboard.funnel.table.stage") },
      { key: "count", label: t("dashboard.funnel.table.count"), align: "right" },
      { key: "reached", label: t("dashboard.funnel.table.reached"), align: "right" },
      { key: "conversion", label: t("dashboard.funnel.table.conversion"), align: "right" },
    ],
    rows: stages.map((stage) => ({
      id: stage.id,
      cells: {
        stage: stage.name,
        count: formatNumber(stage.count, language),
        reached: formatNumber(stage.reached, language),
        conversion: formatRate(stage.conversionRate, language),
      },
    })),
  }
}
