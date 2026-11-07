import type { CatalogTool, CredentialSpec, ToolFunction } from "./types"

// Como o catálogo se organiza na tela.

/** A ordem das seções. Categoria nova entra em "outras". */
const CATEGORY_ORDER = ["utilities", "ecommerce", "crm", "marketing", "communication", "other"]

export function knownCategory(category: string | null | undefined): string {
  return category && CATEGORY_ORDER.includes(category) ? category : "other"
}

export function groupByCategory<T extends Pick<CatalogTool, "category">>(tools: T[]): { category: string; tools: T[] }[] {
  const groups = new Map<string, T[]>()
  for (const tool of tools) {
    const category = knownCategory(tool.category)
    groups.set(category, [...(groups.get(category) ?? []), tool])
  }
  return CATEGORY_ORDER.filter((category) => groups.has(category)).map((category) => ({
    category,
    tools: groups.get(category) ?? [],
  }))
}

/** A API guarda `required` como veio do catálogo: booleano ou texto. */
export function isRequired(spec: Pick<CredentialSpec, "required">): boolean {
  return spec.required === true || spec.required === "true"
}

export type FunctionGroup = {
  /** O id da ferramenta; `custom` são as escritas aqui. */
  key: string
  tool: ToolFunction["tool"]
  functions: ToolFunction[]
}

export const CUSTOM_GROUP = "custom"

/** As escritas aqui primeiro, que são as que a pessoa mexe; depois uma seção por ferramenta. */
export function groupFunctions(functions: ToolFunction[], language: string): FunctionGroup[] {
  const custom: ToolFunction[] = []
  const byTool = new Map<string, FunctionGroup>()

  for (const fn of functions) {
    if (!fn.tool) {
      custom.push(fn)
      continue
    }
    const group = byTool.get(fn.tool.id)
    if (group) group.functions.push(fn)
    else byTool.set(fn.tool.id, { key: fn.tool.id, tool: fn.tool, functions: [fn] })
  }

  const tools = [...byTool.values()].sort((a, b) => (a.tool?.name ?? "").localeCompare(b.tool?.name ?? "", language))
  return [...(custom.length > 0 ? [{ key: CUSTOM_GROUP, tool: null, functions: custom }] : []), ...tools]
}
