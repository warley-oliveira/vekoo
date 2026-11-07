import { createContext, useContext } from "react"

import type { FlowDetail } from "@/lib/flows/types"

// O fluxo aberto (nome, canais, versões), para quem está dentro do editor. O conteúdo editável não mora
// aqui: fica no store, para uma revalidação do servidor não apagar o que está sendo digitado.

export type FlowContextValue = {
  flow: FlowDetail
  reload: () => Promise<unknown>
}

export const FlowContext = createContext<FlowContextValue | null>(null)

export function useFlowContext(): FlowContextValue {
  const value = useContext(FlowContext)
  if (!value) throw new Error("useFlowContext fora de FlowEditor")
  return value
}
