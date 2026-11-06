import { create } from "zustand"

import type { Card } from "@/lib/pipelines/types"

// O arraste em andamento. Fora do cache do SWR de propósito: enquanto o card está no ar, a lista
// que cada etapa mostra vem daqui, e cada etapa assina só a própria linha deste mapa. Atravessar
// uma etapa redesenha as duas envolvidas e mais nada.

type DragState = {
  activeId: string | null
  activeCard: Card | null
  /** A lista de cada etapa durante o arraste, já com o card onde ele está agora. */
  columns: Record<string, Card[]> | null
  fromStageId: string | null
  fromIndex: number
  begin: (columns: Record<string, Card[]>, card: Card, stageId: string, index: number) => void
  moveAcross: (fromStageId: string, toStageId: string, index: number) => void
  reorder: (stageId: string, cards: Card[]) => void
  end: () => void
}

export const useBoardDrag = create<DragState>()((set) => ({
  activeId: null,
  activeCard: null,
  columns: null,
  fromStageId: null,
  fromIndex: -1,

  begin: (columns, card, stageId, index) =>
    set({ columns, activeId: card.id, activeCard: card, fromStageId: stageId, fromIndex: index }),

  moveAcross: (fromStageId, toStageId, index) =>
    set((state) => {
      if (!state.columns || !state.activeId) return state
      const source = state.columns[fromStageId]
      const target = state.columns[toStageId]
      const moving = source?.find((card) => card.id === state.activeId)
      if (!source || !target || !moving) return state

      const next = [...target]
      next.splice(Math.max(0, Math.min(index, next.length)), 0, moving)
      return {
        columns: {
          ...state.columns,
          [fromStageId]: source.filter((card) => card.id !== state.activeId),
          [toStageId]: next,
        },
      }
    }),

  reorder: (stageId, cards) =>
    set((state) =>
      state.columns ? { columns: { ...state.columns, [stageId]: cards } } : state
    ),

  end: () =>
    set({ columns: null, activeId: null, activeCard: null, fromStageId: null, fromIndex: -1 }),
}))

/** Em que etapa o card está, na lista do arraste. */
export function stageOfCard(columns: Record<string, Card[]>, cardId: string): string | null {
  for (const [stageId, cards] of Object.entries(columns)) {
    if (cards.some((card) => card.id === cardId)) return stageId
  }
  return null
}
