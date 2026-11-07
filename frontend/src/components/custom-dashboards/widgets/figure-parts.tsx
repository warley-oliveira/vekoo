import { useTranslation } from "react-i18next"
import { ArrowDownRight, ArrowUpRight, CircleAlert, CircleCheck, Minus, TriangleAlert, Sparkles } from "lucide-react"

import { StatusBadge, type StatusTone } from "@/components/shared"
import { formatPercent } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import type { ConditionalRule, VisualConfig } from "@/lib/custom-dashboards/types"
import { cn } from "@/lib/utils"

// As peças dos cards de número. A cor nunca fica no número: ele é lido em tinta, e o que muda é o selo ao lado, com ícone e
// texto, para ninguém depender de distinguir verde de vermelho.

/** A primeira faixa que casa, na ordem em que foi escrita. */
export function matchRule(rules: ConditionalRule[] | undefined, value: number | null): ConditionalRule | null {
  if (!rules?.length || value === null || !Number.isFinite(value)) return null

  for (const rule of rules) {
    const hit =
      (rule.operator === "gt" && value > rule.value) ||
      (rule.operator === "gte" && value >= rule.value) ||
      (rule.operator === "lt" && value < rule.value) ||
      (rule.operator === "lte" && value <= rule.value) ||
      (rule.operator === "eq" && value === rule.value)
    if (hit) return rule
  }
  return null
}

const TONES: Record<string, { tone: StatusTone; icon: typeof CircleCheck; label: string }> = {
  "tone-success": { tone: "success", icon: CircleCheck, label: "good" },
  "tone-warning": { tone: "warning", icon: TriangleAlert, label: "attention" },
  "tone-danger": { tone: "danger", icon: CircleAlert, label: "critical" },
  "tone-accent": { tone: "accent", icon: Sparkles, label: "highlight" },
}

/** O selo de uma faixa. Cor livre (da origem, ou escolhida à mão) sai como um ponto, sem dizer "bom" ou "ruim". */
export function RuleBadge({ rule }: { rule: ConditionalRule | null }) {
  const { t } = useTranslation()
  if (!rule) return null

  const known = TONES[rule.color]
  if (!known) {
    return <span aria-hidden className="inline-block size-2.5 rounded-full" style={{ backgroundColor: rule.color }} />
  }

  const Icon = known.icon
  return (
    <StatusBadge tone={known.tone} icon={<Icon />}>
      {t(`customDashboards.rules.tones.${known.label}`)}
    </StatusBadge>
  )
}

type DeltaLineProps = {
  current: number | null | undefined
  previous: number | null | undefined
  config: Pick<VisualConfig, "goodWhen" | "comparisonLabel">
  className?: string
}

/** A variação contra o período anterior. Sem base (o anterior era zero), não há percentual que diga alguma coisa. */
export function DeltaLine({ current, previous, config, className }: DeltaLineProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const label = config.comparisonLabel || t("customDashboards.figure.vsPrevious")

  if (previous === undefined) {
    return config.comparisonLabel ? <p className={cn("text-xs text-muted-foreground", className)}>{config.comparisonLabel}</p> : null
  }
  if (previous === null || current === null || current === undefined || previous === 0) {
    return <p className={cn("text-xs text-muted-foreground", className)}>{t("customDashboards.figure.noBase")}</p>
  }

  const ratio = (current - previous) / Math.abs(previous)
  const direction = Math.sign(ratio)
  const good = (config.goodWhen ?? "up") === "up" ? direction > 0 : direction < 0
  const Icon = direction === 0 ? Minus : direction > 0 ? ArrowUpRight : ArrowDownRight

  return (
    <p className={cn("flex min-w-0 flex-wrap items-center gap-x-1 text-xs text-muted-foreground", className)}>
      <span
        className={cn(
          "inline-flex items-center gap-0.5 font-medium",
          direction === 0 ? "text-muted-foreground" : good ? "text-status-success" : "text-status-danger"
        )}
      >
        <Icon aria-hidden className="size-3.5" />
        {formatPercent(ratio, language, { signed: true })}
      </span>
      {label}
    </p>
  )
}
