import type { ReactNode } from "react"

import { useCustomDashboardTabs } from "@/hooks/custom-dashboards/use-custom-dashboard-tabs"

import type { DashboardPeriod } from "./use-dashboard-period"

// Ponto de encaixe dos dashboards personalizados: cada painel vira uma aba depois de "Visão geral" e "Agenda", com
// `?tab=<id>` na URL, sob o mesmo filtro de período. A lógica mora em `hooks/custom-dashboards`, e a página não muda.

export type DashboardExtraTab = {
  /** Vai em `?tab=`. `overview` e `agenda` são reservados. */
  id: string
  label: string
  icon?: ReactNode
  render: (period: DashboardPeriod) => ReactNode
}

export type DashboardExtraTabs = {
  tabs: DashboardExtraTab[]
  /** O "Criar painel" da origem, no fim da fileira de abas. */
  create?: { label: string; onClick: () => void }
}

export function useDashboardExtraTabs(): DashboardExtraTabs {
  return useCustomDashboardTabs()
}
