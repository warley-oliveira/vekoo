import type { ContactStatus } from "./types"

// O estado da tela mora na URL: é ele que faz o voltar funcionar e a visão poder ser
// compartilhada. Este módulo traduz nos dois sentidos, entre a URL (curta, para gente ler)
// e a API (camelCase, com a mesma forma em `GET /contacts`, nas ações em lote e na
// exportação). Sem texto de tela: quem traduz é quem desenha.

export const SORTABLE_COLUMNS = [
  "last_message_at",
  "created_at",
  "user_name",
  "status",
  "unread_messages",
] as const

export type SortColumn = (typeof SORTABLE_COLUMNS)[number]

export const DEFAULT_SORT: { column: SortColumn; desc: boolean } = {
  column: "last_message_at",
  desc: true,
}

export const PER_PAGE_OPTIONS = [25, 50, 100]
export const DEFAULT_PER_PAGE = 25

export const ASSIGNEE_ME = "me"
export const ASSIGNEE_NONE = "unassigned"
export const TEAM_NONE = "none"

export type AutomationValue = "on" | "off"

/**
 * Uma condição sobre campo personalizado:
 *
 * - `has`: o texto contém;
 * - `in`: é uma destas opções (uma entrada por opção marcada);
 * - `gt`, `lt`: número maior ou menor;
 * - `yes`, `no`: caixa marcada ou não. Quem nunca preencheu conta como "não";
 * - `from`, `to`: data, com os dois dias incluídos.
 */
export type FieldFilterOperator = "has" | "in" | "gt" | "lt" | "yes" | "no" | "from" | "to"

export type FieldFilter = {
  key: string
  op: FieldFilterOperator
  value: string
}

export type ContactFilters = {
  q: string
  connectors: string[]
  tags: string[]
  teams: string[]
  assignees: string[]
  status: ContactStatus[]
  automation: AutomationValue[]
  session: boolean
  /** Criado de, em `YYYY-MM-DD`. O servidor lê no fuso da organização. */
  from: string | null
  to: string | null
  fields: FieldFilter[]
}

export const EMPTY_FILTERS: ContactFilters = {
  q: "",
  connectors: [],
  tags: [],
  teams: [],
  assignees: [],
  status: [],
  automation: [],
  session: false,
  from: null,
  to: null,
  fields: [],
}

export type ContactListState = {
  filters: ContactFilters
  sort: { column: SortColumn; desc: boolean }
  page: number
  perPage: number
}

/* ---------- URL ---------- */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const FIELD_OPERATORS: readonly FieldFilterOperator[] = [
  "has",
  "in",
  "gt",
  "lt",
  "yes",
  "no",
  "from",
  "to",
]
// Precisa bater com `Chats::Filters::CUSTOM_KEY`, no servidor.
const FIELD_KEY = /^[\p{L}\p{N}_-]+$/u
const FIELD_SEPARATOR = "~"

function readList(params: URLSearchParams, name: string): string[] {
  const seen = new Set<string>()
  for (const item of (params.get(name) ?? "").split(",")) {
    const value = item.trim()
    if (value) seen.add(value)
  }
  return [...seen]
}

function readDate(params: URLSearchParams, name: string): string | null {
  const value = params.get(name)
  return value && DATE_ONLY.test(value) ? value : null
}

/** `cidade~has~Curi`. O valor pode conter o separador: só os dois primeiros contam. */
function parseFieldFilter(raw: string): FieldFilter | null {
  const first = raw.indexOf(FIELD_SEPARATOR)
  if (first <= 0) return null

  const second = raw.indexOf(FIELD_SEPARATOR, first + 1)
  const key = raw.slice(0, first)
  const op = raw.slice(first + 1, second === -1 ? undefined : second) as FieldFilterOperator
  const value = second === -1 ? "" : raw.slice(second + 1)

  if (!FIELD_KEY.test(key) || !FIELD_OPERATORS.includes(op)) return null
  if (op !== "yes" && op !== "no" && !value) return null

  return { key, op, value }
}

function serializeFieldFilter({ key, op, value }: FieldFilter): string {
  return value ? [key, op, value].join(FIELD_SEPARATOR) : [key, op].join(FIELD_SEPARATOR)
}

