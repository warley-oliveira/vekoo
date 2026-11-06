import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { ArrowDown, Trophy } from "lucide-react"

import { SectionCard } from "@/components/shared"
import { formatNumber, formatPercent } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import type { PeriodMetrics } from "@/lib/pipelines-admin/types"
import { cn } from "@/lib/utils"
import { StageDot } from "../settings/stages-section"

/**
 * Dos cards que entraram no período, até onde eles chegaram. A etapa que mais perde gente leva o
 * acento: é ali que vale olhar. As etapas estão em ordem e escritas, então a cor não precisa dizer a
 * ordem, e a tela continua quase sem cor.
 */
export function StageConversion({
  conversion,
  isCrm,
}: {
  conversion: PeriodMetrics["stageConversion"]
  isCrm: boolean
}) {
  const { t } = useTranslation()
  const language = useLanguage()

  const rows = useMemo(() => {
    const stages = conversion.stages.map((stage) => ({
      id: stage.stageId,
      name: stage.stageName,
      color: stage.color,
      reached: stage.reached,
      won: false,
    }))
    if (isCrm) {
      stages.push({
        id: "won",
        name: t("pipelinesAdmin.metrics.conversion.won"),
        color: null,
        reached: conversion.won,
        won: true,
      })
    }
    return stages
  }, [conversion, isCrm, t])

  const biggestDrop = useMemo(() => {
    let index = -1
    let largest = 0
    rows.forEach((row, position) => {
      const next = rows[position + 1]
      if (!next) return
      const drop = row.reached - next.reached
      if (drop > largest) {
        largest = drop
        index = position
      }
    })
    return index
  }, [rows])

  const top = Math.max(...rows.map((row) => row.reached), 1)

  return (
    <SectionCard
      title={t("pipelinesAdmin.metrics.conversion.title")}
      description={t("pipelinesAdmin.metrics.conversion.description", { count: conversion.cohort })}
    >
      {conversion.cohort === 0 ? (
        <p className="text-sm text-muted-foreground">{t("pipelinesAdmin.metrics.conversion.empty")}</p>
      ) : (
        <ol className="flex flex-col">
          {rows.map((row, position) => {
            const next = rows[position + 1]
            const rate = next && row.reached > 0 ? next.reached / row.reached : null
            const isDrop = position === biggestDrop

            return (
              <li key={row.id} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    {row.won ? (
                      <Trophy aria-hidden className="size-3 shrink-0 text-muted-foreground" />
                    ) : (
                      <StageDot color={row.color} />
                    )}
                    <span className="truncate">{row.name}</span>
                  </span>
                  <span className="shrink-0 font-medium tabular-nums">{formatNumber(row.reached, language)}</span>
                </div>
                <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-muted">
                  {row.reached > 0 ? (
                    <div
                      className={cn(
                        "h-full origin-left rounded-full motion-safe:transition-transform motion-safe:duration-300",
                        isDrop ? "bg-primary" : "bg-chart-2"
                      )}
                      style={{ transform: `scaleX(${row.reached / top})` }}
                    />
                  ) : null}
                </div>
                {rate !== null ? (
                  <p
                    className={cn(
                      "flex items-center gap-1 py-1.5 text-xs text-muted-foreground",
                      isDrop && "font-medium text-foreground"
                    )}
                  >
                    <ArrowDown aria-hidden className="size-3 shrink-0" />
                    {t("pipelinesAdmin.metrics.conversion.continued", {
                      percent: formatPercent(rate, language, { maximumFractionDigits: 0 }),
                    })}
                    {isDrop ? ` · ${t("pipelinesAdmin.metrics.conversion.biggestDrop")}` : ""}
                  </p>
                ) : null}
              </li>
            )
          })}
        </ol>
      )}
    </SectionCard>
  )
}
