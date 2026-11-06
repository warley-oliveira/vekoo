import { create } from "zustand"
import { persist } from "zustand/middleware"

import { createSafeJSONStorage, safeLocalStorage } from "@/lib/safe-local-storage"
import type { StatusFilter } from "./list-query"
import type { ChatMessage, FilterCondition } from "./types"

// O estado de cliente do chat. Seletores granulares, sempre: `useDrafts((s) => s.setDraft)`.

/* ---------- rascunhos ---------- */

type Draft = { text: string; timestamp: number }

// Tetos do que vai para o localStorage: a quota é dividida com o resto do app, e cada gravação
// reescreve o JSON inteiro.
const MAX_DRAFTS = 50
const MAX_DRAFT_LENGTH = 10_000
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000

function pruneDrafts(drafts: Record<string, Draft>): Record<string, Draft> {
  const cutoff = Date.now() - DRAFT_TTL_MS
  return Object.fromEntries(
    Object.entries(drafts)
      .filter(([, draft]) => draft?.text?.trim() && draft.timestamp >= cutoff)
      .sort(([, a], [, b]) => b.timestamp - a.timestamp)
      .slice(0, MAX_DRAFTS)
  )
}

type DraftsState = {
  drafts: Record<string, Draft>
  setDraft: (chatId: string, text: string) => void
  clearDraft: (chatId: string) => void
}

export const useDrafts = create<DraftsState>()(
  persist(
    (set, get) => ({
      drafts: {},
      setDraft: (chatId, text) => {
        // Texto vazio não é rascunho: sai, em vez de guardar uma entrada por conversa aberta.
        if (!text.trim()) {
          get().clearDraft(chatId)
          return
        }
        set((state) => ({
          drafts: pruneDrafts({
            ...state.drafts,
            [chatId]: { text: text.slice(0, MAX_DRAFT_LENGTH), timestamp: Date.now() },
          }),
        }))
      },
      clearDraft: (chatId) => {
        if (!(chatId in get().drafts)) return
        set((state) => {
          const drafts = { ...state.drafts }
          delete drafts[chatId]
          return { drafts }
        })
      },
    }),
    {
      name: "vekoo.chat.drafts.v1",
      storage: createSafeJSONStorage(),
      partialize: (state) => ({ drafts: state.drafts }),
      merge: (persisted, current) => ({
        ...current,
        drafts: pruneDrafts((persisted as Partial<DraftsState> | undefined)?.drafts ?? {}),
      }),
    }
  )
)

/** O texto guardado, sem assinar: o composer lê uma vez ao abrir a conversa. */
export function readDraft(chatId: string): string {
  return useDrafts.getState().drafts[chatId]?.text ?? ""
}

/* ---------- resposta citada ---------- */

type ReplyState = {
  /** Volátil de propósito: recarregar a página desfaz, como no WhatsApp. */
  byChat: Record<string, ChatMessage>
  setReplyTo: (chatId: string, message: ChatMessage) => void
  clearReplyTo: (chatId: string) => void
}

export const useReplyTo = create<ReplyState>()((set) => ({
  byChat: {},
  setReplyTo: (chatId, message) =>
    set((state) => ({ byChat: { ...state.byChat, [chatId]: message } })),
  clearReplyTo: (chatId) =>
    set((state) => {
      if (!(chatId in state.byChat)) return state
      const byChat = { ...state.byChat }
      delete byChat[chatId]
      return { byChat }
    }),
}))

/* ---------- último canal de cada contato ---------- */

// Um item por contato já aberto, pelo telefone: sem teto, crescia para sempre (e é dado pessoal).
const MAX_REMEMBERED = 200

type LastChannelState = {
  lastChatByContact: Record<string, string>
  remember: (externalId: string, chatId: string) => void
}

export const useLastChannel = create<LastChannelState>()(
  persist(
    (set) => ({
      lastChatByContact: {},
      remember: (externalId, chatId) =>
        set((state) => {
          if (state.lastChatByContact[externalId] === chatId) return state
          const others = { ...state.lastChatByContact }
          delete others[externalId]
          const kept = Object.entries(others).slice(-(MAX_REMEMBERED - 1))
          return { lastChatByContact: { ...Object.fromEntries(kept), [externalId]: chatId } }
        }),
    }),
    {
      name: "vekoo.chat.last-channel.v1",
      storage: createSafeJSONStorage(),
    }
  )
)

/* ---------- recorte da lista ---------- */

