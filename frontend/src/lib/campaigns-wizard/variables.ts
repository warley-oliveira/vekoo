import type { RecipientSample, RecipientVariable } from "./types"

// As variáveis da mensagem: o mesmo marcador e a mesma regra de `Outreach::MessageContent`, no servidor.
// O que não existir sai como está na mensagem: é por isso que a tela confere antes de lançar.

const MARKER = /\{\{\s*([^{}]+?)\s*\}\}/g

export const BUILT_IN_VARIABLES = ["nome", "telefone"] as const
const BUILT_IN_ALIASES = new Set(["nome", "name", "telefone", "phone"])

export const asToken = (name: string) => `{{${name}}}`

/** `String#underscore` do Rails, que é o que o servidor faz com a chave e com o marcador. */
export function underscore(name: string): string {
  return name
    .replace(/([A-Z\d]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([a-z\d])([A-Z])/g, "$1_$2")
    .replace(/-/g, "_")
    .toLowerCase()
}

export function tokensIn(text: string): string[] {
  return [...new Set(Array.from(text.matchAll(MARKER), (match) => match[1]))]
}

/** "Data de nascimento" vira `data_de_nascimento`: é assim que a coluna vai para o servidor. */
export function variableKeyOf(column: string): string {
  return (
    column
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "coluna"
  )
}

/** A coluna e a chave dela, sem repetir chave nem tomar o lugar das variáveis prontas. */
export function variablesFromColumns(columns: string[]): { column: string; key: string }[] {
  const taken = new Set<string>(BUILT_IN_ALIASES)

  return columns.map((column) => {
    const base = variableKeyOf(column)
    let key = base
    for (let suffix = 2; taken.has(key); suffix += 1) key = `${base}_${suffix}`
    taken.add(key)
    return { column, key }
  })
}

export type VariableProblem = {
  token: string
  /** Quantas pessoas têm a variável. Zero: não existe para ninguém. */
  count: number
}

/**
 * O que está no texto e não vai ser trocado para todo mundo. Sem ninguém no público ainda, a conta é
 * contra zero: `{{cupom}}` só existe depois de importar uma planilha com essa coluna.
 */
export function variableProblems(
  texts: string[],
  variables: RecipientVariable[],
  total: number
): VariableProblem[] {
  const counts = new Map(variables.map((variable) => [variable.name, variable.count]))
  const problems = new Map<string, VariableProblem>()

  for (const text of texts) {
    for (const token of tokensIn(text)) {
      if (BUILT_IN_ALIASES.has(token)) continue

      const count = counts.get(token) ?? counts.get(underscore(token)) ?? 0
      if (total === 0 || count < total) problems.set(token, { token, count })
    }
  }
  return [...problems.values()]
}

/** A mensagem como esta pessoa vai ler. Uma passada só, como no servidor. */
export function fillMessage(text: string, sample: RecipientSample | null, fallbackName: string, fallbackPhone: string): string {
  return text.replace(MARKER, (marker, key: string) => {
    if (key === "nome" || key === "name") return sample?.name ?? fallbackName
    if (key === "telefone" || key === "phone") return sample?.phone ?? fallbackPhone

    const variables = sample?.variables ?? {}
    const value = variables[key] ?? variables[underscore(key)]
    return value === undefined || value === null ? marker : String(value)
  })
}
