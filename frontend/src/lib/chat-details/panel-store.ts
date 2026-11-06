import { create } from "zustand"
import { persist } from "zustand/middleware"

import { useDetailsPanel } from "@/lib/chat/stores"
import { createSafeJSONStorage } from "@/lib/safe-local-storage"

// O que a pessoa escolheu ver no painel. Fora do React, com seletores: dobrar uma seção desenha só
// aquela seção, e nada disso chega à lista nem ao histórico.

export type DetailsTab = "contact" | "copilot"

export type SectionId =
  | "tags"
  | "notes"
  | "funnels"
  | "bookings"
  | "scheduled"
  | "cards"
  | "fields"
  | "channel"

/** O raro fica dobrado na primeira vez: o painel abre dezenas de vezes por hora. */
const COLLAPSED_BY_DEFAULT: Partial<Record<SectionId, boolean>> = {
  channel: true,
}

type DetailsPrefsState = {
  tab: DetailsTab
  collapsed: Partial<Record<SectionId, boolean>>
  setTab: (tab: DetailsTab) => void
  toggleSection: (id: SectionId) => void
}

export const useDetailsPrefs = create<DetailsPrefsState>()(
  persist(
    (set) => ({
      tab: "contact",
      collapsed: COLLAPSED_BY_DEFAULT,
      setTab: (tab) => set({ tab }),
      toggleSection: (id) =>
        set((state) => ({ collapsed: { ...state.collapsed, [id]: !state.collapsed[id] } })),
    }),
    {
      name: "vekoo.chat.details-prefs.v1",
      storage: createSafeJSONStorage(),
    }
  )
)

/** Abre o painel no copiloto, com ou sem conversa aberta. */
export function openCopilot(): void {
  useDetailsPrefs.getState().setTab("copilot")
  useDetailsPanel.getState().setOpen(true)
}

/** Abre o painel no contato: é o que o botão do cabeçalho e o toque no nome pedem. */
export function openContactDetails(): void {
  useDetailsPrefs.getState().setTab("contact")
  useDetailsPanel.getState().setOpen(true)
}
