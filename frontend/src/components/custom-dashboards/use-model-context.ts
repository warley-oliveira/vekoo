import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import { useLanguage } from "@/lib/i18n"
import { useAuth } from "@/lib/auth"
import type { ModelContext } from "@/lib/custom-dashboards/chart-model"
import type { DataSourceMeta } from "@/lib/custom-dashboards/types"

/** O que o modelo do gráfico precisa da tela: o idioma, o fuso da organização e os poucos textos dele. */
export function useModelContext(source: DataSourceMeta | undefined): ModelContext {
  const { t } = useTranslation()
  const language = useLanguage()
  const timeZone = useAuth().session?.organization.timezone

  return useMemo(
    () => ({
      language,
      timeZone,
      source,
      text: {
        none: t("customDashboards.values.none"),
        removed: t("customDashboards.values.removed"),
        other: t("customDashboards.values.other"),
        total: t("customDashboards.values.total"),
        week: (date: string) => t("customDashboards.values.weekOf", { date }),
      },
    }),
    [language, source, t, timeZone]
  )
}
