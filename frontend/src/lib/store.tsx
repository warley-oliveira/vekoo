import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react"

import { buildSeed, type AppState, type Carousel, type Folder } from "@/lib/mock-data"

// Estado fictício da etapa 1, persistido em localStorage para as ações
// (renomear, favoritar, mover…) sobreviverem ao reload. Bump na versão
// descarta o estado salvo e re-semeia.
const STORAGE_KEY = "vekoo.etapa1.v1"

type Action =
  | { type: "carousel/rename"; id: string; title: string }
  | { type: "carousel/toggle-favorite"; id: string }
  | { type: "carousel/duplicate"; id: string; newId: string; now: number }
  | { type: "carousel/move"; id: string; folderId: string | null }
  | { type: "carousel/trash"; id: string; now: number }
  | { type: "carousel/restore"; id: string }
  | { type: "carousel/delete-forever"; id: string }
  | { type: "trash/empty" }
  | { type: "folder/create"; folder: Folder }
  | { type: "folder/rename"; id: string; name: string }
  | { type: "folder/delete"; id: string }
  | { type: "notifications/read-all" }
  | { type: "reset"; state: AppState }

function updateCarousel(
  state: AppState,
  id: string,
  patch: (c: Carousel) => Carousel
): AppState {
  return {
    ...state,
    carousels: state.carousels.map((c) => (c.id === id ? patch(c) : c)),
  }
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "carousel/rename":
      return updateCarousel(state, action.id, (c) => ({
        ...c,
        title: action.title,
      }))
    case "carousel/toggle-favorite":
      return updateCarousel(state, action.id, (c) => ({
        ...c,
        favorite: !c.favorite,
      }))
    case "carousel/duplicate": {
      const original = state.carousels.find((c) => c.id === action.id)
      if (!original) return state
      const copy: Carousel = {
        ...original,
        id: action.newId,
        title: `${original.title} (cópia)`,
        favorite: false,
        editedAt: action.now,
        trashedAt: null,
      }
      const index = state.carousels.indexOf(original)
      const carousels = [...state.carousels]
      carousels.splice(index + 1, 0, copy)
      return { ...state, carousels }
    }
    case "carousel/move":
      return updateCarousel(state, action.id, (c) => ({
        ...c,
        folderId: action.folderId,
      }))
    case "carousel/trash":
      return updateCarousel(state, action.id, (c) => ({
        ...c,
        trashedAt: action.now,
      }))
    case "carousel/restore":
      return updateCarousel(state, action.id, (c) => ({
        ...c,
        trashedAt: null,
      }))
    case "carousel/delete-forever":
      return {
        ...state,
        carousels: state.carousels.filter((c) => c.id !== action.id),
      }
    case "trash/empty":
      return {
        ...state,
        carousels: state.carousels.filter((c) => c.trashedAt === null),
      }
    case "folder/create":
      return { ...state, folders: [...state.folders, action.folder] }
    case "folder/rename":
      return {
        ...state,
        folders: state.folders.map((f) =>
          f.id === action.id ? { ...f, name: action.name } : f
        ),
      }
    case "folder/delete":
      return {
        ...state,
        folders: state.folders.filter((f) => f.id !== action.id),
        carousels: state.carousels.map((c) =>
          c.folderId === action.id ? { ...c, folderId: null } : c
        ),
      }
    case "notifications/read-all":
      return {
        ...state,
        notifications: state.notifications.map((n) => ({ ...n, read: true })),
      }
    case "reset":
      return action.state
  }
}

function loadInitialState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as AppState
  } catch {
    /* estado corrompido → re-semeia */
  }
  return buildSeed(Date.now())
}

type StoreContextValue = {
  state: AppState
  dispatch: (action: Action) => void
}

const StoreContext = createContext<StoreContextValue | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadInitialState)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      /* armazenamento cheio/indisponível: segue em memória */
    }
  }, [state])

  const value = useMemo(() => ({ state, dispatch }), [state])
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error("useStore precisa estar dentro de <StoreProvider>")
  return ctx
}

let idCounter = 0
export function newId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`
}
