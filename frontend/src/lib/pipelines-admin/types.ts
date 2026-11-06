import type { PaginationMeta } from "@/lib/api"

// A forma da administração de um quadro, como a API devolve (docs/migration/api/pipelines.md).
// Ids são string, datas em milissegundos, menos `expectedCloseDate` e `periodMonth`, em texto.

export type BoardType = "standard" | "crm"
export type DealCloseBehavior = "manual" | "immediate" | "auto_archive_days"
export type CardVisibility = "all" | "assigned"
export type CardPriority = "low" | "medium" | "high" | "urgent"

export type BoardBase = {
  id: string
  name: string
  description: string | null
  color: string | null
  icon: string | null
  templateKey: string | null
  boardType: BoardType
  archived: boolean
  autoArchiveDays: number | null
  dealCloseBehavior: DealCloseBehavior
  dealCloseArchiveDays: number | null
  dealRottingDays: number | null
  requireFieldsOnDealWon: boolean
  requireFieldsOnDealLost: boolean
  leadScoreFieldKey: string | null
  leadScoreLow: number
  leadScoreHigh: number
  cardVisibility: CardVisibility
  cardVisibilityBypassRoleIds: string[]
  createdAt: number
  updatedAt: number
  /** `false`: o quadro está restrito para esta pessoa, que só recebe os cards dela. */
  viewerCanViewAllCards: boolean
}

export type BoardCard = {
  id: string
  title: string
  stageId: string
  priority: CardPriority | null
  updatedAt: number
  createdAt: number
  dealValue: number | null
  dealProbability: number | null
  companyName: string | null
  contactEmail: string | null
  contactPhone: string | null
  description: string | null
  expectedCloseDate: string | null
  wonAt: number | null
  lostAt: number | null
  assignedTo: PersonRef | null
  customFieldValues: Record<string, unknown>
  tags: string[]
  labels: { id: string; name: string; color: string }[]
  dueDate: number | null
}

export type Stage = {
  id: string
  boardId: string
  name: string
  position: number
  color: string | null
  wipLimit: number | null
  slaHours: number | null
}

export type StageWithCards = Stage & { cards: BoardCard[] }

export type Board = BoardBase & {
  stages: StageWithCards[]
  customFields: CustomField[]
  triggers: Trigger[]
}

/** Uma linha de `GET /pipelines/boards?withStages=true`, para os seletores. */
export type BoardOption = BoardBase & {
  cardsCount: number
  stagesCount: number
  stages: { id: string; name: string; position: number }[]
}

export type BoardInput = Partial<
  Pick<
    BoardBase,
    | "name"
    | "description"
    | "color"
    | "icon"
    | "autoArchiveDays"
    | "dealCloseBehavior"
    | "dealCloseArchiveDays"
    | "dealRottingDays"
    | "requireFieldsOnDealWon"
    | "requireFieldsOnDealLost"
    | "leadScoreFieldKey"
    | "leadScoreLow"
    | "leadScoreHigh"
    | "cardVisibility"
    | "cardVisibilityBypassRoleIds"
  >
>

export type StageInput = Partial<Pick<Stage, "name" | "color" | "wipLimit" | "slaHours">>

export type StageChecklistItem = {
  id: string
  stageId: string
  title: string
  position: number
  required: boolean
  createdAt: number
  updatedAt: number
}

export type PersonRef = {
  id: string
  name: string | null
  email?: string
  avatarUrl: string | null
}

/* ---------- campos ---------- */

export const CUSTOM_FIELD_TYPES = ["text", "number", "date", "select", "checkbox", "url", "user"] as const
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number]

export type CustomField = {
  id: string
  key: string
  name: string
  fieldType: CustomFieldType
  position: number
  required: boolean
  options: string[] | null
  defaultValue: unknown
  scope: "board" | "stage"
  stageId: string | null
  requiredToLeaveStage: boolean
}

export type CustomFieldInput = Partial<
  Pick<CustomField, "name" | "fieldType" | "required" | "options" | "scope" | "stageId" | "requiredToLeaveStage">
>

/* ---------- etiquetas ---------- */

export type Label = {
  id: string
  name: string
  color: string
  createdAt: number
  updatedAt: number
}

/* ---------- gatilhos ---------- */

export const TRIGGER_EVENTS = [
  "card_moved",
  "card_created",
  "card_updated",
  "due_date_passed",
  "sla_breached",
  "deal_won",
  "deal_lost",
  "deal_reopened",
] as const
export type TriggerEvent = (typeof TRIGGER_EVENTS)[number]

export const TRIGGER_ACTION_TYPES = [
  "notify",
  "move_card",
  "assign_user",
  "create_card",
  "send_whatsapp_message",
  "send_whatsapp_template",
  "toggle_automation",
  "fire_webhook",
  "run_code",
] as const
export type TriggerActionType = (typeof TRIGGER_ACTION_TYPES)[number]

export const CONDITION_OPERATORS = [
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "is_empty",
  "is_not_empty",
  "greater_than",
  "less_than",
] as const
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number]

/** `{ chave: valor }` ou `{ chave: { operator, value } }`. Todas precisam bater. */
export type TriggerConditions = Record<
  string,
  string | number | boolean | null | { operator?: ConditionOperator; value?: unknown }
>

/**
 * Plana de propósito: cada tipo usa só uma parte, e é o que deixa o formulário caminhar por
 * `actions.0.message` sem discriminar. O que a tela não conhece volta para a API como veio.
 */
