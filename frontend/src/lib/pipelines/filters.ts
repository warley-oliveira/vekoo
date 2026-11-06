import { matchesSearch } from "@/lib/search-text"

import { dealStatusOf, isOverdue, leadScoreOf, localDayKey, type LeadScoreConfig } from "./card-meta"
import type {
  Card,
  CustomField,
  FilterCondition,
  FilterDefinition,
  FilterValue,
  PresetFilter,
  SavedFilter,
} from "./types"

// Os filtros rápidos da barra. Moram na URL: o endereço é compartilhável e o voltar desfaz o último
// passo. No quadro, valem aqui no navegador, sobre o que já chegou: respondem na hora e continuam
// certos a cada evento de tempo real. Na lista, viram uma definição de filtro para o servidor.

export const ASSIGNEE_ME = "me"
export const ASSIGNEE_NONE = "none"

export type CustomFilters = Record<string, string[]>

export type BoardFilters = {
  q: string
  /** Ids de pessoas, `me` e `none`. */
  assignees: string[]
  labels: string[]
  stages: string[]
  priorities: string[]
  deals: string[]
  overdue: boolean
  dueFrom: string | null
  dueTo: string | null
  closeFrom: string | null
  closeTo: string | null
  valueMin: number | null
  valueMax: number | null
  probabilityMin: number | null
  probabilityMax: number | null
  scoreMin: number | null
  scoreMax: number | null
  company: string
  chat: string | null
  /** `key` do campo para os valores: opções, texto, `min..max` ou `de..até`. */
  custom: CustomFilters
}

export const EMPTY_FILTERS: BoardFilters = {
  q: "",
  assignees: [],
  labels: [],
  stages: [],
  priorities: [],
  deals: [],
  overdue: false,
  dueFrom: null,
  dueTo: null,
  closeFrom: null,
  closeTo: null,
  valueMin: null,
  valueMax: null,
  probabilityMin: null,
  probabilityMax: null,
  scoreMin: null,
  scoreMax: null,
  company: "",
  chat: null,
  custom: {},
}

/** O filtro avançado: salvo, pronto, ou montado na hora e aplicado sem salvar. */
export type AdvancedFilter =
  | { kind: "saved"; id: string }
  | { kind: "preset"; key: string }
  | { kind: "inline"; definition: FilterDefinition; name: string | null }

const CUSTOM_PREFIX = "cf."

const LIST_PARAMS = {
  assignees: "assignee",
  labels: "label",
  stages: "stage",
  priorities: "priority",
  deals: "deal",
} as const

const NUMBER_PARAMS = {
  valueMin: "valueMin",
  valueMax: "valueMax",
  probabilityMin: "probabilityMin",
  probabilityMax: "probabilityMax",
  scoreMin: "scoreMin",
  scoreMax: "scoreMax",
} as const

const DAY_PARAMS = {
  dueFrom: "dueFrom",
  dueTo: "dueTo",
  closeFrom: "closeFrom",
  closeTo: "closeTo",
} as const

const isDay = (value: string | null) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value))

function readList(params: URLSearchParams, name: string): string[] {
  const raw = params.get(name)
  return raw ? raw.split(",").filter(Boolean) : []
}

