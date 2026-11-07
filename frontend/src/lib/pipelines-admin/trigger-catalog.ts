import type {
  BoardType,
  ConditionOperator,
  TriggerActionType,
  TriggerEvent,
} from "./types"
import { TRIGGER_EVENTS } from "./types"

// O vocabulário dos gatilhos, como dado: o que a API aceita, sem idioma. A tela traduz pelas chaves
// `pipelinesAdmin.triggers.*`.

const CRM_EVENTS: readonly TriggerEvent[] = ["deal_won", "deal_lost", "deal_reopened"]

export function isCrmEvent(event: TriggerEvent) {
  return CRM_EVENTS.includes(event)
}

/** Evento de negócio só vale em quadro de vendas: em outro, a API responde 422. */
export function eventsFor(boardType: BoardType): TriggerEvent[] {
  return TRIGGER_EVENTS.filter((event) => boardType === "crm" || !isCrmEvent(event))
}

export type ConditionKind = "text" | "number" | "priority" | "stage" | "person"

export type ConditionField = { key: string; kind: ConditionKind }

const COMMON: ConditionField[] = [
  { key: "priority", kind: "priority" },
  { key: "assignedToId", kind: "person" },
]

const DEAL: ConditionField[] = [
  { key: "dealValue", kind: "number" },
  { key: "dealProbability", kind: "number" },
  { key: "companyName", kind: "text" },
  { key: "contactEmail", kind: "text" },
]

/** O que cada evento leva no contexto. A API devolve as chaves em camelCase e as lê em qualquer forma. */
const FIELDS_BY_EVENT: Record<TriggerEvent, ConditionField[]> = {
  card_moved: [
    { key: "fromStageId", kind: "stage" },
    { key: "toStageName", kind: "text" },
    { key: "fromStageName", kind: "text" },
    ...COMMON,
  ],
  card_created: COMMON,
  card_updated: COMMON,
  due_date_passed: COMMON,
  sla_breached: [
    { key: "stageName", kind: "text" },
    { key: "slaHours", kind: "number" },
    ...COMMON,
  ],
  deal_won: [...DEAL, ...COMMON],
  deal_lost: [...DEAL, { key: "lostReason", kind: "text" }, ...COMMON],
  deal_reopened: [...DEAL, ...COMMON],
}

export function conditionFieldsFor(event: TriggerEvent): ConditionField[] {
  return FIELDS_BY_EVENT[event]
}

/** Chaves que a tela sabe nomear, mesmo fora da lista do evento: uma condição já gravada aparece. */
const KNOWN_FIELDS: Record<string, ConditionKind> = {
  priority: "priority",
  assignedToId: "person",
  stageId: "stage",
  fromStageId: "stage",
  toStageId: "stage",
  stageName: "text",
  fromStageName: "text",
  toStageName: "text",
  slaHours: "number",
  dealValue: "number",
  dealProbability: "number",
  companyName: "text",
  contactEmail: "text",
  lostReason: "text",
  dueDate: "text",
}

export function isKnownConditionKey(key: string) {
  return key in KNOWN_FIELDS
}

/** Condição gravada por outra via, com chave que a tela não conhece, é texto e continua editável. */
export function conditionKind(key: string): ConditionKind {
  return KNOWN_FIELDS[key] ?? "text"
}

export const OPERATORS_BY_KIND: Record<ConditionKind, ConditionOperator[]> = {
  text: ["contains", "not_contains", "equals", "not_equals", "is_empty", "is_not_empty"],
  number: ["greater_than", "less_than", "equals", "not_equals"],
  priority: ["equals", "not_equals", "is_empty", "is_not_empty"],
  stage: ["equals", "not_equals"],
  person: ["equals", "not_equals", "is_empty", "is_not_empty"],
}

export function operatorTakesValue(operator: ConditionOperator) {
  return operator !== "is_empty" && operator !== "is_not_empty"
}

export const ACTION_GROUPS: { id: string; types: TriggerActionType[] }[] = [
  { id: "board", types: ["notify", "move_card", "assign_user", "create_card"] },
  { id: "contact", types: ["send_whatsapp_message", "send_whatsapp_template", "toggle_automation"] },
  { id: "integrations", types: ["fire_webhook", "run_code"] },
]

