// Os formatos da API de pipelines, como estão em `docs/migration/api/pipelines.md`. Datas em
// milissegundos, menos `expectedCloseDate`, que é texto ("2026-12-06").

export type BoardType = "standard" | "crm"
export type CardPriority = "low" | "medium" | "high" | "urgent"
export type DealStatus = "open" | "won" | "lost"

export const CARD_PRIORITIES: CardPriority[] = ["urgent", "high", "medium", "low"]
export const DEAL_STATUSES: DealStatus[] = ["open", "won", "lost"]

export type PersonRef = {
  id: string
  name: string
  email?: string | null
  avatarUrl: string | null
}

/** Quem pode ser responsável: o resumo de `GET /users`. */
export type PersonOption = PersonRef & { setupOnly?: boolean }

export type CardLabel = {
  id: string
  name: string
  color: string
}

export type Progress = {
  completed: number
  total: number
}

export type ChatSummary = {
  id: string
  contactName: string | null
  contactPhone: string | null
  profilePictureUrl: string | null
  status: string | null
  lastMessageAt: number | null
  connectorId?: string | null
  connectorType?: string | null
  activeSession?: boolean
}

export type Card = {
  id: string
  title: string
  description: string | null
  priority: CardPriority | null
  status: string | null
  dueDate: number | null
  position: number
  audienceId: string | null
  assignedToId: string | null
  createdById: string | null
  chatId: string | null
  stageId: string
  tags: string[]
  colorLabel: string | null
  customFieldValues: Record<string, unknown>
  archived: boolean
  completedAt: number | null
  createdAt: number
  updatedAt: number
  dealValue: number | null
  dealProbability: number | null
  companyName: string | null
  contactEmail: string | null
  contactPhone: string | null
  wonAt: number | null
  lostAt: number | null
  lostReason: string | null
  stageEnteredAt: number | null
  expectedCloseDate: string | null
  assignedTo: PersonRef | null
  createdBy: PersonRef | null
  labels: CardLabel[]
  commentsCount: number
  watchersCount: number
  hasChat: boolean
  checklistProgress: Progress
  stageChecksProgress: Progress
  isRotting: boolean
  /** `null` se a pessoa não enxerga a conversa, e ausente nos eventos de tempo real. */
  chatSummary?: ChatSummary | null
}

export type CardAttachment = {
  id: string
  fileName: string | null
  contentType: string | null
  fileSize: number | null
  url: string
  createdAt?: number
  uploadedBy?: PersonRef | null
}

export type ActivityAction =
  | "created"
  | "moved"
  | "updated"
  | "assigned"
  | "commented"
  | "archived"
  | "auto_archived"
  | "deal_won"
  | "deal_lost"
  | "deal_reopened"
  | (string & {})

export type CardActivity = {
  id: string
  action: ActivityAction
  details: Record<string, unknown>
  createdAt: number
  user: PersonRef | null
}

export type ChecklistItem = {
  id: string
  title: string
  completed: boolean
  position: number
  assignedToId: string | null
  createdAt: number
  updatedAt: number
}

export type Checklist = {
  id: string
  name: string
  position: number
  items: ChecklistItem[]
  createdAt: number
  updatedAt: number
}

export type StageCheck = {
  id: string
  title: string
  position: number
  required: boolean
  completed: boolean
  completedAt: number | null
  completedById: string | null
}

