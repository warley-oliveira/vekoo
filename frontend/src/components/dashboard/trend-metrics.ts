import type { DashboardPeriod } from "@/hooks/insights/use-dashboard-period"
import type { DashboardReport } from "./types"

export const TREND_METRICS = ["newChats", "automationChats", "activeChats", "messages"] as const
export type TrendMetric = (typeof TREND_METRICS)[number]

export function metricRows(report: DashboardReport, metric: TrendMetric): { date: string; value: number }[] {
  if (metric === "messages") {
    return report.messageVolume.map((point) => ({
      date: point.date,
      value: point.inbound + point.automation + point.human,
    }))
  }
  return report[metric].map((point) => ({ date: point.date, value: point.count }))
}

/**
 * A variação só faz sentido contra um período inteiro: a série começa no primeiro dia com número, e um
 * período anterior pela metade daria um "+300%" que não existe.
 */
export function comparableReport(
  previous: DashboardReport | undefined,
  period: DashboardPeriod
): DashboardReport | null {
  if (!previous?.hasData || !period.previous) return null
  return previous.newChats.length >= period.previous.days ? previous : null
}

/** Razão entre os totais. Sem base, sem variação: "de 0 para 12" não é uma porcentagem. */
export function growth(current: number, previous: number): number | null {
  return previous > 0 ? (current - previous) / previous : null
}
