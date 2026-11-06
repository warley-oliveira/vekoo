import { create } from "zustand"

export type MobileSheet =
  | "none"
  | "more"
  | "pipelines"
  | "notifications"
  | "headerSlot"

type MobileNavState = {
  /** Só uma folha aberta por vez: modal dentro de modal quebra a rolagem no iOS. */
  activeSheet: MobileSheet
  /**
   * A folha que assume quando a atual terminar de sair. É o que encadeia a transição
   * sem empilhar duas: `replaceSheet` fecha a corrente e o `MobileShell` faz o commit.
   */
  pendingSheet: MobileSheet | null
  /** Qual entrada está expandida no painel "Mais" (uma por vez). */
  expandedEntryId: string | null
  openSheet: (sheet: MobileSheet) => void
  replaceSheet: (next: MobileSheet) => void
  commitPendingSheet: () => void
  closeSheet: () => void
  setExpandedEntry: (entryId: string | null) => void
  reset: () => void
}

export const useMobileNav = create<MobileNavState>()((set) => ({
  activeSheet: "none",
  pendingSheet: null,
  expandedEntryId: null,
  openSheet: (activeSheet) => set({ activeSheet, pendingSheet: null }),
  replaceSheet: (next) => set({ activeSheet: "none", pendingSheet: next }),
  commitPendingSheet: () =>
    set((state) =>
      state.pendingSheet
        ? { activeSheet: state.pendingSheet, pendingSheet: null }
        : state
    ),
  closeSheet: () => set({ activeSheet: "none", pendingSheet: null }),
  setExpandedEntry: (expandedEntryId) => set({ expandedEntryId }),
  reset: () =>
    set({ activeSheet: "none", pendingSheet: null, expandedEntryId: null }),
}))
