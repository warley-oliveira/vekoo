import { useCallback } from "react"
import { useTranslation } from "react-i18next"

import type { FormulaError } from "@/lib/custom-dashboards/formula-engine"

/** O motor das fórmulas não fala nenhuma língua: ele leva um código, e a tela escreve a frase. */
export function useFormulaErrorMessage() {
  const { t } = useTranslation()

  return useCallback(
    (error: FormulaError) => t(`customDashboards.formula.errors.${error.code}`, { ...error.params }),
    [t]
  )
}
