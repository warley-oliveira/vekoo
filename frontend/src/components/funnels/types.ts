// O que `/funnels` responde. O contrato está em docs/migration/api/insights.md.

export type FunnelStage = { id: string; name: string; position: number }

export type Funnel = {
  id: string
  name: string
  description: string | null
  stages: FunnelStage[]
  createdAt: number
  updatedAt: number
}

export type BoardChatTag = { id: string; name: string; color: string | null }

/** A conversa como o quadro a mostra. O que falta para o painel vem de `GET /chats/:id`. */
export type BoardChat = {
  id: string
  connectorId: string | null
  externalId: string | null
  phoneNumber: string | null
  userName: string | null
  displayName: string | null
  profilePictureUrl: string | null
  status: string
  automationEnabled: boolean
  assignedAccountId: string | null
  assignedAccountName: string | null
  teamId: string | null
  unreadMessages: number
  activeSession: boolean
  summary: string | null
  notes: string | null
  lastMessageAt: number | null
  lastMessageType: string | null
  lastMessageBy: string | null
  lastMessageContent: string | null
  stageId: string | null
  chatTags: BoardChatTag[]
  createdAt: number | null
}

export type BoardColumn = {
  /** `null` é "Sem etapa", que vem primeiro. */
  stageId: string | null
  stageName: string
  count: number
  page: number
  hasMore: boolean
  chats: BoardChat[]
}

/** Uma posição por etapa, sem "Sem etapa". */
export type BoardMetrics = {
  total: number
  noStage: number
  perStageCounts: number[]
  reachedCounts: number[]
  conversionRates: number[]
}

export type FunnelBoard = {
  funnel: Funnel
  columns: BoardColumn[]
  metrics: BoardMetrics
}

export type DateField = "last_message_at" | "created_at"

export type BoardFilters = {
  dateField: DateField
  days: number
  /** `me`, `unassigned` ou o id da pessoa, como em `GET /chats`. */
  assignedUser: string | null
  tagIds: string[]
  q: string
}

/* ---------- o que o painel da conversa lê ---------- */

export type ChatAttributeDefinition = {
  name: string
  key: string
  description: string | null
  valueType: "text" | "number" | "list" | "checkbox" | "date"
  optionValues: string[]
}

export type ChatDetail = {
  id: string
  userName: string | null
  displayName: string | null
  phoneNumber: string | null
  profilePictureUrl: string | null
  status: string
  automationEnabled: boolean
  assignedAccountId: string | null
  teamId: string | null
  activeSession: boolean
  notes: string | null
  tagIds: string[]
  customAttributes: Record<string, string>
  funnelStages: Record<string, string>
}

export type ChatDetailResponse = {
  chat: ChatDetail
  attributeList: ChatAttributeDefinition[]
}

export type ChatTag = {
  id: string
  name: string
  description: string | null
  color: string | null
}

export type ChatPerson = { id: string; name: string; avatarUrl: string | null; teamIds: string[] }
export type ChatTeam = { id: string; name: string; visible: boolean }

export type ChatMessage = {
  id: string
  /** `user` é o contato, `assistant` é quem atende, `base` é nota do sistema. */
  role: string
  typeElement: string | null
  content: string | null
  caption: string | null
  senderName: string | null
  createdAt: number
}

export type ChatMessagesPage = {
  messages: ChatMessage[]
  hasMore: boolean
  oldestId: string | null
}

export type ChatBooking = {
  id: string
  type: string
  title: string | null
  start: number
  status: string
  attendanceStatus: string | null
  color: string | null
}
