import type {
  Board,
  CustomField,
  CustomFieldType,
  FilterCondition,
  FilterDefinition,
  FilterOperator,
  FilterValue,
  RelativeToken,
  SavedFilterVisibility,
} from "./types"

// O catálogo do construtor de filtro: quais campos existem, de que tipo, com que operadores. Espelha
// `Pipelines::FieldRegistry`. Só dados e códigos: o texto de cada um sai das chaves de tradução.

export type ValueKind =
  | "text"
  | "number"
  | "date"
  | "select"
  | "user"
  | "boolean"
  | "virtual"
  | "labels"
  | "tags"

export type FieldGroup = "card" | "deal" | "dates" | "custom"

export const OPERATORS_BY_KIND: Record<ValueKind, FilterOperator[]> = {
  text: ["contains", "not_contains", "eq", "ne", "starts_with", "not_starts_with", "is_empty", "is_not_empty"],
  number: ["eq", "ne", "gt", "gte", "lt", "lte", "between", "is_empty", "is_not_empty"],
  date: ["within", "not_within", "before", "after", "eq", "between", "is_empty", "is_not_empty"],
  select: ["eq", "ne", "in", "nin", "is_empty", "is_not_empty"],
  user: ["eq", "ne", "in", "nin", "is_empty", "is_not_empty"],
  boolean: ["eq", "is_empty", "is_not_empty"],
  virtual: ["eq"],
  labels: ["contains_any", "contains_all", "not_contains", "is_empty", "is_not_empty"],
  tags: ["contains_any", "contains_all", "not_contains", "is_empty", "is_not_empty"],
}

const CUSTOM_KIND: Record<CustomFieldType, ValueKind> = {
  text: "text",
  url: "text",
  number: "number",
  date: "date",
  select: "select",
  checkbox: "boolean",
  user: "user",
}

export type NativeField = {
  key: string
  /** Sufixo de `pipelines.filters.fields.*`. */
  labelKey: string
  group: FieldGroup
  kind: ValueKind
  crmOnly?: boolean
}

export const NATIVE_FIELDS: NativeField[] = [
  { key: "title", labelKey: "title", group: "card", kind: "text" },
  { key: "description", labelKey: "description", group: "card", kind: "text" },
  { key: "priority", labelKey: "priority", group: "card", kind: "select" },
  { key: "stage_id", labelKey: "stage", group: "card", kind: "select" },
  { key: "assigned_to_id", labelKey: "assignee", group: "card", kind: "user" },
  { key: "created_by_id", labelKey: "createdBy", group: "card", kind: "user" },
  { key: "label_ids", labelKey: "labels", group: "card", kind: "labels" },
  { key: "tags", labelKey: "tags", group: "card", kind: "tags" },
  { key: "in_first_stage", labelKey: "inFirstStage", group: "card", kind: "virtual" },
  { key: "assigned_to_deactivated", labelKey: "assigneeDeactivated", group: "card", kind: "virtual" },
  { key: "due_date", labelKey: "dueDate", group: "dates", kind: "date" },
  { key: "created_at", labelKey: "createdAt", group: "dates", kind: "date" },
  { key: "updated_at", labelKey: "updatedAt", group: "dates", kind: "date" },
  { key: "stage_entered_at", labelKey: "stageEnteredAt", group: "dates", kind: "date" },
  { key: "completed_at", labelKey: "completedAt", group: "dates", kind: "date" },
  { key: "deal_status", labelKey: "dealStatus", group: "deal", kind: "select", crmOnly: true },
  { key: "deal_value", labelKey: "dealValue", group: "deal", kind: "number", crmOnly: true },
  { key: "deal_probability", labelKey: "dealProbability", group: "deal", kind: "number", crmOnly: true },
  { key: "expected_close_date", labelKey: "expectedCloseDate", group: "deal", kind: "date", crmOnly: true },
  { key: "won_at", labelKey: "wonAt", group: "deal", kind: "date", crmOnly: true },
  { key: "lost_at", labelKey: "lostAt", group: "deal", kind: "date", crmOnly: true },
  { key: "lost_reason", labelKey: "lostReason", group: "deal", kind: "text", crmOnly: true },
  { key: "company_name", labelKey: "companyName", group: "deal", kind: "text", crmOnly: true },
  { key: "contact_email", labelKey: "contactEmail", group: "deal", kind: "text", crmOnly: true },
  { key: "contact_phone", labelKey: "contactPhone", group: "deal", kind: "text", crmOnly: true },
  { key: "is_rotting", labelKey: "isRotting", group: "deal", kind: "virtual", crmOnly: true },
]

export type CatalogField = {
  key: string
  /** Campo nativo: a chave de tradução. Campo personalizado: o nome que a pessoa deu. */
  labelKey?: string
  label?: string
  group: FieldGroup
  kind: ValueKind
  /** Opções fixas de um campo personalizado do tipo seleção. */
  options?: string[]
}

export function fieldCatalog(
  board: Pick<Board, "boardType">,
  customFields: CustomField[]
): CatalogField[] {
  const isCrm = board.boardType === "crm"
  const native = NATIVE_FIELDS.filter((field) => !field.crmOnly || isCrm).map(
    ({ key, labelKey, group, kind }): CatalogField => ({ key, labelKey, group, kind })
  )
  const custom = customFields.map(
    (field): CatalogField => ({
      key: `custom.${field.key}`,
      label: field.name,
      group: "custom",
      kind: CUSTOM_KIND[field.fieldType],
      options: field.fieldType === "select" ? (field.options ?? []) : undefined,
    })
  )
  return [...native, ...custom]
}

