// O que chegou numa requisição, do jeito que a tela oferece: `body.cliente.nome` vira a variável `{{body.cliente.nome}}`.

export type ReceivedField = {
  /** O caminho inteiro: é o que vai entre chaves. */
  key: string
  /** Sem o grupo: `cliente.nome`. */
  name: string
  value: string
}

export type ReceivedGroup = { group: string; fields: ReceivedField[] }

const GROUP_ORDER = ["body", "query", "headers"]

function asText(value: unknown): string {
  if (value === null || value === undefined) return ""
  return typeof value === "string" ? value : JSON.stringify(value)
}

export function groupReceivedFields(payload: Record<string, unknown> | null | undefined): ReceivedGroup[] {
  const groups = new Map<string, ReceivedField[]>()
  for (const [key, value] of Object.entries(payload ?? {})) {
    const dot = key.indexOf(".")
    if (dot === -1) continue
    const group = key.slice(0, dot)
    groups.set(group, [...(groups.get(group) ?? []), { key, name: key.slice(dot + 1), value: asText(value) }])
  }
  return GROUP_ORDER.filter((group) => groups.has(group))
    .map((group) => ({ group, fields: groups.get(group) ?? [] }))
    .concat([...groups.entries()].filter(([group]) => !GROUP_ORDER.includes(group)).map(([group, fields]) => ({ group, fields })))
}

export function hasReceivedFields(payload: Record<string, unknown> | null | undefined): boolean {
  return Object.keys(payload ?? {}).length > 0
}

/** Um corpo de exemplo para o teste: o que já chegou antes, ou algo que pareça um pedido de verdade. */
export function sampleBody(payload: Record<string, unknown> | null | undefined, fallback: Record<string, unknown>): string {
  const body: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(payload ?? {})) {
    if (!key.startsWith("body.")) continue
    let cursor = body
    const parts = key.slice("body.".length).split(".")
    parts.forEach((part, index) => {
      if (index === parts.length - 1) {
        cursor[part] = value
      } else {
        const next = cursor[part]
        if (typeof next !== "object" || next === null) cursor[part] = {}
        cursor = cursor[part] as Record<string, unknown>
      }
    })
  }
  return JSON.stringify(Object.keys(body).length > 0 ? body : fallback, null, 2)
}
