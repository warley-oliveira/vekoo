import { useEffect, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { useSearchParams } from "@/lib/router"
import { Plus } from "lucide-react"

import { ErrorState } from "@/components/shared"
import { confirm } from "@/components/shared/use-confirm"
import { DashboardTabContent, DashboardTabIcon, NewDashboardTabContent } from "@/components/custom-dashboards/dashboard-tab-parts"
import type { DashboardExtraTab, DashboardExtraTabs } from "@/hooks/insights/use-dashboard-extra-tabs"
import { useCan } from "@/hooks/use-can"
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import { sortDashboards } from "@/lib/custom-dashboards/templates"

import { useCustomDashboardList } from "./use-custom-dashboards"
import { useDirtyDashboardIds, useEditorStore } from "./use-editor-store"

const NEW_TAB = "new"
const RESERVED = new Set(["overview", "agenda", NEW_TAB])
const NO_TABS: DashboardExtraTabs = { tabs: [] }

/**
 * A fileira de abas rola de lado, sem barra, e a página não sabe trazer a aba ativa para a vista. Com vários painéis, ou
 * vindo de um link, ela ficaria cortada ou escondida.
 */
function useActiveTabInView(active: string | null) {
  useEffect(() => {
    if (!active) return
    const frame = requestAnimationFrame(() => {
      document.querySelector('main [role="tab"][aria-selected="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" })
    })
    return () => cancelAnimationFrame(frame)
  }, [active])
}

/** Sair da tela com rascunho pergunta antes. Fica aqui porque o rascunho de uma aba vive enquanto outra está aberta. */
function useLeaveGuard(dirtyIds: string) {
  const { t } = useTranslation()
  const { blocked, proceed, reset } = useUnsavedChanges(Boolean(dirtyIds))

  useEffect(() => {
    if (!blocked) return
    let active = true

    void confirm({
      title: t("kit.unsaved.title"),
      description: t("kit.unsaved.description"),
      confirmLabel: t("kit.unsaved.leave"),
      cancelLabel: t("kit.unsaved.stay"),
      destructive: true,
    }).then((leave) => {
      if (!active) return
      if (leave) {
        const { discard } = useEditorStore.getState()
        dirtyIds.split(",").forEach(discard)
        proceed()
      } else {
        reset()
      }
    })

    return () => {
      active = false
    }
  }, [blocked, dirtyIds, proceed, reset, t])
}

/**
 * Os painéis viram abas do Dashboard: favoritos primeiro, depois do mais antigo para o mais novo, para salvar não embaralhar
 * a fileira. Enquanto a lista não chega, a aba do endereço já ocupa o lugar dela, senão a página cairia na Visão geral e
 * pediria o relatório inteiro à toa.
 */
export function useCustomDashboardTabs(): DashboardExtraTabs {
  const { t } = useTranslation()
  const can = useCan("custom_dashboards")
  const [searchParams, setSearchParams] = useSearchParams()
  const { dashboards, error, reload } = useCustomDashboardList(can)
  const dirtyIds = useDirtyDashboardIds()
  const param = searchParams.get("tab")

  useLeaveGuard(dirtyIds)
  useActiveTabInView(param && dashboards ? param : null)

  return useMemo(() => {
    if (!can) return NO_TABS

    const dirty = new Set(dirtyIds ? dirtyIds.split(",") : [])
    const tabs: DashboardExtraTab[] = sortDashboards(dashboards ?? []).map((dashboard) => ({
      id: dashboard.id,
      label: dashboard.name,
      icon: <DashboardTabIcon dashboard={dashboard} dirty={dirty.has(dashboard.id)} />,
      render: (period) => <DashboardTabContent dashboardId={dashboard.id} period={period} />,
    }))

    if (param === NEW_TAB) {
      tabs.push({
        id: NEW_TAB,
        label: t("customDashboards.newDashboard.tab"),
        icon: <Plus aria-hidden />,
        render: () => <NewDashboardTabContent />,
      })
    } else if (param && !RESERVED.has(param) && !dashboards) {
      tabs.push({
        id: param,
        label: t("customDashboards.tab.loading"),
        render: (period) =>
          error ? <ErrorState error={error} onRetry={() => void reload()} /> : <DashboardTabContent dashboardId={param} period={period} />,
      })
    }

    return {
      tabs,
      // Com a aba de criar aberta, o botão ao lado dela não levaria a lugar nenhum.
      create:
        param === NEW_TAB
          ? undefined
          : {
              label: t("customDashboards.tab.create"),
              onClick: () =>
                setSearchParams(
                  (current) => {
                    const next = new URLSearchParams(current)
                    next.set("tab", NEW_TAB)
                    return next
                  },
                  { replace: true }
                ),
            },
    }
  }, [can, dashboards, dirtyIds, error, param, reload, setSearchParams, t])
}
