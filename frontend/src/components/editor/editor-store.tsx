import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react"

import type {
  Block,
  BlockType,
  CarouselCard,
  CarouselFormat,
  CarouselTheme,
} from "@/lib/doc"
import type { Carousel } from "@/lib/types"
import { useCarouselMutations } from "@/hooks/use-carousel-mutations"

// Estado local do editor. O documento aberto é a fonte da verdade enquanto a
// tela existe; o store global só recebe salvamentos grossos (autosave com
// debounce). Desfazer/refazer vive aqui, em memória — não no store.

export type EditorDoc = {
  title: string
  format: CarouselFormat
  theme: CarouselTheme
  cards: CarouselCard[]
}

export type Selection = {
  blockId: string | null
  editing: boolean
}

type EditorState = {
  doc: EditorDoc
  activeCardId: string
  selection: Selection
  past: EditorDoc[]
  future: EditorDoc[]
}

type EditorAction =
  | { type: "title/set"; title: string }
  | { type: "doc/set-theme"; theme: CarouselTheme }
  | { type: "doc/set-format"; format: CarouselFormat }
  | { type: "card/activate"; id: string }
  | { type: "card/insert"; index: number; card: CarouselCard }
  | { type: "card/update"; id: string; patch: Partial<CarouselCard> }
  | { type: "card/remove"; id: string }
  | { type: "card/move"; id: string; direction: 1 | -1 }
  | { type: "card/move-to"; id: string; index: number }
  | { type: "card/reorder"; ids: string[] } // transiente, durante o arrasto
  | { type: "card/reorder-commit"; before: EditorDoc }
  | { type: "block/select"; id: string | null }
  | { type: "block/edit"; editing: boolean }
  | { type: "block/insert"; index: number; block: Block }
  | { type: "block/update"; block: Block }
  | { type: "block/remove"; id: string }
  | { type: "block/move"; id: string; direction: 1 | -1 }
  | { type: "block/reorder"; from: number; to: number }
  | { type: "history/undo" }
  | { type: "history/redo" }

/**
 * `error` é novo e não é enfeite: com o mock síncrono o salvamento não podia
 * falhar. Sem este estado o editor diria "Salvo" com o servidor fora do ar.
 */
export type SaveState = "saved" | "saving" | "error"

const HISTORY_LIMIT = 50
const NO_SELECTION: Selection = { blockId: null, editing: false }

/** Tipos com edição inline; imagem e divisor se ajustam pelo painel. */
const EDITABLE_TYPES: ReadonlySet<BlockType> = new Set([
  "text",
  "list",
  "stat",
  "quote",
  "table",
  "button",
])

export function isEditableBlock(type: BlockType): boolean {
  return EDITABLE_TYPES.has(type)
}

export function activeCard(state: {
  doc: EditorDoc
  activeCardId: string
}): CarouselCard | undefined {
  return (
    state.doc.cards.find((c) => c.id === state.activeCardId) ??
    state.doc.cards[0]
  )
}

/** Toda mutação do documento passa por aqui: empilha o estado anterior. */
function commit(
  state: EditorState,
  doc: EditorDoc,
  selection: Selection = state.selection
): EditorState {
  return {
    ...state,
    doc,
    selection,
    past: [...state.past.slice(-(HISTORY_LIMIT - 1)), state.doc],
    future: [],
  }
}

function mutateActiveCard(
  state: EditorState,
  fn: (card: CarouselCard) => CarouselCard
): EditorDoc {
  return {
    ...state.doc,
    cards: state.doc.cards.map((c) =>
      c.id === state.activeCardId ? fn(c) : c
    ),
  }
}

/** Depois de undo/redo, seleção e card ativo podem ter deixado de existir. */
function sanitize(state: EditorState): EditorState {
  const active = activeCard(state)
  const activeCardId = active?.id ?? ""
  const selectionOk =
    state.selection.blockId !== null &&
    active?.blocks.some((b) => b.id === state.selection.blockId)
  return {
    ...state,
    activeCardId,
    selection: selectionOk ? state.selection : NO_SELECTION,
  }
}

function reducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "title/set": {
      const title = action.title.trim()
      if (!title || title === state.doc.title) return state
      return commit(state, { ...state.doc, title })
    }
    case "doc/set-theme":
      return commit(state, { ...state.doc, theme: action.theme })
    case "doc/set-format":
      return action.format === state.doc.format
        ? state
        : commit(state, { ...state.doc, format: action.format })
    case "card/activate":
      return state.activeCardId === action.id
        ? state
        : { ...state, activeCardId: action.id, selection: NO_SELECTION }
    case "card/insert": {
      const cards = [...state.doc.cards]
      cards.splice(Math.max(0, Math.min(action.index, cards.length)), 0, action.card)
      const first = action.card.blocks[0]
      return {
        ...commit(state, { ...state.doc, cards }, {
          blockId: first?.id ?? null,
          editing: first ? isEditableBlock(first.type) : false,
        }),
        activeCardId: action.card.id,
      }
    }
    case "card/update": {
      const target = state.doc.cards.find((c) => c.id === action.id)
      if (!target) return state
      const next = { ...target, ...action.patch }
      if (JSON.stringify(target) === JSON.stringify(next)) return state
      return commit(state, {
        ...state.doc,
        cards: state.doc.cards.map((c) => (c.id === action.id ? next : c)),
      })
    }
    case "card/remove": {
      const index = state.doc.cards.findIndex((c) => c.id === action.id)
      if (index < 0) return state
      const cards = state.doc.cards.filter((c) => c.id !== action.id)
      const neighbor = cards[index] ?? cards[index - 1]
      return {
        ...commit(state, { ...state.doc, cards }, NO_SELECTION),
        activeCardId: neighbor?.id ?? "",
      }
    }
    case "card/move": {
      const index = state.doc.cards.findIndex((c) => c.id === action.id)
      const target = index + action.direction
      if (index < 0 || target < 0 || target >= state.doc.cards.length) return state
      const cards = [...state.doc.cards]
      const [moved] = cards.splice(index, 1)
      cards.splice(target, 0, moved)
      return commit(state, { ...state.doc, cards })
    }
    case "card/move-to": {
      const index = state.doc.cards.findIndex((c) => c.id === action.id)
      const target = Math.max(0, Math.min(action.index, state.doc.cards.length - 1))
      if (index < 0 || index === target) return state
      const cards = [...state.doc.cards]
      const [moved] = cards.splice(index, 1)
      cards.splice(target, 0, moved)
      return commit(state, { ...state.doc, cards })
    }
    case "card/reorder": {
      const byId = new Map(state.doc.cards.map((c) => [c.id, c]))
      const cards = action.ids
        .map((id) => byId.get(id))
        .filter((c): c is CarouselCard => c !== undefined)
      if (cards.length !== state.doc.cards.length) return state
      return { ...state, doc: { ...state.doc, cards } }
    }
    case "card/reorder-commit": {
      const before = action.before.cards.map((c) => c.id).join("|")
      const after = state.doc.cards.map((c) => c.id).join("|")
      if (before === after) return state
      return {
        ...state,
        past: [...state.past.slice(-(HISTORY_LIMIT - 1)), action.before],
        future: [],
      }
    }
    case "block/select": {
      if (
        state.selection.blockId === action.id &&
        !state.selection.editing
      ) {
        return state
      }
      return { ...state, selection: { blockId: action.id, editing: false } }
    }
    case "block/edit": {
      const { blockId } = state.selection
      if (!blockId) return state
      if (action.editing) {
        const block = activeCard(state)?.blocks.find((b) => b.id === blockId)
        if (!block || !isEditableBlock(block.type)) return state
      }
      if (state.selection.editing === action.editing) return state
      return { ...state, selection: { blockId, editing: action.editing } }
    }
    case "block/insert": {
      const doc = mutateActiveCard(state, (card) => {
        const blocks = [...card.blocks]
        const index = Math.max(0, Math.min(action.index, blocks.length))
        blocks.splice(index, 0, action.block)
        return { ...card, blocks }
      })
      return commit(state, doc, {
        blockId: action.block.id,
        editing: isEditableBlock(action.block.type),
      })
    }
    case "block/update": {
      const card = activeCard(state)
      const current = card?.blocks.find((b) => b.id === action.block.id)
      if (!current) return state
      if (JSON.stringify(current) === JSON.stringify(action.block)) {
        return state
      }
      const doc = mutateActiveCard(state, (c) => ({
        ...c,
        blocks: c.blocks.map((b) =>
          b.id === action.block.id ? action.block : b
        ),
      }))
      return commit(state, doc)
    }
    case "block/remove": {
      const card = activeCard(state)
      const index = card?.blocks.findIndex((b) => b.id === action.id) ?? -1
      if (!card || index < 0) return state
      const remaining = card.blocks.filter((b) => b.id !== action.id)
      const doc = mutateActiveCard(state, (c) => ({ ...c, blocks: remaining }))
      const neighbor = remaining[index] ?? remaining[index - 1]
      return commit(state, doc, {
        blockId: neighbor?.id ?? null,
        editing: false,
      })
    }
    case "block/move": {
      const card = activeCard(state)
      const index = card?.blocks.findIndex((b) => b.id === action.id) ?? -1
      const target = index + action.direction
      if (!card || index < 0 || target < 0 || target >= card.blocks.length) {
        return state
      }
      const doc = mutateActiveCard(state, (c) => {
        const blocks = [...c.blocks]
        const [moved] = blocks.splice(index, 1)
        blocks.splice(target, 0, moved)
        return { ...c, blocks }
      })
      return commit(state, doc)
    }
    case "block/reorder": {
      const card = activeCard(state)
      if (!card || action.from === action.to) return state
      if (action.from < 0 || action.from >= card.blocks.length) return state
      const doc = mutateActiveCard(state, (c) => {
        const blocks = [...c.blocks]
        const [moved] = blocks.splice(action.from, 1)
        blocks.splice(Math.max(0, Math.min(action.to, blocks.length)), 0, moved)
        return { ...c, blocks }
      })
      return commit(state, doc)
    }
    case "history/undo": {
      const previous = state.past.at(-1)
      if (!previous) return state
      return sanitize({
        ...state,
        doc: previous,
        past: state.past.slice(0, -1),
        future: [state.doc, ...state.future],
      })
    }
    case "history/redo": {
      const [next, ...rest] = state.future
      if (!next) return state
      return sanitize({
        ...state,
        doc: next,
        past: [...state.past, state.doc],
        future: rest,
      })
    }
  }
}

