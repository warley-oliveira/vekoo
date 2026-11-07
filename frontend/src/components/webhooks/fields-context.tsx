import { createContext, useContext, type ReactNode } from "react"

import type { ReceivedGroup } from "@/lib/webhooks/fields"

const FieldsContext = createContext<ReceivedGroup[]>([])

/** O que já chegou neste webhook: é o que todo campo de texto das ações oferece como variável. */
export function ReceivedFieldsProvider({ groups, children }: { groups: ReceivedGroup[]; children: ReactNode }) {
  return <FieldsContext.Provider value={groups}>{children}</FieldsContext.Provider>
}

export function useReceivedGroups() {
  return useContext(FieldsContext)
}