export function parseListState(params: URLSearchParams): ContactListState {
  const sortColumn = params.get("sort") as SortColumn | null
  const page = Number(params.get("page"))
  const perPage = Number(params.get("perPage"))

  return {
    filters: {
      q: params.get("q") ?? "",
      connectors: readList(params, "connectors"),
      tags: readList(params, "tags"),
      teams: readList(params, "teams"),
      assignees: readList(params, "assignees"),
      status: readList(params, "status").filter(
        (value): value is ContactStatus => value === "open" || value === "closed"
      ),
      automation: readList(params, "automation").filter(
        (value): value is AutomationValue => value === "on" || value === "off"
      ),
      session: params.get("session") === "1",
      from: readDate(params, "from"),
      to: readDate(params, "to"),
      fields: params
        .getAll("cf")
        .map(parseFieldFilter)
        .filter((filter): filter is FieldFilter => filter !== null),
    },
    sort:
      sortColumn && SORTABLE_COLUMNS.includes(sortColumn)
        ? { column: sortColumn, desc: params.get("dir") !== "asc" }
        : DEFAULT_SORT,
    page: Number.isInteger(page) && page > 1 ? page : 1,
    perPage: PER_PAGE_OPTIONS.includes(perPage) ? perPage : DEFAULT_PER_PAGE,
  }
}

function writeList(params: URLSearchParams, name: string, values: string[]) {
  if (values.length > 0) params.set(name, values.join(","))
  else params.delete(name)
}

function writeValue(params: URLSearchParams, name: string, value: string | null | false) {
  if (value) params.set(name, value)
  else params.delete(name)
}

/** Escreve só o que difere do padrão: a URL de quem não mexeu em nada é `/contacts`. */
export function writeFilters(params: URLSearchParams, filters: ContactFilters) {
  writeValue(params, "q", filters.q.trim() || null)
  writeList(params, "connectors", filters.connectors)
  writeList(params, "tags", filters.tags)
  writeList(params, "teams", filters.teams)
  writeList(params, "assignees", filters.assignees)
  writeList(params, "status", filters.status)
  writeList(params, "automation", filters.automation)
  writeValue(params, "session", filters.session && "1")
  writeValue(params, "from", filters.from)
  writeValue(params, "to", filters.to)

  params.delete("cf")
  for (const filter of filters.fields) params.append("cf", serializeFieldFilter(filter))
}

export function writeSort(params: URLSearchParams, sort: ContactListState["sort"]) {
  const isDefault = sort.column === DEFAULT_SORT.column && sort.desc === DEFAULT_SORT.desc
  writeValue(params, "sort", isDefault ? null : sort.column)
  writeValue(params, "dir", isDefault ? null : sort.desc ? "desc" : "asc")
}

export function writePage(params: URLSearchParams, page: number) {
  writeValue(params, "page", page > 1 ? String(page) : null)
}

export function writePerPage(params: URLSearchParams, perPage: number) {
  writeValue(params, "perPage", perPage === DEFAULT_PER_PAGE ? null : String(perPage))
}

/** O que é filtro, para saber quando a seleção deixou de fazer sentido. Ignora página e ordem. */
export function filtersKey(filters: ContactFilters): string {
  const params = new URLSearchParams()
  writeFilters(params, filters)
  return params.toString()
}

/** Quantos grupos de filtro estão ligados, sem contar a busca. */
export function countActiveFilters(filters: ContactFilters): number {
  return (
    [
      filters.connectors,
      filters.tags,
      filters.teams,
      filters.assignees,
      filters.status,
      filters.automation,
    ].filter((list) => list.length > 0).length +
    (filters.session ? 1 : 0) +
    (filters.from || filters.to ? 1 : 0) +
    new Set(filters.fields.map((filter) => filter.key)).size
  )
}

export function hasAnyFilter(filters: ContactFilters): boolean {
  return Boolean(filters.q.trim()) || countActiveFilters(filters) > 0
}

/* ---------- API ---------- */

export type ApiCondition = {
  attributeKey: string
  filterOperator: string
  values: string[]
  queryOperator: "and"
  valueType?: "number"
}

/** Os mesmos nomes de `GET /contacts`. É este objeto que vai em `filters`, no lote e no canal. */
export type ApiContactFilters = {
  q?: string
  connectorIds?: string[]
  tagIds?: string[]
  teamIds?: string[]
  assignedUser?: string[]
  status?: ContactStatus
  automationEnabled?: boolean
  hasSession?: boolean
  dateFrom?: string
  dateTo?: string
  conditions?: ApiCondition[]
}

function shiftDay(date: string, days: number): string {
  const moved = new Date(`${date}T00:00:00Z`)
  moved.setUTCDate(moved.getUTCDate() + days)
  return moved.toISOString().slice(0, 10)
}

