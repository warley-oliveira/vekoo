import {
  createContext,
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
import type { Carousel } from "@/lib/mock-data"
import { useStore } from "@/lib/store"

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
  | { type: "card/activate"; id: string }
  | { type: "card/add"; card: CarouselCard }
  | { type: "card/reorder"; ids: string[] } // transiente, durante o arrasto
  | { type: "card/reorder-commit"; before: EditorDoc }
  | { type: "block/select"; id: string | null }
  | { type: "block/edit"; editing: boolean }
  | { type: "block/insert"; index: number; block: Block }
  | { type: "block/update"; block: Block }
  | { type: "block/remove"; id: string }
  | { type: "block/move"; id: string; direction: 1 | -1 }
  | { type: "history/undo" }
  | { type: "history/redo" }

export type SaveState = "saved" | "saving"

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
    case "card/activate":
      return state.activeCardId === action.id
        ? state
        : { ...state, activeCardId: action.id, selection: NO_SELECTION }
    case "card/add": {
      const doc = { ...state.doc, cards: [...state.doc.cards, action.card] }
      const first = action.card.blocks[0]
      return {
        ...commit(state, doc, {
          blockId: first?.id ?? null,
          editing: first ? isEditableBlock(first.type) : false,
        }),
        activeCardId: action.card.id,
      }
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
  const { dispatch: appDispatch } = useStore()
  const [state, dispatch] = useReducer(reducer, carousel, initState)
  const [saveState, setSaveState] = useState<SaveState>("saved")
  const skipFirst = useRef(true)
  const pending = useRef<EditorDoc | null>(null)

  useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false
      return
    }
    setSaveState("saving")
    pending.current = state.doc
    const timer = setTimeout(() => {
      const doc = state.doc
      appDispatch({
        type: "carousel/save-doc",
        id: carousel.id,
        title: doc.title,
        theme: doc.theme,
        cards: doc.cards,
        now: Date.now(),
      })
      pending.current = null
      setSaveState("saved")
    }, AUTOSAVE_DELAY)
    return () => clearTimeout(timer)
  }, [state.doc, appDispatch, carousel.id])

  // Descarga final: sair do editor com salvamento pendente salva na hora.
  useEffect(
    () => () => {
      const doc = pending.current
      if (!doc) return
      pending.current = null
      appDispatch({
        type: "carousel/save-doc",
        id: carousel.id,
        title: doc.title,
        theme: doc.theme,
        cards: doc.cards,
        now: Date.now(),
      })
    },
    [appDispatch, carousel.id]
  )

  const value = useMemo(
    () => ({
      state,
      dispatch,
      saveState,
      carouselId: carousel.id,
      folderId: carousel.folderId,
    }),
    [state, saveState, carousel.id, carousel.folderId]
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
