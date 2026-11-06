import { createContext, useContext } from "react"

/**
 * Como os filtros se desenham: em linha, cada um com o seu popover, ou empilhados,
 * direto dentro de um painel (celular, `FilterPopover`). Popover sobre Sheet é ruim
 * de usar, então dentro de um painel o filtro abre a própria lista ali mesmo.
 */
export type FilterLayout = "inline" | "stacked"

export const FilterLayoutContext = createContext<FilterLayout>("inline")

export function useFilterLayout(): FilterLayout {
  return useContext(FilterLayoutContext)
}
