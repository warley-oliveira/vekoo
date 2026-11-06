import { useCallback, useMemo } from "react"
import { matchPath, useLocation } from "react-router"

import { useAlerts, type AlertBadges } from "@/hooks/use-alerts"
import { useCanAccess } from "@/hooks/use-can"
import { usePipelineBoards } from "@/hooks/use-pipeline-boards"
import {
  NAV_GROUPS,
  PIPELINES_ENTRY_ID,
  type NavChild,
  type NavEntry,
  type NavGroup,
} from "@/lib/navigation"

export type NavItem = NavEntry | NavChild

export type NavigationMenu = {
  /** A árvore filtrada por permissão, com os quadros de pipeline já dentro. */
  groups: NavGroup[]
  /** As entradas de topo dos grupos, na ordem do menu. */
  entries: NavEntry[]
  /** A entrada com o caminho mais específico que casa com a rota atual. */
  activeEntry: NavEntry | null
  isActive: (item: NavItem) => boolean
  /** Alertas do item, somados aos dos filhos. */
  getBadge: (item: NavItem) => number
}

function childrenOf(item: NavItem): NavChild[] {
  return "children" in item ? (item.children ?? []) : []
}

/** Tamanho do caminho mais longo do item (ou de um filho) que casa com a rota. */
function matchedLength(item: NavItem, pathname: string): number {
  const end = "end" in item ? Boolean(item.end) : false
  let best = 0

  for (const path of item.match ?? (item.to ? [item.to] : [])) {
    if (matchPath({ path, end }, pathname)) best = Math.max(best, path.length)
  }
  for (const child of childrenOf(item)) {
    best = Math.max(best, matchedLength(child, pathname))
  }
  return best
}

function sumBadges(item: NavItem, badges: AlertBadges): number {
  const own = item.alertKey ? (badges[item.alertKey] ?? 0) : 0
  return childrenOf(item).reduce((total, child) => total + sumBadges(child, badges), own)
}

/**
 * A fonte única da árvore de navegação: permissão, quadros e alertas. Abre requisições
 * e uma assinatura de canal, então é chamada uma vez só, em `NavigationProvider`.
 */
export function useNavigationMenu(): NavigationMenu {
  const { pathname } = useLocation()
  const can = useCanAccess()
  const { boards } = usePipelineBoards()
  const { badges } = useAlerts()

  const groups = useMemo<NavGroup[]>(() => {
    const boardChildren: NavChild[] = boards.map((board) => ({
      id: `pipelines.${board.id}`,
      title: board.name,
      to: `/pipelines/${board.id}`,
    }))

    return NAV_GROUPS.map((group) => ({
      ...group,
      entries: group.entries
        .filter((entry) => can(entry.permission))
        .map((entry) =>
          entry.id === PIPELINES_ENTRY_ID
            ? { ...entry, children: boardChildren }
            : entry
        ),
    })).filter((group) => group.entries.length > 0)
  }, [boards, can])

  const entries = useMemo(() => groups.flatMap((group) => group.entries), [groups])

  const activeEntry = useMemo(() => {
    let winner: NavEntry | null = null
    let winnerLength = 0
    for (const entry of entries) {
      const length = matchedLength(entry, pathname)
      if (length > winnerLength) {
        winner = entry
        winnerLength = length
      }
    }
    return winner
  }, [entries, pathname])

  const isActive = useCallback(
    (item: NavItem) => matchedLength(item, pathname) > 0,
    [pathname]
  )

  const getBadge = useCallback((item: NavItem) => sumBadges(item, badges), [badges])

  return useMemo(
    () => ({ groups, entries, activeEntry, isActive, getBadge }),
    [groups, entries, activeEntry, isActive, getBadge]
  )
}
