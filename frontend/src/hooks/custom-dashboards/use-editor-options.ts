import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import type { SelectOption } from "@/components/shared"
import type { Aggregation, DataSourceMeta, FilterOptions } from "@/lib/custom-dashboards/types"

// As listas dos campos do editor: o que cada fonte deixa medir e filtrar.

export const CUSTOM_ATTRIBUTE_PREFIX = "custom_attributes."

const AGGREGATIONS: Aggregation[] = ["count", "sum", "avg", "max", "min"]

/** As contas que a fonte aceita e para as quais ela tem campo. "Quantidade" é o que quase todo mundo quer. */
export function useMeasureOptions(source: DataSourceMeta | undefined) {
  const { t } = useTranslation()
  return useMemo(() => {
    const numbers = source?.fields.filter((field) => field.type === "number") ?? []
    const dates = source?.fields.filter((field) => field.type === "date") ?? []
    const allowed = source?.allowedMetrics ?? ["count"]

    const fieldsFor = (aggregation: Aggregation) =>
      (aggregation === "sum" || aggregation === "avg" ? numbers : [...numbers, ...dates]).map((field) => ({
        value: field.key,
        label: field.label,
      }))

    const aggregations = AGGREGATIONS.filter(
      (aggregation) => allowed.includes(aggregation) && (aggregation === "count" || fieldsFor(aggregation).length > 0)
    ).map((aggregation) => ({ value: aggregation, label: t(`customDashboards.measure.${aggregation}`) }))

    return { aggregations, fieldsFor }
  }, [source, t])
}

/** Os campos para escolher num filtro: os da fonte, com cada campo personalizado como um campo de verdade. */
export function useFilterFieldOptions(source: DataSourceMeta | undefined, filterOptions: FilterOptions | undefined) {
  const { t } = useTranslation()
  return useMemo<SelectOption[]>(() => {
    const fields = (source?.fields ?? [])
      .filter((field) => field.type !== "custom_attribute")
      .map((field) => ({ value: field.key, label: field.label }))
    const custom = (filterOptions?.custom_attributes ?? []).map((item) => ({
      value: `${CUSTOM_ATTRIBUTE_PREFIX}${item.value}`,
      label: item.label,
      description: t("customDashboards.editor.customField"),
    }))
    return [...fields, ...custom]
  }, [filterOptions, source, t])
}
