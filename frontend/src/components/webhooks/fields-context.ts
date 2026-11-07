import { createContext, useContext } from "react"

import type { ReceivedGroup } from "@/lib/webhooks/fields"

/** O que já chegou neste webhook: é o que todo campo de texto das ações oferece como variável. */
export const ReceivedFieldsContext = createContext<ReceivedGroup[]>([])

export function useReceivedGroups() {
  return useContext(ReceivedFieldsContext)
}