function conditionsFrom(fields: FieldFilter[]): ApiCondition[] {
  const conditions: ApiCondition[] = []
  const options = new Map<string, string[]>()

  for (const { key, op, value } of fields) {
    const attributeKey = `custom_attributes.${key}`
    const base = { attributeKey, queryOperator: "and" as const }

    switch (op) {
      case "in":
        options.set(attributeKey, [...(options.get(attributeKey) ?? []), value])
        break
      case "has":
        conditions.push({ ...base, filterOperator: "text_contains", values: [value] })
        break
      case "gt":
        conditions.push({ ...base, filterOperator: "is_greater_than", values: [value], valueType: "number" })
        break
      case "lt":
        conditions.push({ ...base, filterOperator: "is_less_than", values: [value], valueType: "number" })
        break
      case "yes":
        conditions.push({ ...base, filterOperator: "equal_to", values: ["true"] })
        break
      case "no":
        // Quem nunca preencheu também não marcou: `equal_to false` deixaria essa gente de fora.
        conditions.push({ ...base, filterOperator: "not_equal_to", values: ["true"] })
        break
      // Campo de data é texto `YYYY-MM-DD`, que compara em ordem de calendário. Só há maior e
      // menor estritos, então o dia vizinho é o que inclui as duas pontas.
      case "from":
        conditions.push({ ...base, filterOperator: "is_greater_than", values: [shiftDay(value, -1)] })
        break
      case "to":
        conditions.push({ ...base, filterOperator: "is_less_than", values: [shiftDay(value, 1)] })
        break
    }
  }

  for (const [attributeKey, values] of options) {
    conditions.push({ attributeKey, filterOperator: "equal_to", values, queryOperator: "and" })
  }

  return conditions
}

export function toApiFilters(filters: ContactFilters): ApiContactFilters {
  const api: ApiContactFilters = {}
  const q = filters.q.trim()

  if (q) api.q = q
  if (filters.connectors.length > 0) api.connectorIds = filters.connectors
  if (filters.tags.length > 0) api.tagIds = filters.tags
  if (filters.teams.length > 0) api.teamIds = filters.teams
  if (filters.assignees.length > 0) api.assignedUser = filters.assignees
  // As duas opções marcadas querem dizer todos: a API só conhece um valor.
  if (filters.status.length === 1) api.status = filters.status[0]
  if (filters.automation.length === 1) api.automationEnabled = filters.automation[0] === "on"
  if (filters.session) api.hasSession = true
  if (filters.from) api.dateFrom = filters.from
  if (filters.to) api.dateTo = filters.to

  const conditions = conditionsFrom(filters.fields)
  if (conditions.length > 0) api.conditions = conditions

  return api
}

/** Os filtros na query string: `tagIds[]=a&conditions[0][attributeKey]=...`. */
export function appendApiFilters(params: URLSearchParams, api: ApiContactFilters) {
  for (const [name, value] of Object.entries(api)) {
    if (name === "conditions") continue
    if (Array.isArray(value)) {
      for (const item of value) params.append(`${name}[]`, String(item))
    } else if (value !== undefined) {
      params.set(name, String(value))
    }
  }

  api.conditions?.forEach((condition, index) => {
    const prefix = `conditions[${index}]`
    params.set(`${prefix}[attributeKey]`, condition.attributeKey)
    params.set(`${prefix}[filterOperator]`, condition.filterOperator)
    params.set(`${prefix}[queryOperator]`, condition.queryOperator)
    if (condition.valueType) params.set(`${prefix}[valueType]`, condition.valueType)
    for (const value of condition.values) params.append(`${prefix}[values][]`, value)
  })
}

/** O caminho da lista, que também é a chave do SWR. */
export function contactsPath({ filters, sort, page, perPage }: ContactListState): string {
  const params = new URLSearchParams()
  appendApiFilters(params, toApiFilters(filters))
  params.set("sortBy", sort.column)
  params.set("sortDir", sort.desc ? "desc" : "asc")
  params.set("page", String(page))
  params.set("perPage", String(perPage))
  return `/contacts?${params}`
}

/* ---------- seleção ---------- */

/** O que vai para o lote e para a exportação: os marcados, ou todos do filtro menos os desmarcados. */
export type ContactSelectionTarget =
  | { kind: "ids"; ids: string[] }
  | { kind: "all"; filters: ContactFilters; excluded: string[] }

export function selectionBody(target: ContactSelectionTarget) {
  return target.kind === "ids"
    ? { chatIds: target.ids }
    : {
        selectAll: true,
        filters: toApiFilters(target.filters),
        excludedIds: target.excluded,
      }
}

/** A mesma seleção na query, para a exportação na hora. */
export function selectionQuery(target: ContactSelectionTarget): URLSearchParams {
  const params = new URLSearchParams()

  if (target.kind === "ids") {
    for (const id of target.ids) params.append("chatIds[]", id)
    return params
  }

  params.set("selectAll", "true")
  appendApiFilters(params, toApiFilters(target.filters))
  for (const id of target.excluded) params.append("excludedIds[]", id)
  return params
}

/** Quantos ids a seleção leva por extenso: é o que decide se ela cabe numa URL. */
export function selectionIdCount(target: ContactSelectionTarget): number {
  return target.kind === "ids" ? target.ids.length : target.excluded.length
}
