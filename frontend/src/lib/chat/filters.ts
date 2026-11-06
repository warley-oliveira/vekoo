import type { Chat, FilterCondition } from "./types"

// Os filtros avançados, sem React. O servidor é quem decide de verdade; o cliente só
// reavalia o que dá para reavaliar com o evento do socket, para a lista responder na hora.

const NO_VALUE_OPERATORS = new Set(["is_set", "is_empty"])

export function needsNoValue(operator: string): boolean {
  return NO_VALUE_OPERATORS.has(operator)
}

/** A condição está pronta para ir à API? Linha pela metade no painel não filtra nada. */
export function isCompleteCondition(condition: FilterCondition): boolean {
  if (!condition.attributeKey || !condition.filterOperator) return false
  if (needsNoValue(condition.filterOperator)) return true
  return condition.values.some((value) => value.trim().length > 0)
}

/**
 * Só o que vai à API, com referência estável por conteúdo em quem compara a assinatura.
 * Rótulo de chip nunca entra aqui: é derivado na tela. Na origem ele morava na condição, e
 * a chave da lista mudava sozinha quando as listas de etiquetas e de pessoas chegavam.
 */
export function toQueryConditions(conditions: FilterCondition[]): FilterCondition[] {
  return conditions.filter(isCompleteCondition).map((condition) => ({
    attributeKey: condition.attributeKey,
    filterOperator: condition.filterOperator,
    values: needsNoValue(condition.filterOperator) ? [] : condition.values,
    queryOperator: condition.queryOperator === "or" ? "or" : "and",
    ...(condition.valueType ? { valueType: condition.valueType } : {}),
  }))
}

/** `filters[0][attributeKey]=...`, a lista em forma de mapa que a API entende na URL. */
export function appendFilterParams(params: URLSearchParams, conditions: FilterCondition[]): void {
  conditions.forEach((condition, index) => {
    params.append(`filters[${index}][attributeKey]`, condition.attributeKey)
    params.append(`filters[${index}][filterOperator]`, condition.filterOperator)
    params.append(`filters[${index}][queryOperator]`, condition.queryOperator)
    if (condition.valueType) params.append(`filters[${index}][valueType]`, condition.valueType)
    condition.values.forEach((value) => params.append(`filters[${index}][values][]`, value))
  })
}

/* ---------- reavaliação local ---------- */

const DATE_FIELDS = new Set(["created_at", "last_message_at"])
const NUMBER_FIELDS = new Set(["unread_messages"])

/**
 * Do nome na condição para o campo no evento do socket.
 *
 * É uma lista de permissão de propósito: a lista de campos filtráveis cresce mais rápido que
 * o evento, e decidir com `undefined` tiraria conversas boas da lista. O que não estiver
 * aqui vai para o servidor. Campo personalizado e etiqueta também poderiam ser lidos daqui,
 * mas têm tipos que só o servidor compara do mesmo jeito.
 */
const PAYLOAD_KEYS: Record<string, keyof Chat> = {
  automation_enabled: "automationEnabled",
  assigned_account_id: "assignedAccountId",
  connector_id: "connectorId",
  team_id: "teamId",
  status: "status",
  audience_type: "audienceType",
  last_message_by: "lastMessageBy",
  last_message_type: "lastMessageType",
  unread_messages: "unreadMessages",
  created_at: "createdAt",
  last_message_at: "lastMessageAt",
}

/** Os que este módulo sabe reproduzir. `text_contains`, `is_set` e `is_empty` ficam no servidor. */
const CLIENT_OPERATORS = new Set([
  "equal_to",
  "not_equal_to",
  "is_less_than",
  "is_greater_than",
])

/** Dá para decidir estes filtros só com o evento do socket? Uma condição fora já diz que não. */
export function supportsClientFilter(conditions: FilterCondition[]): boolean {
  return conditions.every(
    (condition) =>
      condition.attributeKey in PAYLOAD_KEYS && CLIENT_OPERATORS.has(condition.filterOperator)
  )
}

function comparable(value: unknown): string {
  return value === null || value === undefined ? "" : String(value)
}

function dayBounds(value: string): [number, number] | null {
  const start = new Date(`${value}T00:00:00`)
  if (Number.isNaN(start.getTime())) return null
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return [start.getTime(), end.getTime()]
}

function evaluate(chat: Chat, condition: FilterCondition): boolean {
  const field = PAYLOAD_KEYS[condition.attributeKey]
  const current = chat[field]
  const target = condition.values[0] ?? ""

  if (DATE_FIELDS.has(condition.attributeKey)) {
    const at = typeof current === "number" ? current : null
    const bounds = dayBounds(target)
    if (at === null || !bounds) return false
    if (condition.filterOperator === "equal_to") return at >= bounds[0] && at < bounds[1]
    if (condition.filterOperator === "not_equal_to") return at < bounds[0] || at >= bounds[1]
    return condition.filterOperator === "is_less_than" ? at < bounds[0] : at > bounds[0]
  }

  if (NUMBER_FIELDS.has(condition.attributeKey)) {
    const value = Number(current ?? 0)
    const reference = Number(target)
    switch (condition.filterOperator) {
      case "equal_to":
        return value === reference
      case "not_equal_to":
        return value !== reference
      case "is_less_than":
        return value < reference
      default:
        return value > reference
    }
  }

  const matches = condition.values.map(comparable).includes(comparable(current))
  if (condition.filterOperator === "equal_to") return matches
  if (condition.filterOperator === "not_equal_to") return !matches
  return false
}

/** Cada condição diz como se liga à anterior; a primeira não tem anterior. */
export function evaluateConditions(chat: Chat, conditions: FilterCondition[]): boolean {
  if (conditions.length === 0) return true

  let result = evaluate(chat, conditions[0])
  for (const condition of conditions.slice(1)) {
    const next = evaluate(chat, condition)
    result = condition.queryOperator === "or" ? result || next : result && next
  }
  return result
}
