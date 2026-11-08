import { create } from "zustand"

// O seletor de organização abre de três lugares (topo da barra lateral, "Trocar" no menu "Mais"
// do celular e Ctrl/⌘ + Shift + O), mas existe um só, montado pela casca.

type OrganizationSwitcherState = {
  open: boolean
  setOpen: (open: boolean) => void
}

export const useOrganizationSwitcher = create<OrganizationSwitcherState>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}))

const IS_APPLE = typeof navigator !== "undefined" && /Mac|iP(hone|ad|od)/.test(navigator.platform)

/** Nomes de tecla: não se traduzem. */
export const ORGANIZATION_SWITCHER_SHORTCUT = IS_APPLE ? "⇧⌘O" : "Ctrl Shift O"

/** Ctrl/⌘ + Shift + O. O Ctrl K continua sendo a busca. */
export function isOrganizationSwitcherShortcut(event: KeyboardEvent): boolean {
  return (event.metaKey || event.ctrlKey) && event.shiftKey && !event.altKey && event.key.toLowerCase() === "o"
}
