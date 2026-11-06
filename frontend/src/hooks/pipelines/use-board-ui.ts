import { create } from "zustand"

// O que é só da tela, enquanto um pipeline está aberto. Cada card assina a própria entrada destes
// mapas, por seletor: marcar um card não redesenha os outros.

/** O fechamento do negócio recusado por falta de campo: o diálogo pede e tenta de novo. */
export type DealGuardRequest = {
  cardId: string
  outcome: "won" | "lost"
  lostReason?: string
  fieldKeys: string[]
}

export type CardMenuRequest = {
  cardId: string
  anchor: HTMLElement
}

export type BulkRequest = "assign" | "priority"

type BoardUiState = {
  /** Aumenta quando a regra de visibilidade muda: a assinatura do canal precisa ser refeita. */
  channelEpoch: number
  selected: Record<string, true>
  selectedCount: number
  /** Cards que a API recusou mover, com o que falta. Some sozinho depois de uns segundos. */
  blocked: Record<string, string[]>
  /** Cards que acabaram de chegar: entram com uma animação curta. */
  fresh: Record<string, true>
  /** A etapa à vista no celular, onde se vê uma por vez. */
  activeStageId: string | null
  moveRequest: string[] | null
  lostRequest: string | null
  dealGuard: DealGuardRequest | null
  bulkRequest: BulkRequest | null
  cardMenu: CardMenuRequest | null
  bumpChannel: () => void
  toggleSelected: (cardId: string) => void
  setSelected: (cardIds: string[]) => void
  clearSelected: () => void
  markBlocked: (cardId: string, pending: string[]) => void
  clearBlocked: (cardId: string) => void
  markFresh: (cardId: string) => void
  setActiveStage: (stageId: string | null) => void
  requestMove: (cardIds: string[] | null) => void
  requestLost: (cardId: string | null) => void
  setDealGuard: (request: DealGuardRequest | null) => void
  requestBulk: (request: BulkRequest | null) => void
  openCardMenu: (request: CardMenuRequest | null) => void
  reset: () => void
}

const INITIAL = {
  selected: {},
  selectedCount: 0,
  blocked: {},
  fresh: {},
  activeStageId: null,
  moveRequest: null,
  lostRequest: null,
  dealGuard: null,
  bulkRequest: null,
  cardMenu: null,
}

const BLOCKED_MS = 8_000
const FRESH_MS = 1_200

export const useBoardUi = create<BoardUiState>()((set) => ({
  channelEpoch: 0,
  ...INITIAL,

  bumpChannel: () => set((state) => ({ channelEpoch: state.channelEpoch + 1 })),

  toggleSelected: (cardId) =>
    set((state) => {
      const selected = { ...state.selected }
      if (selected[cardId]) delete selected[cardId]
      else selected[cardId] = true
      return { selected, selectedCount: Object.keys(selected).length }
    }),

  setSelected: (cardIds) =>
    set({
      selected: Object.fromEntries(cardIds.map((id) => [id, true as const])),
      selectedCount: cardIds.length,
    }),

  clearSelected: () => set({ selected: {}, selectedCount: 0 }),

  markBlocked: (cardId, pending) => {
    set((state) => ({ blocked: { ...state.blocked, [cardId]: pending } }))
    window.setTimeout(() => useBoardUi.getState().clearBlocked(cardId), BLOCKED_MS)
  },

  clearBlocked: (cardId) =>
    set((state) => {
      if (!state.blocked[cardId]) return state
      const blocked = { ...state.blocked }
      delete blocked[cardId]
      return { blocked }
    }),

  markFresh: (cardId) => {
    set((state) => ({ fresh: { ...state.fresh, [cardId]: true } }))
    window.setTimeout(
      () =>
        set((state) => {
          const fresh = { ...state.fresh }
          delete fresh[cardId]
          return { fresh }
        }),
      FRESH_MS
    )
  },

  setActiveStage: (activeStageId) => set({ activeStageId }),
  requestMove: (moveRequest) => set({ moveRequest }),
  requestLost: (lostRequest) => set({ lostRequest }),
  setDealGuard: (dealGuard) => set({ dealGuard }),
  requestBulk: (bulkRequest) => set({ bulkRequest }),
  openCardMenu: (cardMenu) => set({ cardMenu }),
  reset: () => set(INITIAL),
}))