export type TriggerAction = {
  type: TriggerActionType
  // notify, send_whatsapp_message
  message?: string
  accountIds?: string[]
  // move_card
  stageId?: string
  // send_whatsapp_*
  connectorId?: string
  target?: "card_contact" | "specific"
  specificPhone?: string
  whatsappTemplateId?: string
  templateParams?: string[]
  // fire_webhook
  url?: string
  method?: "POST" | "PUT"
  headers?: Record<string, string>
  bodyTemplate?: string
  // toggle_automation
  automationStatus?: "enabled" | "disabled"
  disablePeriod?: "minutes" | "hours" | "days"
  disableTime?: number | null
  // create_card
  targetBoardId?: string
  targetStageId?: string | null
  cardTitleTemplate?: string
  cardDescriptionTemplate?: string
  cardPriority?: CardPriority | null
  cardColorLabel?: string | null
  cardDueDateOffset?: number | null
  cardAssignedToId?: string | null
  cardInheritAssigned?: boolean
  cardInheritLabels?: boolean
  cardDealValueTemplate?: string
  cardCompanyNameTemplate?: string
  cardContactEmailTemplate?: string
  cardContactPhoneTemplate?: string
  cardTags?: string[]
  cardLabelIds?: string[]
  cardCustomFieldValues?: Record<string, string>
  // run_code
  code?: string
  timeoutMs?: number | null
}

export type Trigger = {
  id: string
  name: string
  eventType: TriggerEvent
  conditions: TriggerConditions
  actions: TriggerAction[]
  active: boolean
  stageId: string | null
  createdAt: number
  updatedAt: number
}

export type TriggerInput = Pick<Trigger, "name" | "eventType" | "conditions" | "actions" | "active" | "stageId">

export type ExecutionStatus = "success" | "failure" | "skipped"

export type ExecutedAction = {
  type: TriggerActionType | "unknown"
  status?: ExecutionStatus
  error?: string
  /** O código foi para a fila: o resultado vem em outra execução. */
  enqueued?: boolean
  result?: string
  notified?: number
  accountId?: string
  cardId?: string
  statusCode?: number
}

export type TriggerExecution = {
  id: string
  triggerId: string
  cardId: string
  status: ExecutionStatus
  executedActions: ExecutedAction[]
  errorMessage: string | null
  executedAt: number
  triggerName: string | null
  cardTitle: string | null
}

export type TriggerExecutionsResponse = {
  executions: TriggerExecution[]
  meta: PaginationMeta
}

/* ---------- metas ---------- */

export type GoalScope = "funnel" | "user"

export type Goal = {
  id: string
  scope: GoalScope
  assignedAccountId: string | null
  /** "2026-12" */
  periodMonth: string
  targetValue: number
  metric: "revenue"
}

export type GoalProgressEntry = {
  goalId: string
  targetValue: number
  actualValue: number
  progressPercentage: number
}

export type GoalProgress = {
  month: string
  funnel: GoalProgressEntry | null
  users: (GoalProgressEntry & { user: PersonRef })[]
  usersWithoutGoal: PersonRef[]
}

export type GoalHistoryPoint = {
  month: string
  targetValue: number
  actualValue: number
}

/* ---------- métricas ---------- */

export type PeriodSummary = {
  createdCount: number
  wonCount: number
  wonValue: number
  lostCount: number
  lostValue: number
  conversionRate: number | null
}

export type PeriodPoint = {
  date: string
  createdCount: number
  wonCount: number
  wonValue: number
  lostCount: number
}

export type RankingEntry = {
  user: PersonRef
  wonCount: number
  wonValue: number
  lostCount: number
  conversionRate: number
}

export type PeriodMetrics = {
  from: string
  to: string
  previousFrom: string
  previousTo: string
  bucket: "day" | "week" | "month"
  summary: PeriodSummary
  previous: PeriodSummary
  series: PeriodPoint[]
  stageConversion: {
    cohort: number
    won: number
    stages: { stageId: string; stageName: string; color: string | null; position: number; reached: number }[]
  }
  avgTimePerStage: {
    stageId: string
    stageName: string
    color: string | null
    avgHours: number | null
    passages: number
  }[]
  ranking: RankingEntry[]
}

export type BoardMetrics = {
  cardsPerStage: { stageId: string; stageName: string; count: number; color: string | null; position: number }[]
  dealValuePerStage: { stageId: string; stageName: string; totalValue: number; count: number }[]
  cardsByPriority: Partial<Record<CardPriority, number>>
  overdueCount: number
  dealSummary: {
    wonCount: number
    wonValue: number
    lostCount: number
    lostValue: number
    openCount: number
    openValue: number
    conversionRate: number
  }
  avgTimePerStage: { stageId: string; stageName: string; avgHours: number }[]
  totalCards: number
  totalDealValue: number
  weightedPipelineValue: number
  forecast: { month: string; totalValue: number; count: number; weightedValue: number }[]
  period?: PeriodMetrics
}

/* ---------- arquivados ---------- */

export type ArchivedCard = {
  id: string
  title: string
  description: string | null
  priority: CardPriority | null
  stageId: string
  stageName: string | null
  stageColor: string | null
  colorLabel: string | null
  archived: boolean
  completedAt: number | null
  createdAt: number
  updatedAt: number
  dealValue: number | null
  companyName: string | null
  wonAt: number | null
  lostAt: number | null
  lostReason: string | null
  assignedTo: PersonRef | null
  labels: { id: string; name: string; color: string }[]
}

export type ArchivedCardsResponse = {
  cards: ArchivedCard[]
  meta: PaginationMeta
}

export type ArchivedStatus = "all" | "archived" | "won" | "lost"
