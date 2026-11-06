import type { ReactNode } from "react"

import { NavigationContext } from "@/hooks/use-navigation"
import { useNavigationMenu } from "@/hooks/use-navigation-menu"

/** A barra lateral, a barra inferior e o painel "Mais" leem a mesma árvore daqui. */
export function NavigationProvider({ children }: { children: ReactNode }) {
  const menu = useNavigationMenu()
  return (
    <NavigationContext.Provider value={menu}>{children}</NavigationContext.Provider>
  )
}
