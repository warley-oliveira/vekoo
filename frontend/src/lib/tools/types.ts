import type { ToolParameter } from "@/lib/flows/types"

// O contrato de ferramentas (docs/migration/api/automation.md). "Ferramenta" é o que se instala do catálogo;
// "função" é o que um bloco executa, escrita aqui ou vinda de uma ferramenta.

export const PARAMETER_TYPES = ["string", "number", "integer", "boolean", "array", "object"] as const
export type ParameterType = (typeof PARAMETER_TYPES)[number]

/** Os tipos que um item de lista pode ter: lista de lista a API não representa. */
export const ITEM_TYPES = ["string", "number", "integer", "boolean", "object"] as const

/** `mockValue` é o valor de teste, que fica guardado com a função. */
export type FunctionParameter = Omit<ToolParameter, "properties" | "itemsProperties"> & {
  mockValue?: string
  properties?: FunctionParameter[]
  itemsProperties?: FunctionParameter[]
}

export type CredentialSpec = {
  name: string
  label?: string | null
  type?: "string" | "password" | "number" | null
  required?: boolean | string | null
  help?: string | null
}

/** O que identifica uma ferramenta: é o que vem junto de cada função instalada. */
export type ToolBrand = {
  id: string
  name: string
  slug: string
  icon: string | null
  color: string | null
  imageUrl: string | null
}

export type FunctionTemplate = {
  name: string
  description: string
  parameters: FunctionParameter[]
}

export type CatalogTool = ToolBrand & {
  description: string
  category: string | null
  active: boolean
  credentialsSchema: CredentialSpec[]
  requiresCredentials: boolean
  functionCount: number
  /** Só no detalhe. */
  functionTemplates?: FunctionTemplate[]
}

export type ToolInstallation = {
  id: string
  toolId: string
  enabled: boolean
  /** As chaves nunca saem da API: só se existem. */
  hasCredentials: boolean
  toolFunctionIds: string[]
  createdAt: number
  updatedAt: number
  tool: (ToolBrand & Pick<CatalogTool, "description" | "category" | "credentialsSchema">) | null
}

export type ToolFunction = {
  id: string
  name: string
  description: string | null
  /** Função instalada não mostra o código: quem quer ver ou mudar personaliza. */
  jsCode: string | null
  parameters: FunctionParameter[]
  parametersJson: string | null
  toolInstallationId: string | null
  locked: boolean
  tool: ToolBrand | null
  createdAt: number
  updatedAt: number
}

export type ToolFunctionInput = {
  name: string
  description: string
  jsCode: string
  parameters: FunctionParameter[]
}