type ListFiltersState = {
  status: StatusFilter
  /** `null` é a aba "Todos". */
  connectorId: string | null
  search: string
  conditions: FilterCondition[]
  /** A visão salva que está aplicada: só para a tela destacar. */
  activeViewId: string | null
  remember: boolean
  setStatus: (status: StatusFilter) => void
  setConnectorId: (connectorId: string | null) => void
  setSearch: (search: string) => void
  setConditions: (conditions: FilterCondition[], activeViewId?: string | null) => void
  setRemember: (remember: boolean) => void
  clearAll: () => void
}

const REMEMBERED_FILTERS_KEY = "vekoo.chat.filters.v1"

function readRememberedConditions(): FilterCondition[] {
  try {
    const raw = safeLocalStorage.getItem(REMEMBERED_FILTERS_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as FilterCondition[]) : []
  } catch {
    return []
  }
}

function writeRememberedConditions(conditions: FilterCondition[] | null) {
  if (conditions) safeLocalStorage.setItem(REMEMBERED_FILTERS_KEY, JSON.stringify(conditions))
  else safeLocalStorage.removeItem(REMEMBERED_FILTERS_KEY)
}

const rememberedConditions = readRememberedConditions()

export const useListFilters = create<ListFiltersState>()(
  persist(
    (set, get) => ({
      status: "all",
      connectorId: null,
      search: "",
      conditions: rememberedConditions,
      activeViewId: null,
      remember: rememberedConditions.length > 0,
      setStatus: (status) => set({ status }),
      setConnectorId: (connectorId) => set({ connectorId }),
      setSearch: (search) => set({ search }),
      setConditions: (conditions, activeViewId = null) => {
        set({ conditions, activeViewId })
        if (get().remember) writeRememberedConditions(conditions)
      },
      setRemember: (remember) => {
        set({ remember })
        writeRememberedConditions(remember ? get().conditions : null)
      },
      clearAll: () => {
        set({ conditions: [], activeViewId: null, search: "" })
        if (get().remember) writeRememberedConditions([])
      },
    }),
    {
      name: "vekoo.chat.list.v1",
      storage: createSafeJSONStorage(),
      partialize: (state) => ({ status: state.status, connectorId: state.connectorId }),
    }
  )
)

/* ---------- conversa aberta ---------- */

type OpenChatState = {
  /** O que a linha da lista compara, sem assinar a rota: só duas linhas se desenham ao trocar. */
  chatId: string | null
  externalId: string | null
  /** Quais conversas do contato casaram com o filtro, quando ele veio de uma linha filtrada. */
  matches: Record<string, boolean> | null
}

export const useOpenChatStore = create<OpenChatState>()(() => ({
  chatId: null,
  externalId: null,
  matches: null,
}))

/* ---------- estado passageiro da conversa ---------- */

type ThreadUiState = {
  /** A bolha que pisca depois de ir até ela pela citação. */
  flashId: string | null
  /** No toque, a bolha com as ações à mostra, depois de segurar. */
  activeMessageId: string | null
  /** O visualizador de mídia: qual histórico e em que mensagem começa. */
  viewer: { threadKey: string; messageId: string } | null
}

export const useThreadUi = create<ThreadUiState>()(() => ({
  flashId: null,
  activeMessageId: null,
  viewer: null,
}))

/* ---------- seleção de mensagens ---------- */

type SelectionState = {
  active: boolean
  ids: Set<string>
  enter: (id: string) => void
  toggle: (id: string) => void
  clear: () => void
}

export const useMessageSelection = create<SelectionState>()((set) => ({
  active: false,
  ids: new Set(),
  enter: (id) => set({ active: true, ids: new Set([id]) }),
  toggle: (id) =>
    set((state) => {
      const ids = new Set(state.ids)
      if (ids.has(id)) ids.delete(id)
      else ids.add(id)
      return ids.size === 0 ? { active: false, ids } : { ids }
    }),
  clear: () => set({ active: false, ids: new Set() }),
}))

/* ---------- painel lateral da conversa ---------- */

type DetailsPanelState = {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
}

/** Se o painel lateral fica aberto: persiste, como `openDetailsUser` na origem. */
export const useDetailsPanel = create<DetailsPanelState>()(
  persist(
    (set) => ({
      open: false,
      setOpen: (open) => set({ open }),
      toggle: () => set((state) => ({ open: !state.open })),
    }),
    {
      name: "vekoo.chat.details-panel.v1",
      storage: createSafeJSONStorage(),
    }
  )
)
