import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { DateRangePicker, SegmentedControl } from "@/components/shared"
import { useIsMobile } from "@/hooks/use-is-mobile"
import {
  MAX_RANGE_DAYS,
  PERIOD_PRESETS,
  rangeDays,
  type DashboardPeriod,
  type PeriodPreset,
} from "@/hooks/insights/use-dashboard-period"

/** Os atalhos, um toque só. Em 390 px, a forma curta, para os seis caberem sem rolar. */
export function PeriodPresets({
  period,
  onPreset,
  className,
}: {
  period: DashboardPeriod
  onPreset: (preset: PeriodPreset) => void
  className?: string
}) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()

  return (
    <SegmentedControl<PeriodPreset | "custom">
      aria-label={t("dashboard.period.label")}
      fullWidth={isMobile}
      className={className}
      // Num intervalo à mão, nenhum atalho acende.
      value={period.preset ?? "custom"}
      onChange={(value) => {
        if (value !== "custom") onPreset(value)
      }}
      options={PERIOD_PRESETS.map((preset) => ({
        value: preset,
        label: t(`dashboard.period.${isMobile ? "short" : "presets"}.${preset}`),
        "aria-label": t(`dashboard.period.presets.${preset}`),
      }))}
    />
  )
}

/** O intervalo: mostra sempre as datas valendo, e abre o calendário para escolher outras. */
export function PeriodPicker({
  period,
  onRange,
  className,
}: {
  period: DashboardPeriod
  onRange: (range: { from: Date; to: Date }) => void
  className?: string
}) {
  const { t } = useTranslation()

  return (
    <DateRangePicker
      required
      label={t("dashboard.period.custom")}
      aria-label={t("dashboard.period.custom")}
      className={className}
      value={{ from: period.from, to: period.to }}
      onChange={(range) => {
        if (!range) return
        if (rangeDays(range) > MAX_RANGE_DAYS) {
          toast.error(t("dashboard.period.tooLong"))
          return
        }
        onRange(range)
      }}
    />
  )
}
