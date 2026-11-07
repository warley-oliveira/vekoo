import { createContext, useContext, type ReactNode } from "react"

import type { BlockData } from "@/lib/flows/types"

// O bloco aberto no inspetor, para os campos se ligarem a ele pelo nome.

export type BlockSet = (patch: BlockData, options?: { coalesce?: string; renames?: Record<string, string> }) => void

export type BlockForm = {
  id: string
  type: string
  data: BlockData
  set: BlockSet
}

const FormContext = createContext<BlockForm | null>(null)

export function BlockFormProvider({ value, children }: { value: BlockForm; children: ReactNode }) {
  return <FormContext.Provider value={value}>{children}</FormContext.Provider>
}

// oxlint-disable-next-line react/only-export-components
export function useBlockForm(): BlockForm {
  const form = useContext(FormContext)
  if (!form) throw new Error("Campo do inspetor fora de um bloco")
  return form
}

// oxlint-disable-next-line react/only-export-components
export const str = (value: unknown): string => (value == null ? "" : String(value))
