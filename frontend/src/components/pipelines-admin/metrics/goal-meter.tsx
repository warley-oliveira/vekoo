import { useTranslation } from "react-i18next"
import { Check } from "lucide-react"

import { Money } from "@/components/shared"
import { formatPercent } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/** Quanto falta para a meta: o medidor e os números, sempre escritos. Bateu a meta, avisa com palavra. */
export function GoalMeter({
  actual,
  target,
  percentage,
  label,
}: {
  actual: number
  target: number
  percentage: number
  label: string
}) {
  const { t } = useTranslation()
  const language = useLanguage()
  const reached = percentage >= 100
  const width = Math.min(100, Math.max(0, percentage))

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
        <span className="min-w-0">
          <Money value={actual} className="font-medium" />
          <span className="text-muted-foreground">
            {" "}
            {t("pipelinesAdmin.goals.of")} <Money value={target} />
          </span>
        </span>
        <span className={cn("shrink-0 font-medium tabular-nums", reached && "text-status-success")}>
          {reached ? <Check aria-hidden className="mr-0.5 inline size-3.5 align-[-2px]" /> : null}
          {formatPercent(percentage / 100, language)}
        </span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(width)}
        aria-valuetext={t("pipelinesAdmin.goals.meterText", {
          percent: formatPercent(percentage / 100, language),
        })}
        className={cn("h-2 overflow-hidden rounded-full", reached ? "bg-status-success-soft" : "bg-primary/15")}
      >
        <div
          className={cn(
            "h-full origin-left rounded-full motion-safe:transition-transform motion-safe:duration-300",
            reached ? "bg-status-success" : "bg-primary"
          )}
          style={{ transform: `scaleX(${width / 100})` }}
        />
      </div>
    </div>
  )
}
