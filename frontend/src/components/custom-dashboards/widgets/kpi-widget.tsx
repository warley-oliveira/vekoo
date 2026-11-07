import { useTranslation } from "react-i18next"

import { useLanguage } from "@/lib/i18n"
import { formatCompactValue, formatValue } from "@/lib/custom-dashboards/format"
import { matchRule } from "@/lib/custom-dashboards/rules"
import type { VisualConfig } from "@/lib/custom-dashboards/types"

import { DeltaLine, RuleBadge } from "./figure-parts"

type KpiWidgetProps = {
  value: number | null
  previous?: number | null
  config: VisualConfig
}

const DEFAULT_SIZE = 28

/** Um número e o que ele significa. Sem ícone em círculo nem cor no número: a hierarquia é tipográfica. */
export function KpiWidget({ value, previous, config }: KpiWidgetProps) {
  const { t } = useTranslation()
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
      {value === null ? (
        <p className="text-xs text-muted-foreground">{t("customDashboards.figure.noData")}</p>
      ) : (
        <DeltaLine current={value} previous={previous} config={config} />
      )}
    </div>
  )
}
