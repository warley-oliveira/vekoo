import type { PieceDocument } from "@/lib/piece-document"
import { applyOperations, type Contracts, type Operation } from "@/lib/piece-operations"

// O estado do editor de peças: o documento, a seleção, o modo, desfazer e
// refazer, e o salvamento. Toda mudança passa por `apply` — o painel, a
// edição no preview, o ponto focal e (na etapa da conversa) as operações que
// o servidor devolver. Um caminho só.

export type SaveStatus = "saved" | "pending" | "saving" | "error" | "conflict"

export type EditorState = {
  document: PieceDocument
  /** A versão do servidor de que a próxima gravação parte (`baseVersionId`). */
  baseVersionId: string
  selection: { slideId: string; slot: string | null }
  mode: "idle" | "inline" | "focal"
  past: PieceDocument[]
  future: PieceDocument[]
  /** Agrupa digitação contínua no mesmo bloco num passo só de desfazer. */
  group: { key: string; at: number } | null
  save: { status: SaveStatus; savedAt: number | null; attempt: number }
  /** Sobe a cada mudança — o salvamento sabe se ainda há o que gravar. */
  revision: number
  savedRevision: number
}

export type EditorAction =
  | { type: "apply"; operations: Operation[]; group?: string; now: number }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "select"; slot: string | null; slideId?: string }
  | { type: "mode"; mode: EditorState["mode"] }
  | { type: "saving" }
  | { type: "saved"; versionId: string; revision: number; now: number }
  | { type: "saveFailed" }
  | { type: "retry" }
  | { type: "conflict" }

const HISTORY = 100
const GROUP_MS = 1_000

export function initialState(document: PieceDocument, versionId: string): EditorState {
  return {
    document,
    baseVersionId: versionId,
    selection: { slideId: document.slides[0]?.id ?? "", slot: null },
    mode: "idle",
    past: [],
    future: [],
    group: null,
    save: { status: "saved", savedAt: null, attempt: 0 },
    revision: 0,
    savedRevision: 0,
  }
}

export function editorReducer(contracts: Contracts) {
  return (state: EditorState, action: EditorAction): EditorState => {
    switch (action.type) {
      case "apply": {
        const next = applyOperations(state.document, action.operations, contracts)
        if (next === state.document) return state
        // A lâmina selecionada saiu (removida): fica a vizinha.
        const kept = next.slides.some((slide) => slide.id === state.selection.slideId)
        const fallback = state.document.slides.findIndex((slide) => slide.id === state.selection.slideId)
        const selection = kept
          ? state.selection
          : { slideId: next.slides[Math.min(Math.max(fallback, 0), next.slides.length - 1)]?.id ?? "", slot: null }
        const grouped = action.group && state.group?.key === action.group && action.now - state.group.at < GROUP_MS
        return {
          ...state,
          document: next,
          selection,
          past: grouped ? state.past : [...state.past, state.document].slice(-HISTORY),
          future: [],
          group: action.group ? { key: action.group, at: action.now } : null,
          revision: state.revision + 1,
          save: state.save.status === "conflict" ? state.save : { ...state.save, status: "pending" },
        }
      }
      case "undo": {
        const previous = state.past.at(-1)
        if (!previous) return state
        return {
          ...state,
          document: previous,
          selection: validSelection(previous, state.selection),
          past: state.past.slice(0, -1),
          future: [state.document, ...state.future].slice(0, HISTORY),
          group: null,
          revision: state.revision + 1,
          save: state.save.status === "conflict" ? state.save : { ...state.save, status: "pending" },
        }
      }
      case "redo": {
        const next = state.future[0]
        if (!next) return state
        return {
          ...state,
          document: next,
          selection: validSelection(next, state.selection),
          past: [...state.past, state.document].slice(-HISTORY),
          future: state.future.slice(1),
          group: null,
          revision: state.revision + 1,
          save: state.save.status === "conflict" ? state.save : { ...state.save, status: "pending" },
        }
      }
      case "select":
        return {
          ...state,
          selection: { slideId: action.slideId ?? state.selection.slideId, slot: action.slot },
          mode: action.slot === null ? "idle" : state.mode === "inline" && state.selection.slot !== action.slot ? "idle" : state.mode,
        }
      case "mode":
        return { ...state, mode: action.mode }
      case "saving":
        return { ...state, save: { ...state.save, status: "saving" } }
      case "saved": {
        const dirty = state.revision > action.revision
        return {
          ...state,
          baseVersionId: action.versionId,
          savedRevision: action.revision,
          save: { status: dirty ? "pending" : "saved", savedAt: action.now, attempt: 0 },
        }
      }
      case "saveFailed":
        return { ...state, save: { ...state.save, status: "error", attempt: state.save.attempt + 1 } }
      case "retry":
        return state.save.status === "error" ? { ...state, save: { ...state.save, status: "pending" } } : state
      case "conflict":
        return { ...state, save: { ...state.save, status: "conflict" } }
    }
  }
}

function validSelection(document: PieceDocument, selection: EditorState["selection"]): EditorState["selection"] {
  return document.slides.some((slide) => slide.id === selection.slideId)
    ? selection
    : { slideId: document.slides[0]?.id ?? "", slot: null }
}
