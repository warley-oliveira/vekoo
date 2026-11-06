import { createContext, useContext } from "react"

import type { NavigationMenu } from "@/hooks/use-navigation-menu"

export const NavigationContext = createContext<NavigationMenu | null>(null)

/** A árvore do menu já pronta, lida de `NavigationProvider`. */
export function useNavigation(): NavigationMenu {
  const context = useContext(NavigationContext)
  if (!context) throw new Error("useNavigation precisa estar dentro do AppShell")
  return context
}
