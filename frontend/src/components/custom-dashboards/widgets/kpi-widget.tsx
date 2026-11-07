import { useLanguage } from "@/lib/i18n"
import { formatCompactValue, formatValue } from "@/lib/custom-dashboards/format"
import type { VisualConfig } from "@/lib/custom-dashboards/types"

import { DeltaLine, matchRule, RuleBadge } from "./figure-parts"

type KpiWidgetProps = {
  value: number | null
  previous?: number | null
  config: VisualConfig
}

const DEFAULT_SIZE = 28

/** Um número e o que ele significa. Sem ícone em círculo nem cor no número: a hierarquia é tipográfica. */
export function KpiWidget({ value, previous, config }: KpiWidgetProps) {
  const language = useLanguage()
  const rule = matchRule(config.conditionalRules, value)

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p
          title={formatValue(value, config, language)}
          className="font-heading leading-tight font-semibold tracking-tight whitespace-nowrap"
          style={{ fontSize: config.fontSize ?? DEFAULT_SIZE }}
        >
          {formatCompactValue(value, config, language)}
        </p>
        <RuleBadge rule={rule} />
      </div>
      <DeltaLine current={value} previous={previous} config={config} />
    </div>
  )
}