function initState(carousel: Carousel): EditorState {
  return {
    doc: {
      title: carousel.title,
      format: carousel.format,
      theme: carousel.theme,
      cards: carousel.cards,
    },
    activeCardId: carousel.cards[0]?.id ?? "",
    selection: NO_SELECTION,
    past: [],
    future: [],
  }
}

type EditorContextValue = {
  state: EditorState
  dispatch: (action: EditorAction) => void
  saveState: SaveState
  /** Tenta gravar de novo depois de uma falha. */
  retrySave: () => void
  carouselId: string
  folderId: string | null
}

const EditorContext = createContext<EditorContextValue | null>(null)

const AUTOSAVE_DELAY = 800

export function EditorProvider({
  carousel,
  children,
}: {
  carousel: Carousel
  children: ReactNode
}) {
  const { update } = useCarouselMutations()
  const [state, dispatch] = useReducer(reducer, carousel, initState)
  const [saveState, setSaveState] = useState<SaveState>("saved")
  const skipFirst = useRef(true)
  /** O documento esperando para ser gravado. */
  const pending = useRef<EditorDoc | null>(null)
  /** Há um PATCH em voo? */
  const inFlight = useRef(false)
  /** O que chegou enquanto o PATCH estava em voo. */
  const queued = useRef<EditorDoc | null>(null)

  const carouselId = carousel.id

  /**
   * Grava o documento inteiro.
   *
   * A serialização não é zelo: com duas requisições em voo, a que sair primeiro
   * pode chegar por último e ressuscitar um documento velho por cima do novo.
   * Isso não existia enquanto o "salvamento" era uma escrita síncrona em
   * memória.
   */
  const save = useCallback(
    async (doc: EditorDoc) => {
      if (inFlight.current) {
        queued.current = doc
        return
      }
      inFlight.current = true
      setSaveState("saving")
      try {
        await update(carouselId, {
          title: doc.title,
          format: doc.format,
          theme: doc.theme,
          cards: doc.cards,
        })
        pending.current = null
        setSaveState("saved")
      } catch {
        // O documento continua pendente: quem edita de novo dispara outra
        // tentativa, e a barra de cima oferece "tentar de novo".
        setSaveState("error")
      } finally {
        inFlight.current = false
        const next = queued.current
        queued.current = null
        if (next) void save(next)
      }
    },
    [carouselId, update]
  )

  useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false
      return
    }
    setSaveState("saving")
    pending.current = state.doc
    const timer = setTimeout(() => void save(state.doc), AUTOSAVE_DELAY)
    return () => clearTimeout(timer)
  }, [state.doc, save])

  // Descarga final: sair do editor com salvamento pendente grava na hora. Não
  // dá para esperar a resposta num cleanup, mas em navegação de SPA a aba
  // continua viva e a requisição chega.
  useEffect(
    () => () => {
      const doc = pending.current
      if (doc) void save(doc)
    },
    [save]
  )

  // Fechar a aba, esse sim, mata a requisição. `keepalive` não salvaria: o teto
  // de 64 KB é menor que um documento de oito cards.
  useEffect(() => {
    function warn(event: BeforeUnloadEvent) {
      if (!pending.current) return
      event.preventDefault()
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [])

  const retrySave = useCallback(() => {
    const doc = pending.current ?? state.doc
    void save(doc)
  }, [save, state.doc])

  const value = useMemo(
    () => ({
      state,
      dispatch,
      saveState,
      retrySave,
      carouselId: carousel.id,
      folderId: carousel.folderId,
    }),
    [state, saveState, retrySave, carousel.id, carousel.folderId]
  )

  return (
    <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
  )
}

export function useEditor(): EditorContextValue {
  const ctx = useContext(EditorContext)
  if (!ctx) throw new Error("useEditor precisa estar dentro de <EditorProvider>")
  return ctx
}