export const MAX_ACTIONS = 20
export const MAX_CODE_LENGTH = 100_000
export const MIN_CODE_TIMEOUT_MS = 1_000
export const MAX_CODE_TIMEOUT_MS = 60_000
export const DEFAULT_CODE_TIMEOUT_MS = 15_000

/** Canais que recebem mensagem livre. O WhatsApp Cloud só manda modelo. */
export const MESSAGE_CONNECTOR_TYPES = ["whatsapp_web", "facebook_messenger", "instagram_direct"]
export const PHONE_CONNECTOR_TYPES = ["whatsapp_web", "whatsapp_cloud"]

export type TokenDefinition = {
  /** `{{card.title}}` */
  token: string
  /** Sufixo da chave em `pipelinesAdmin.triggers.tokens`. */
  labelKey: string
  group: "card" | "deal" | "board"
}

/** O que dá para escrever nas mensagens e nos modelos de "criar card". */
export const MESSAGE_TOKENS: TokenDefinition[] = [
  { token: "{{card.title}}", labelKey: "title", group: "card" },
  { token: "{{card.description}}", labelKey: "description", group: "card" },
  { token: "{{card.priority}}", labelKey: "priority", group: "card" },
  { token: "{{card.due_date}}", labelKey: "dueDate", group: "card" },
  { token: "{{card.assigned_to_name}}", labelKey: "assignedTo", group: "card" },
  { token: "{{card.tags}}", labelKey: "tags", group: "card" },
  { token: "{{card.labels}}", labelKey: "labels", group: "card" },
  { token: "{{card.deal_value}}", labelKey: "dealValue", group: "deal" },
  { token: "{{card.company_name}}", labelKey: "companyName", group: "deal" },
  { token: "{{card.contact_email}}", labelKey: "contactEmail", group: "deal" },
  { token: "{{card.contact_phone}}", labelKey: "contactPhone", group: "deal" },
  { token: "{{board.name}}", labelKey: "boardName", group: "board" },
  { token: "{{stage.name}}", labelKey: "stageName", group: "board" },
]

/** O que dá para escrever no corpo de um webhook. O contrato é mais curto que o das mensagens. */
export const WEBHOOK_TOKENS: TokenDefinition[] = [
  { token: "{{card.id}}", labelKey: "id", group: "card" },
  { token: "{{card.title}}", labelKey: "title", group: "card" },
  { token: "{{card.description}}", labelKey: "description", group: "card" },
  { token: "{{card.priority}}", labelKey: "priority", group: "card" },
  { token: "{{card.status}}", labelKey: "status", group: "card" },
  { token: "{{card.due_date}}", labelKey: "dueDate", group: "card" },
  { token: "{{card.assigned_to_id}}", labelKey: "assignedToId", group: "card" },
  { token: "{{card.chat_id}}", labelKey: "chatId", group: "card" },
  { token: "{{card.tags}}", labelKey: "tags", group: "card" },
  { token: "{{card.deal_value}}", labelKey: "dealValue", group: "deal" },
  { token: "{{card.company_name}}", labelKey: "companyName", group: "deal" },
  { token: "{{board.id}}", labelKey: "boardId", group: "board" },
  { token: "{{board.name}}", labelKey: "boardName", group: "board" },
  { token: "{{stage.id}}", labelKey: "stageId", group: "board" },
  { token: "{{stage.name}}", labelKey: "stageName", group: "board" },
  { token: "{{stage.position}}", labelKey: "stagePosition", group: "board" },
  { token: "{{event}}", labelKey: "event", group: "board" },
]

/**
 * Para citar um token num texto traduzido. O i18next trocaria `{{card.title}}` escrito direto na frase
 * por nada, então o token entra como valor: `t("...", TOKEN_VALUES)`, com `{{cardTitle}}` no JSON.
 */
export const TOKEN_VALUES = {
  cardTitle: "{{card.title}}",
  stageName: "{{stage.name}}",
  boardName: "{{board.name}}",
  companyName: "{{card.company_name}}",
  dealValue: "{{card.deal_value}}",
}

export function customFieldToken(key: string) {
  return `{{card.custom_field.${key}}}`
}
