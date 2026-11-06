import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import { endOfDay, startOfDay } from "@/lib/date-format"

export type DateRangeValue = {
  /** Início do primeiro dia. */
  from: Date
  /** Fim do último dia, pronto para o filtro incluir o dia inteiro. */
  to: Date
}

export type DateRangePreset = {
  id: string
  label: string
  range: () => DateRangeValue
}

const DAY = 24 * 60 * 60 * 1000

function lastDays(count: number): DateRangeValue {
  const now = new Date()
  return {
    from: startOfDay(new Date(now.getTime() - (count - 1) * DAY)),
    to: endOfDay(now),
  }
}

/** Os períodos mais pedidos em filtros e painéis. Passe `presets` para trocar. */
export function useDateRangePresets(): DateRangePreset[] {
  const { t } = useTranslation()

  return useMemo(
    () => [
      { id: "today", label: t("kit.date.presets.today"), range: () => lastDays(1) },
      {
        id: "yesterday",
        label: t("kit.date.presets.yesterday"),
        range: () => {
          const yesterday = new Date(Date.now() - DAY)
          return { from: startOfDay(yesterday), to: endOfDay(yesterday) }
        },
      },
      { id: "7d", label: t("kit.date.presets.last7"), range: () => lastDays(7) },
      { id: "30d", label: t("kit.date.presets.last30"), range: () => lastDays(30) },
      {
        id: "month",
        label: t("kit.date.presets.thisMonth"),
        range: () => {
          const now = new Date()
          return {
            from: new Date(now.getFullYear(), now.getMonth(), 1),
            to: endOfDay(now),
          }
        },
      },
      {
        id: "last-month",
        label: t("kit.date.presets.lastMonth"),
        range: () => {
          const now = new Date()
          return {
            from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
            to: endOfDay(new Date(now.getFullYear(), now.getMonth(), 0)),
          }
        },
      },
    ],
    [t]
  )
}
