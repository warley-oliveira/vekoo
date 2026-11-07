import { createContext, useContext } from "react"
import { useStore } from "zustand"
import { createStore, type StoreApi } from "zustand/vanilla"

// O caminho aceso no quadro: quem passou, quem está rodando e quem falhou. Fica separado do conteúdo do
// fluxo porque muda a cada evento do teste, e um bloco só redesenha quando o estado dele mudou. Vale
// para o teste do editor e para abrir uma execução do histórico.

export type RunStep = "active" | "done" | "waiting" | "failed" | "skipped"

export type RunState = {
  /** Estado de cada bloco que entrou no caminho. */
  blocks: Record<string, RunStep>
  /** `origem>destino`, para acender a linha sem varrer as conexões a cada evento. */
  links: Record<string, true>
  /** O último bloco que rodou: a próxima conexão acesa sai dele. */
  lastId: string | null
  enter: (id: string) => void
  complete: (id: string, step: RunStep) => void
  /** Encerrou: tira o "rodando", e mantém o que aconteceu aceso. */
  finish: () => void
  replay: (steps: { id: string; step: RunStep }[]) => void
  reset: () => void
}

const EMPTY: Pick<RunState, "blocks" | "links" | "lastId"> = { blocks: {}, links: {}, lastId: null }

export function createRunStore(): StoreApi<RunState> {
  return createStore<RunState>()((set, get) => ({
    ...EMPTY,

    enter: (id) => {
      const { blocks, links, lastId } = get()
      set({
        blocks: { ...blocks, [id]: "active" },
        links: lastId && lastId !== id ? { ...links, [`${lastId}>${id}`]: true } : links,
        lastId: id,
      })
    },

    complete: (id, step) => {
      set({ blocks: { ...get().blocks, [id]: step } })
    },

    finish: () => {
      const blocks = get().blocks
      const active = Object.keys(blocks).filter((id) => blocks[id] === "active")
      if (active.length === 0) return
      set({
        blocks: { ...blocks, ...Object.fromEntries(active.map((id) => [id, "done" as const])) },
      })
    },

    replay: (steps) => {
      const blocks: Record<string, RunStep> = {}
      const links: Record<string, true> = {}
      let lastId: string | null = null
      steps.forEach(({ id, step }) => {
        blocks[id] = step
        if (lastId && lastId !== id) links[`${lastId}>${id}`] = true
        lastId = id
      })
      set({ blocks, links, lastId })
    },

    reset: () => set({ ...EMPTY }),
  }))
}

export const RunStoreContext = createContext<StoreApi<RunState> | null>(null)

export function useRunApi(): StoreApi<RunState> {
  const store = useContext(RunStoreContext)
  if (!store) throw new Error("useRun fora de FlowEditor")
  return store
}

export function useRun<T>(selector: (state: RunState) => T): T {
  return useStore(useRunApi(), selector)
}
