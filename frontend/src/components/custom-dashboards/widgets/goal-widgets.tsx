import { useTranslation } from "react-i18next"

import { Meter } from "@/components/dashboard/bars"
import { formatPercent } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { formatCompactValue, formatValue } from "@/lib/custom-dashboards/format"
import { resolveColor } from "@/lib/custom-dashboards/palette"
import type { VisualConfig } from "@/lib/custom-dashboards/types"

import { matchRule, RuleBadge } from "./figure-parts"

type GoalProps = { value: number | null; config: VisualConfig }

const DEFAULT_GOAL = 100

/** Em meta, a faixa é sobre o percentual: "abaixo de 50% da meta". */
function useGoal({ value, config }: GoalProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const goal = config.goalValue && config.goalValue > 0 ? config.goalValue : DEFAULT_GOAL
  const number = value ?? 0
  const ratio = number / goal
  const rule = matchRule(config.conditionalRules, ratio * 100)

  return {
    ratio,
    rule,
    color: rule ? resolveColor(rule.color) : resolveColor(config.color, "var(--viz-accent)"),
    share: formatPercent(ratio, language),
    goalText: t("customDashboards.figure.goal", {
      label: config.goalLabel || t("customDashboards.figure.goalDefault"),
      value: formatValue(goal, config, language),
    }),
  }
}

// O arco de um medidor: 270 graus, abrindo embaixo.
const SIZE = 120
const STROKE = 10
const RADIUS = (SIZE - STROKE) / 2
const START = 135
const SWEEP = 270

function polar(angle: number) {
  const radians = (angle * Math.PI) / 180
  return { x: SIZE / 2 + RADIUS * Math.cos(radians), y: SIZE / 2 + RADIUS * Math.sin(radians) }
}

const start = polar(START)
const end = polar(START + SWEEP)
const ARC = `M ${start.x} ${start.y} A ${RADIUS} ${RADIUS} 0 1 1 ${end.x} ${end.y}`

/** Quanto falta para a meta, num arco. O trilho é da mesma família, e quem carrega o estado é a parte cheia. */
export function GaugeWidget(props: GoalProps) {
  const language = useLanguage()
  const { ratio, rule, color, share, goalText } = useGoal(props)
  const filled = Math.min(1, Math.max(0, ratio)) * 100

  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-1">
      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(Math.min(100, ratio * 100))}
        aria-valuetext={`${formatValue(props.value, props.config, language)}, ${share}. ${goalText}`}
        className="relative aspect-square max-h-full min-h-0 w-full max-w-40 flex-1"
      >
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="size-full">
          <path d={ARC} fill="none" stroke="var(--viz-track)" strokeWidth={STROKE} strokeLinecap="round" />
          {filled > 0 ? (
            <path
              d={ARC}
              fill="none"
              stroke={color}
              strokeWidth={STROKE}
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray={`${filled} 100`}
            />
          ) : null}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            title={formatValue(props.value, props.config, language)}
            className="font-heading leading-tight font-semibold tracking-tight whitespace-nowrap"
            style={{ fontSize: props.config.fontSize ?? 22 }}
          >
            {formatCompactValue(props.value, props.config, language)}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">{share}</span>
        </div>
      </div>
      <p className="flex flex-wrap items-center justify-center gap-x-2 text-center text-xs text-muted-foreground">
        {goalText}
        <RuleBadge rule={rule} />
      </p>
    </div>
  )
}

/** O mesmo, em linha reta: ocupa pouco, e cabe ao lado de outros números. */
export function ProgressWidget(props: GoalProps) {
  const language = useLanguage()
  const { ratio, rule, color, share, goalText } = useGoal(props)

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span
          title={formatValue(props.value, props.config, language)}
          className="font-heading leading-tight font-semibold tracking-tight whitespace-nowrap"
          style={{ fontSize: props.config.fontSize ?? 22 }}
        >
          {formatCompactValue(props.value, props.config, language)}
        </span>
        <span className="text-xs text-muted-foreground">{goalText}</span>
      </div>
      <Meter value={ratio * 100} label={goalText} valueText={share} color={color} />
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="tabular-nums">{share}</span>
        <RuleBadge rule={rule} />
      </div>
    </div>
  )
}
