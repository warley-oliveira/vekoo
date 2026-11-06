import { useApi } from "@/hooks/use-api"
import type { CalendarStats, DashboardReport } from "@/components/dashboard/types"
import type { PeriodSlice } from "./use-dashboard-period"

// As leituras do Dashboard. Sem revalidar ao voltar para a aba: o servidor guarda o relatório por
// 10 minutos e o rollup anda de hora em hora, então um refresh a cada foco só gasta rede.

const READ_OPTIONS = { revalidateOnFocus: false, keepPreviousData: true } as const

function periodQuery(period: Pick<PeriodSlice, "dateStart" | "dateEnd">): string {
  return new URLSearchParams({ dateStart: period.dateStart, dateEnd: period.dateEnd }).toString()
}

/** `null` pula a requisição: o período anterior não existe em "hoje". */
export function useDashboardReport(period: Pick<PeriodSlice, "dateStart" | "dateEnd"> | null) {
  const { data, error, isLoading, isValidating, mutate } = useApi<DashboardReport>(
    period ? `/dashboard?${periodQuery(period)}` : null,
    READ_OPTIONS
  )

  return { report: data, error, isLoading, isValidating, reload: () => mutate() }
}

/**
 * Sem período, a API olha o último ano. Só se chama quando o período escolhido veio vazio, para
 * saber a diferença entre "nada neste período" e "nada ainda".
 */
export function useAnyDashboardData(enabled: boolean) {
  const { data, isLoading } = useApi<DashboardReport>(enabled ? "/dashboard" : null, {
    revalidateOnFocus: false,
  })
  return { hasAnyData: data?.hasData ?? false, isChecking: enabled && isLoading }
}

/** Só carrega com a aba aberta, como na origem: o quadro é mais uma consulta na agenda. */
export function useCalendarStats(period: Pick<PeriodSlice, "dateStart" | "dateEnd">, enabled: boolean) {
  const { data, error, isLoading, isValidating, mutate } = useApi<CalendarStats>(
    enabled ? `/dashboard/calendar-stats?${periodQuery(period)}` : null,
    READ_OPTIONS
  )

  return { stats: data, error, isLoading, isValidating, reload: () => mutate() }
}
