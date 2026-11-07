import { lazy, Suspense } from "react"
import { useTranslation } from "react-i18next"

import { Skeleton } from "@/components/ui/skeleton"
import type { DashboardPeriod } from "@/hooks/insights/use-dashboard-period"
import type { CustomDashboardSummary } from "@/lib/custom-dashboards/types"

import { iconFor } from "./icons"

// O construtor fica num pedaço próprio: quem só olha a Visão geral não baixa nada disto. Nem a grade, nem os gráficos.
const DashboardTab = lazy(() => import("./dashboard-tab"))
const NewDashboardTab = lazy(() => import("./new-dashboard-tab"))

function TabFallback() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-8 w-full max-w-md" />
      <div className="grid gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-44 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-96 rounded-xl" />
    </div>
  )
}

export function DashboardTabContent({ dashboardId, period }: { dashboardId: string; period: DashboardPeriod }) {
  return (
    <Suspense fallback={<TabFallback />}>
      <DashboardTab key={dashboardId} dashboardId={dashboardId} period={period} />
    </Suspense>
  )
}

export function NewDashboardTabContent() {
  return (
    <Suspense fallback={<TabFallback />}>
      <NewDashboardTab />
    </Suspense>
  )
}

export function DashboardTabIcon({ dashboard, dirty }: { dashboard: Pick<CustomDashboardSummary, "icon">; dirty: boolean }) {
  const { t } = useTranslation()
  const Icon = iconFor(dashboard.icon)

  return (
    <>
      <Icon aria-hidden />
      {dirty ? (
        // Um rascunho esperando: a aba avisa, mesmo com a pessoa em outra.
        <span title={t("customDashboards.tab.unsaved")} className="absolute top-1.5 left-1 size-1.5 rounded-full bg-primary">
          <span className="sr-only">{t("customDashboards.tab.unsaved")}</span>
        </span>
      ) : null}
    </>
  )
}
