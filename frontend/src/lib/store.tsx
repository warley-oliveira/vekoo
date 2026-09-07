import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react"

import type { CarouselCard, CarouselFormat, CarouselTheme } from "@/lib/doc"
import { buildSeed, type AppState, type Carousel, type Folder } from "@/lib/mock-data"

// Estado fictício, persistido em localStorage para as ações (renomear,
// favoritar, editar…) sobreviverem ao reload. Bump na versão descarta o
// estado salvo e re-semeia.
// etapa1.v2: notificações passaram a guardar a chave de tradução.
// etapa2.v1: carrosséis viraram documentos de blocos (tema + cards).
// etapa3.v1: o texto virou uma sequência de trechos com marcas (TextSpan[]).
const STORAGE_KEY = "vekoo.etapa3.v1"

type Action =
  | { type: "carousel/create"; carousel: Carousel }
  | { type: "carousel/rename"; id: string; title: string }
  | { type: "carousel/toggle-favorite"; id: string }
  | {
      type: "carousel/duplicate"
      id: string
      newId: string
      /** Título da cópia — vem traduzido da tela. */
      title: string
      now: number
    }
  | {
      /** Salvamento grosso vindo do editor — o histórico de desfazer é dele. */
      type: "carousel/save-doc"
      id: string
      title: string
      format: CarouselFormat
      theme: CarouselTheme
      cards: CarouselCard[]
      now: number
    }
  | { type: "carousel/set-caption"; id: string; caption: string }
  | { type: "credits/consume"; amount: number }
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
    case "carousel/create":
      return { ...state, carousels: [action.carousel, ...state.carousels] }
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
        title: action.title,
        favorite: false,
        editedAt: action.now,
        trashedAt: null,
      }
      const index = state.carousels.indexOf(original)
      const carousels = [...state.carousels]
      carousels.splice(index + 1, 0, copy)
      return { ...state, carousels }
    }
    case "carousel/save-doc":
      return updateCarousel(state, action.id, (c) => ({
        ...c,
        title: action.title,
        format: action.format,
        theme: action.theme,
        cards: action.cards,
        editedAt: action.now,
      }))
    case "carousel/set-caption":
      return updateCarousel(state, action.id, (c) => ({
        ...c,
        caption: action.caption,
      }))
    case "credits/consume":
      return {
        ...state,
        credits: {
          ...state.credits,
          used: Math.min(
            state.credits.total,
            state.credits.used + action.amount
          ),
        },
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