export const ME_VALUE = "__me__"
export const VALUELESS_OPERATORS: FilterOperator[] = ["is_empty", "is_not_empty"]
export const MULTI_OPERATORS: FilterOperator[] = ["in", "nin", "contains_any", "contains_all", "not_contains"]
export const RANGE_OPERATORS: FilterOperator[] = ["within", "not_within"]
export const POINT_OPERATORS: FilterOperator[] = ["before", "after"]
export const PARAMETERIZED_TOKENS: RelativeToken[] = ["last_n_days", "more_than_n_months_ago"]

/** Tokens de intervalo, para "dentro de" e "fora de". */
export const RANGE_TOKENS: RelativeToken[] = [
  "today",
  "yesterday",
  "this_week",
  "last_week",
  "this_month",
  "last_month",
  "this_quarter",
  "this_year",
  "last_year",
  "last_n_days",
]

/** Tokens de instante, para "antes de" e "depois de". */
export const POINT_TOKENS: RelativeToken[] = [
  "today",
  "yesterday",
  "now",
  "more_than_n_months_ago",
  "last_n_days",
]

/** Uma linha do construtor, com o valor na forma que os controles usam. */
export type ConditionRow = {
  id: string
  field: string
  operator: FilterOperator | ""
  value: string
  /** Segundo valor de "entre". */
  valueTo: string
  list: string[]
  token: RelativeToken | ""
  tokenN: string
}

let nextRowId = 0

export function emptyRow(): ConditionRow {
  nextRowId += 1
  return {
    id: `row-${nextRowId}`,
    field: "",
    operator: "",
    value: "",
    valueTo: "",
    list: [],
    token: "",
    tokenN: "",
  }
}

export type BuilderValues = {
  name: string
  visibility: SavedFilterVisibility
  all: ConditionRow[]
  any: ConditionRow[]
}

export function isRowComplete(row: ConditionRow, kind: ValueKind | undefined): boolean {
  if (!row.field || !row.operator) return false
  const { operator } = row
  if (VALUELESS_OPERATORS.includes(operator)) return true

  if (kind === "date") {
    if (operator === "between") return row.value !== "" && row.valueTo !== ""
    if (operator === "eq") return row.value !== ""
    if (row.token) {
      return PARAMETERIZED_TOKENS.includes(row.token)
        ? row.tokenN !== "" && Number(row.tokenN) > 0
        : true
    }
    return POINT_OPERATORS.includes(operator) && row.value !== ""
  }

  if (operator === "between") return row.value !== "" && row.valueTo !== ""
  if (MULTI_OPERATORS.includes(operator)) return row.list.length > 0
  return row.value !== ""
}

function relativeValue(row: ConditionRow): FilterValue {
  const token = row.token as RelativeToken
  return PARAMETERIZED_TOKENS.includes(token)
    ? { type: "relative", token, n: Number(row.tokenN) }
    : { type: "relative", token }
}

function rowToCondition(row: ConditionRow, kind: ValueKind | undefined): FilterCondition | null {
  if (!isRowComplete(row, kind)) return null
  const operator = row.operator as FilterOperator
  const { field } = row

  if (VALUELESS_OPERATORS.includes(operator)) return { field, operator, value: null }

  if (kind === "date") {
    if (operator === "between") return { field, operator, value: [row.value, row.valueTo] }
    if (row.token) return { field, operator, value: relativeValue(row) }
    return { field, operator, value: row.value }
  }

  if (operator === "between") {
    return { field, operator, value: [Number(row.value), Number(row.valueTo)] }
  }
  if (MULTI_OPERATORS.includes(operator)) return { field, operator, value: row.list }
  if (kind === "boolean" || kind === "virtual") {
    return { field, operator, value: row.value === "true" }
  }
  if (kind === "user" && row.value === ME_VALUE) return { field, operator, value: { type: "me" } }
  if (kind === "number") return { field, operator, value: Number(row.value) }
  return { field, operator, value: row.value }
}

export function rowsToDefinition(
  all: ConditionRow[],
  any: ConditionRow[],
  catalog: CatalogField[]
): FilterDefinition {
  const kindOf = new Map(catalog.map((field) => [field.key, field.kind]))
  const convert = (rows: ConditionRow[]) =>
    rows.flatMap((row) => rowToCondition(row, kindOf.get(row.field)) ?? [])
  return { version: 1, all: convert(all), any: convert(any) }
}

function conditionToRow(condition: FilterCondition): ConditionRow {
  const row = emptyRow()
  row.field = condition.field
  row.operator = condition.operator

  const { value } = condition
  if (Array.isArray(value)) {
    if (condition.operator === "between") {
      row.value = String(value[0] ?? "")
      row.valueTo = String(value[1] ?? "")
    } else {
      row.list = value.filter((item) => typeof item !== "object").map(String)
    }
  } else if (value && typeof value === "object") {
    if (value.type === "relative") {
      row.token = value.token
      row.tokenN = value.n !== undefined ? String(value.n) : ""
    } else {
      row.value = ME_VALUE
    }
  } else if (typeof value === "boolean") {
    row.value = value ? "true" : "false"
  } else if (value !== null && value !== undefined) {
    row.value = String(value)
  }
  return row
}

export function definitionToRows(definition: FilterDefinition) {
  return {
    all: (definition.all ?? []).map(conditionToRow),
    any: (definition.any ?? []).map(conditionToRow),
  }
}
