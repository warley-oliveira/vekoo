import { useTranslation } from "react-i18next"

import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import type { ChartTableData } from "./chart-card"
import { formatRate } from "./format"
import type { StageRow } from "./funnel-stages"

/** A tabela gêmea do gráfico de etapas. */
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
