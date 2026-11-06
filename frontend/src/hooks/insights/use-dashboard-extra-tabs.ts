import type { ReactNode } from "react"

import type { DashboardPeriod } from "./use-dashboard-period"

// Ponto de encaixe dos dashboards personalizados (`components/custom-dashboards`, outra frente).
//
// Cada dashboard vira uma aba depois de "Visão geral" e "Agenda", com `?tab=<id>` na URL, sob o mesmo
// filtro de período. Quem constrói o módulo troca o corpo deste hook: ler `GET /custom-dashboards`
// (só com `useCan("custom_dashboards")`) e devolver as abas. A página não muda.

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

const NO_EXTRA_TABS: DashboardExtraTabs = { tabs: [] }

export function useDashboardExtraTabs(): DashboardExtraTabs {
  return NO_EXTRA_TABS
}
