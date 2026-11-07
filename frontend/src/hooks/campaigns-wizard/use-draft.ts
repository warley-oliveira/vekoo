import { createContext, useContext } from "react"
import { mutate as globalMutate } from "swr"
import { create } from "zustand"

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error" | "locked"

type SaveState = {
  status: SaveStatus
  savedAt: number | null
  error: unknown
  /** A pessoa está saindo da tela, e a saída espera o rascunho terminar de salvar. */
  leaving: boolean
}

/** Fora do formulário, para só o indicador redesenhar: digitar não passa pela tela inteira. */
export const useSaveState = create<SaveState>()(() => ({
  status: "idle",
  savedAt: null,
  error: null,
  leaving: false,
}))

export type Draft = {
  /** `null` até existir o que guardar. */
  campaignId: string | null
  /** Agora, sem esperar a pausa na digitação. Rejeita se não salvou. */
  flush: () => Promise<void>
  /** O id do rascunho, criando se ainda não houver. */
  ensureDraft: () => Promise<string>
  /** Lançou ou descartou: daqui para frente nada mais é salvo. */
  finish: () => void
}

export const DraftContext = createContext<Draft | null>(null)

export function useDraft(): Draft {
  const draft = useContext(DraftContext)
  if (!draft) throw new Error("useDraft precisa estar dentro de DraftProvider")
  return draft
}

export function reloadCampaignLists() {
  return globalMutate(
    (key) => typeof key === "string" && key.startsWith("/campaigns") && !key.includes("/recipient"),
    undefined,
    { revalidate: true }
  )
}