function readNumber(params: URLSearchParams, name: string): number | null {
  const raw = params.get(name)
  if (raw === null || raw === "") return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

export function parseFilters(params: URLSearchParams): BoardFilters {
  const custom: CustomFilters = {}
  for (const name of new Set(params.keys())) {
    if (name.startsWith(CUSTOM_PREFIX)) {
      const values = params.getAll(name).filter(Boolean)
      if (values.length > 0) custom[name.slice(CUSTOM_PREFIX.length)] = values
    }
  }

  const day = (name: string) => {
    const value = params.get(name)
    return isDay(value) ? value : null
  }

  return {
    q: params.get("q") ?? "",
    assignees: readList(params, LIST_PARAMS.assignees),
    labels: readList(params, LIST_PARAMS.labels),
    stages: readList(params, LIST_PARAMS.stages),
    priorities: readList(params, LIST_PARAMS.priorities),
    deals: readList(params, LIST_PARAMS.deals),
    overdue: params.get("overdue") === "1",
    dueFrom: day(DAY_PARAMS.dueFrom),
    dueTo: day(DAY_PARAMS.dueTo),
    closeFrom: day(DAY_PARAMS.closeFrom),
    closeTo: day(DAY_PARAMS.closeTo),
    valueMin: readNumber(params, NUMBER_PARAMS.valueMin),
    valueMax: readNumber(params, NUMBER_PARAMS.valueMax),
    probabilityMin: readNumber(params, NUMBER_PARAMS.probabilityMin),
    probabilityMax: readNumber(params, NUMBER_PARAMS.probabilityMax),
    scoreMin: readNumber(params, NUMBER_PARAMS.scoreMin),
    scoreMax: readNumber(params, NUMBER_PARAMS.scoreMax),
    company: params.get("company") ?? "",
    chat: params.get("chat"),
    custom,
  }
}

export function writeFilters(params: URLSearchParams, filters: BoardFilters) {
  const set = (name: string, value: string | null | undefined) => {
    if (value) params.set(name, value)
    else params.delete(name)
  }

  set("q", filters.q)
  for (const [key, name] of Object.entries(LIST_PARAMS)) {
    set(name, filters[key as keyof typeof LIST_PARAMS].join(","))
  }
  for (const [key, name] of Object.entries(NUMBER_PARAMS)) {
    const value = filters[key as keyof typeof NUMBER_PARAMS]
    set(name, value === null ? null : String(value))
  }
  for (const [key, name] of Object.entries(DAY_PARAMS)) {
    set(name, filters[key as keyof typeof DAY_PARAMS])
  }
  set("overdue", filters.overdue ? "1" : null)
  set("company", filters.company)
  set("chat", filters.chat)

  for (const name of [...params.keys()]) {
    if (name.startsWith(CUSTOM_PREFIX)) params.delete(name)
  }
  for (const [key, values] of Object.entries(filters.custom)) {
    for (const value of values) params.append(`${CUSTOM_PREFIX}${key}`, value)
  }
}

export function parseAdvanced(params: URLSearchParams): AdvancedFilter | null {
  const saved = params.get("saved")
  if (saved) return { kind: "saved", id: saved }
  const preset = params.get("preset")
  if (preset) return { kind: "preset", key: preset }
  const raw = params.get("filter")
  if (!raw) return null
  try {
    const definition = JSON.parse(raw) as FilterDefinition
    if (!definition || typeof definition !== "object") return null
    return {
      kind: "inline",
      definition: {
        version: 1,
        all: Array.isArray(definition.all) ? definition.all : [],
        any: Array.isArray(definition.any) ? definition.any : [],
      },
      name: params.get("filterName"),
    }
  } catch {
    return null
  }
}

export function writeAdvanced(params: URLSearchParams, advanced: AdvancedFilter | null) {
  for (const name of ["saved", "preset", "filter", "filterName"]) params.delete(name)
  if (!advanced) return
  if (advanced.kind === "saved") params.set("saved", advanced.id)
  else if (advanced.kind === "preset") params.set("preset", advanced.key)
  else {
    params.set("filter", JSON.stringify(advanced.definition))
    if (advanced.name) params.set("filterName", advanced.name)
  }
}

/** A consulta do filtro avançado, para `GET /boards/:id` e `GET /cards`. */
export function advancedQuery(advanced: AdvancedFilter | null): string {
  if (!advanced) return ""
  if (advanced.kind === "saved") return `savedFilterId=${encodeURIComponent(advanced.id)}`
  if (advanced.kind === "preset") return `presetKey=${encodeURIComponent(advanced.key)}`
  return `filter=${encodeURIComponent(JSON.stringify(advanced.definition))}`
}

/** Quantos filtros há na barra, sem contar a busca. Um intervalo conta um. */
export function countActiveFilters(filters: BoardFilters): number {
  return (
    (filters.assignees.length > 0 ? 1 : 0) +
    (filters.labels.length > 0 ? 1 : 0) +
    (filters.stages.length > 0 ? 1 : 0) +
    (filters.priorities.length > 0 ? 1 : 0) +
    (filters.deals.length > 0 ? 1 : 0) +
    (filters.overdue ? 1 : 0) +
    (filters.dueFrom || filters.dueTo ? 1 : 0) +
    (filters.closeFrom || filters.closeTo ? 1 : 0) +
    (filters.valueMin !== null || filters.valueMax !== null ? 1 : 0) +
    (filters.probabilityMin !== null || filters.probabilityMax !== null ? 1 : 0) +
    (filters.scoreMin !== null || filters.scoreMax !== null ? 1 : 0) +
    (filters.company ? 1 : 0) +
    (filters.chat ? 1 : 0) +
    Object.keys(filters.custom).length
  )
}

export function hasAnyFilter(filters: BoardFilters): boolean {
  return Boolean(filters.q) || countActiveFilters(filters) > 0
}

/* ---------- valores de campo personalizado ---------- */

const RANGE_SEPARATOR = ".."

export function readRange(value: string | undefined): { from: string; to: string } {
  const [from = "", to = ""] = (value ?? "").split(RANGE_SEPARATOR)
  return { from, to }
}

export function writeRange(from: string | number | null, to: string | number | null): string {
  const a = from === null ? "" : String(from)
  const b = to === null ? "" : String(to)
  return a || b ? `${a}${RANGE_SEPARATOR}${b}` : ""
}

/* ---------- no navegador ---------- */

export type FilterContext = {
  accountId: string | undefined
  leadScore: LeadScoreConfig | null
  customFields: CustomField[]
}

/** O dia em que o instante cai. O filtro de prazo é por dia, sem hora. */
const dayOf = (timestamp: number) => localDayKey(new Date(timestamp))

function inDayRange(day: string | null, from: string | null, to: string | null): boolean {
  if (!from && !to) return true
  if (!day) return false
  if (from && day < from) return false
  if (to && day > to) return false
  return true
}

function inNumberRange(value: number | null, min: number | null, max: number | null): boolean {
  if (min === null && max === null) return true
  if (value === null) return false
  if (min !== null && value < min) return false
  if (max !== null && value > max) return false
  return true
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || value === ""
}

function matchesCustom(field: CustomField | undefined, raw: unknown, wanted: string[]): boolean {
  // O campo pode ter sido apagado com o filtro ainda na URL: não some com o quadro por isso.
  if (!field) return true

  switch (field.fieldType) {
    case "select":
    case "user":
      return !isBlank(raw) && wanted.includes(String(raw))
    case "checkbox":
      return wanted[0] === "1" ? raw === true || raw === "true" : !(raw === true || raw === "true")
    case "number": {
      const { from, to } = readRange(wanted[0])
      const value = isBlank(raw) ? null : Number(raw)
      return inNumberRange(
        value !== null && Number.isFinite(value) ? value : null,
        from === "" ? null : Number(from),
        to === "" ? null : Number(to)
      )
    }
    case "date": {
      const { from, to } = readRange(wanted[0])
      return inDayRange(isBlank(raw) ? null : String(raw).slice(0, 10), from || null, to || null)
    }
    default:
      return !isBlank(raw) && matchesSearch(String(raw), wanted[0] ?? "")
  }
}

export function matchesFilters(card: Card, filters: BoardFilters, context: FilterContext): boolean {
  if (filters.q && !matchesSearch(card.title, filters.q)) return false

  if (filters.assignees.length > 0) {
    const matches = filters.assignees.some((wanted) => {
      if (wanted === ASSIGNEE_NONE) return !card.assignedToId
      if (wanted === ASSIGNEE_ME) return card.assignedToId === context.accountId
      return card.assignedToId === wanted
    })
    if (!matches) return false
  }

  if (filters.labels.length > 0 && !card.labels.some((label) => filters.labels.includes(label.id))) {
    return false
  }
  if (filters.priorities.length > 0 && !filters.priorities.includes(card.priority ?? "")) return false
  if (filters.deals.length > 0 && !filters.deals.includes(dealStatusOf(card))) return false
  if (filters.overdue && !isOverdue(card)) return false
  if (filters.chat && card.chatId !== filters.chat) return false
  if (filters.company && !matchesSearch(card.companyName ?? "", filters.company)) return false

  if (!inDayRange(card.dueDate ? dayOf(card.dueDate) : null, filters.dueFrom, filters.dueTo)) {
    return false
  }
  if (!inDayRange(card.expectedCloseDate, filters.closeFrom, filters.closeTo)) return false
  if (!inNumberRange(card.dealValue, filters.valueMin, filters.valueMax)) return false
  if (!inNumberRange(card.dealProbability, filters.probabilityMin, filters.probabilityMax)) {
    return false
  }
  if (filters.scoreMin !== null || filters.scoreMax !== null) {
    const score = leadScoreOf(card, context.leadScore)
    if (!inNumberRange(score, filters.scoreMin, filters.scoreMax)) return false
  }

  for (const [key, wanted] of Object.entries(filters.custom)) {
    const field = context.customFields.find((candidate) => candidate.key === key)
    if (!matchesCustom(field, card.customFieldValues?.[key], wanted)) return false
  }

  return true
}

/* ---------- para o servidor ---------- */

function numberRangeConditions(
  field: string,
  min: number | null,
  max: number | null
): FilterCondition[] {
  const conditions: FilterCondition[] = []
  if (min !== null) conditions.push({ field, operator: "gte", value: min })
  if (max !== null) conditions.push({ field, operator: "lte", value: max })
  return conditions
}

function dateTimeRangeConditions(
  field: string,
  from: string | null,
  to: string | null
): FilterCondition[] {
  if (!from && !to) return []
  // De um dia só em aberto: uma ponta distante faz o `between` valer para qualquer campo de data.
  return [
    {
      field,
      operator: "between",
      value: [from ?? "1970-01-01", `${to ?? "2999-12-31"}T23:59:59`],
    },
  ]
}

function customConditions(field: CustomField, wanted: string[]): FilterCondition[] {
  const name = `custom.${field.key}`
  switch (field.fieldType) {
    case "select":
      return [{ field: name, operator: "in", value: wanted }]
    case "user":
      return [{ field: name, operator: "in", value: wanted }]
    case "checkbox":
      return [{ field: name, operator: "eq", value: wanted[0] === "1" }]
    case "number": {
      const { from, to } = readRange(wanted[0])
      return numberRangeConditions(
        name,
        from === "" ? null : Number(from),
        to === "" ? null : Number(to)
      )
    }
    case "date": {
      const { from, to } = readRange(wanted[0])
      return [{ field: name, operator: "between", value: [from || "1970-01-01", to || "2999-12-31"] }]
    }
    default:
      return [{ field: name, operator: "contains", value: wanted[0] ?? "" }]
  }
}

/**
 * Os filtros da barra como definição, somados ao filtro avançado. A busca e a conversa ficam de
 * fora: têm parâmetro próprio em `GET /cards`.
 *
 * "Sem responsável" junto de pessoas pede um "ou", e a definição só tem um grupo `any`: se o
 * filtro avançado já usa o dele, vale só a lista de pessoas.
 */
export function compileFilters(
  filters: BoardFilters,
  context: FilterContext,
  base: FilterDefinition | null
): FilterDefinition | null {
  const all: FilterCondition[] = [...(base?.all ?? [])]
  const any: FilterCondition[] = [...(base?.any ?? [])]

  if (filters.assignees.length > 0) {
    const people: FilterValue = filters.assignees
      .filter((id) => id !== ASSIGNEE_NONE)
      .map((id) => (id === ASSIGNEE_ME ? (context.accountId ?? id) : id))
    const wantsNone = filters.assignees.includes(ASSIGNEE_NONE)
    const list = people as string[]

    if (wantsNone && list.length === 0) {
      all.push({ field: "assigned_to_id", operator: "is_empty", value: null })
    } else if (wantsNone && any.length === 0) {
      any.push({ field: "assigned_to_id", operator: "in", value: list })
      any.push({ field: "assigned_to_id", operator: "is_empty", value: null })
    } else {
      all.push({ field: "assigned_to_id", operator: "in", value: list })
    }
  }

  if (filters.labels.length > 0) {
    all.push({ field: "label_ids", operator: "contains_any", value: filters.labels })
  }
  if (filters.stages.length > 0) {
    all.push({ field: "stage_id", operator: "in", value: filters.stages })
  }
  if (filters.priorities.length > 0) {
    all.push({ field: "priority", operator: "in", value: filters.priorities })
  }
  if (filters.deals.length > 0) {
    all.push({ field: "deal_status", operator: "in", value: filters.deals })
  }
  if (filters.overdue) {
    all.push({
      field: "due_date",
      operator: "before",
      value: { type: "relative", token: "now" },
    })
    all.push({ field: "completed_at", operator: "is_empty", value: null })
  }
  if (filters.company) {
    all.push({ field: "company_name", operator: "contains", value: filters.company })
  }
  all.push(...dateTimeRangeConditions("due_date", filters.dueFrom, filters.dueTo))
  all.push(...dateTimeRangeConditions("expected_close_date", filters.closeFrom, filters.closeTo))
  all.push(...numberRangeConditions("deal_value", filters.valueMin, filters.valueMax))
  all.push(
    ...numberRangeConditions("deal_probability", filters.probabilityMin, filters.probabilityMax)
  )
  if (context.leadScore) {
    all.push(
      ...numberRangeConditions(
        `custom.${context.leadScore.fieldKey}`,
        filters.scoreMin,
        filters.scoreMax
      )
    )
  }
  for (const [key, wanted] of Object.entries(filters.custom)) {
    const field = context.customFields.find((candidate) => candidate.key === key)
    if (field) all.push(...customConditions(field, wanted))
  }

  if (all.length === 0 && any.length === 0) return null
  return { version: 1, all, any }
}

/** O nome de um filtro avançado, para o chip e para o construtor. */
export function labelOfAdvanced(
  advanced: AdvancedFilter,
  savedFilters: SavedFilter[],
  presets: PresetFilter[],
  t: (key: string) => string
): string {
  if (advanced.kind === "saved") {
    return (
      savedFilters.find((filter) => filter.id === advanced.id)?.name ??
      t("pipelines.filters.savedFallback")
    )
  }
  if (advanced.kind === "preset") {
    const preset = presets.find((candidate) => candidate.key === advanced.key)
    return preset ? t(preset.nameKey) : t("pipelines.filters.savedFallback")
  }
  return advanced.name || t("pipelines.filters.unsavedName")
}