export type CardDetail = Card & {
  descriptionJson: Record<string, unknown> | null
  watchers: PersonRef[]
  attachments: CardAttachment[]
  activities: CardActivity[]
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

export type StageWithCards = Stage & { cards: Card[] }

export type CustomFieldType = "text" | "number" | "date" | "select" | "checkbox" | "url" | "user"

export type CustomField = {
  id: string
  key: string
  name: string
  fieldType: CustomFieldType
  position: number
  required: boolean
  options: string[] | null
  defaultValue: string | null
  scope: "board" | "stage"
  stageId: string | null
  requiredToLeaveStage: boolean
}

export type Board = {
  id: string
  name: string
  description: string | null
  color: string | null
  icon: string | null
  templateKey: string | null
  boardType: BoardType
  archived: boolean
  autoArchiveDays: number | null
  dealCloseBehavior: "manual" | "immediate" | "auto_archive_days"
  dealCloseArchiveDays: number | null
  dealRottingDays: number | null
  requireFieldsOnDealWon: boolean
  requireFieldsOnDealLost: boolean
  leadScoreFieldKey: string | null
  leadScoreLow: number | null
  leadScoreHigh: number | null
  cardVisibility: "all" | "assigned"
  cardVisibilityBypassRoleIds: string[]
  createdAt: number
  updatedAt: number
  viewerCanViewAllCards: boolean
  cardsCount?: number
  stagesCount?: number
}

export type BoardDetail = Board & {
  stages: StageWithCards[]
  customFields: CustomField[]
  appliedFilter: Record<string, unknown> | null
}

export type BoardTemplate = {
  id: string
  name: string
  description: string | null
  templateKey: string
  icon: string | null
  color: string | null
  defaultBoardType: BoardType
  stagesConfig: { name: string; color: string | null; position: number }[]
  customFieldsConfig: { name: string; fieldType: CustomFieldType; options?: string[] }[]
}

export type Label = CardLabel & {
  createdAt: number
  updatedAt: number
}

/* ---------- comentários ---------- */

export type CommentAuthor =
  | ({ type: "user" } & PersonRef)
  | { type: "automation"; source: "script" | "flow" | (string & {}); name: string }
  | null

export type CommentReaction = {
  emoji: string
  count: number
  accountIds: string[]
}

export type CommentAttachment = {
  id: string
  fileName: string | null
  contentType: string | null
  fileSize: number | null
  url: string
}

export type CardComment = {
  id: string
  cardId: string
  body: string
  createdAt: number
  editedAt: number | null
  pinned: boolean
  parentId: string | null
  author: CommentAuthor
  reactions: CommentReaction[]
  attachments: CommentAttachment[]
  replyCount: number
  replies?: CardComment[]
}

export type CommentsPage = {
  pinned: CardComment[]
  comments: CardComment[]
  hasMore: boolean
  nextCursor: string | null
  totalCount: number
}

export type ActivitiesPage = {
  activities: CardActivity[]
  hasMore: boolean
  nextCursor: string | null
  totalCount: number
}

/* ---------- filtros ---------- */

export type RelativeToken =
  | "today"
  | "yesterday"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "this_year"
  | "last_year"
  | "last_n_days"
  | "more_than_n_months_ago"
  | "now"

export type FilterOperator =
  | "eq"
  | "ne"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "not_starts_with"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between"
  | "before"
  | "after"
  | "within"
  | "not_within"
  | "in"
  | "nin"
  | "contains_any"
  | "contains_all"
  | "is_empty"
  | "is_not_empty"

export type FilterValue =
  | string
  | number
  | boolean
  | null
  | Array<string | number>
  | { type: "me" }
  | { type: "relative"; token: RelativeToken; n?: number }

export type FilterCondition = {
  field: string
  operator: FilterOperator
  value?: FilterValue
}

export type FilterDefinition = {
  version: 1
  all: FilterCondition[]
  any: FilterCondition[]
}

export type SavedFilterVisibility = "private" | "shared"

export type SavedFilter = {
  id: string
  name: string
  visibility: SavedFilterVisibility
  definition: FilterDefinition
  isPreset: false
  favorite: boolean
  editable: boolean
  owner: { id: string; name: string } | null
}

export type PresetFilter = {
  key: string
  nameKey: string
  section: "quick" | "data_cleanup"
  definition: FilterDefinition
  isPreset: true
  favorite: boolean
}

export type SavedFiltersResponse = {
  presets: PresetFilter[]
  filters: SavedFilter[]
}

/* ---------- tempo real ---------- */

export type BoardEvent =
  | { event: "card_created"; data: Card }
  | { event: "card_updated"; data: Card }
  | { event: "card_moved"; data: Card & { previousStageId?: string } }
  | { event: "card_deleted"; data: { id: string; stageId: string } }
  | { event: "cards_reordered"; data: { stageId: string; orderedIds: string[] } }
  | { event: "comment_created"; data: { cardId: string; comment: CardComment } }
  | { event: "comment_updated"; data: { cardId: string; comment: CardComment } }
  | { event: "comment_deleted"; data: { cardId: string; commentId: string } }
  | { event: "stage_created"; data: Stage }
  | { event: "stage_updated"; data: Stage }
  | { event: "stage_deleted"; data: { id: string } }
  | { event: "stages_reordered"; data: { orderedIds: string[] } }
  | { event: "custom_fields_changed"; data: { boardId: string } }
  | { event: "card_visibility_changed"; data: { id: string } }
