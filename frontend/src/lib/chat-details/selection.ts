import { create } from "zustand"

// Escolher conversas na lista. A linha lê só `ids.has(o próprio id)`: marcar uma desenha uma linha,
// e só entrar e sair do modo desenha todas.

type ChatSelectionState = {
  active: boolean
  ids: Set<string>
  /** As conversas carregadas na lista agora: é o que "Selecionar todas" alcança. */
  loaded: string[]
  enter: () => void
  exit: () => void
  /** Marca ou desmarca um conjunto: uma linha de contato pode ser várias conversas. */
  toggle: (ids: string[]) => void
  selectLoaded: () => void
  clear: () => void
  setLoaded: (ids: string[]) => void
}

const EMPTY = new Set<string>()

export const useChatSelection = create<ChatSelectionState>()((set) => ({
  active: false,
  ids: EMPTY,
  loaded: [],
  enter: () => set({ active: true, ids: EMPTY }),
  exit: () => set({ active: false, ids: EMPTY }),
  toggle: (ids) =>
    set((state) => {
      const next = new Set(state.ids)
      const remove = ids.every((id) => next.has(id))
      for (const id of ids) {
        if (remove) next.delete(id)
        else next.add(id)
      }
      return { ids: next }
    }),
  selectLoaded: () => set((state) => ({ ids: new Set(state.loaded) })),
  clear: () => set({ ids: EMPTY }),
  setLoaded: (loaded) => set({ loaded }),
}))

/** As conversas de uma linha de contato que a ação alcança: as que casaram com o filtro. */
export function selectableChatIds(chats: { chatId: string; matched: boolean }[]): string[] {
  const matched = chats.filter((chat) => chat.matched)
  return (matched.length > 0 ? matched : chats).map((chat) => chat.chatId)
}
