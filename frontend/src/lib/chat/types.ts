import type { PaginationMeta } from "@/lib/api"

// Formatos de `docs/migration/api/inbox.md` e da seção "Conversa e mensagem" de
// `docs/migration/api/connectors.md`. Ids como string, datas em milissegundos.

export type ChatStatus = "open" | "closed"

export type AudienceType = "whatsapp_api" | "instagram" | "facebook" | "web" | "import_feature"

/** A conversa, como a lista, os canais de tempo real e `GET /chats/:id` a entregam. */
export type Chat = {
  id: string
  connectorId: string | null
  audienceId: string | null
  externalId: string
  phoneNumber: string | null
  userName: string | null
  displayName: string | null
  abbreviatedName: string | null
  audienceType: AudienceType | string | null
  audienceUserName: string | null
  profilePictureUrl: string | null
  status: ChatStatus
  automationEnabled: boolean
  automationResumeAt: number | null
  assignedAccountId: string | null
  teamId: string | null
  unreadMessages: number
  senderPhoneNumberId: string | null
  sessionStartAt: number | null
  activeSession: boolean
  lastMessageAt: number | null
  lastMessageFrom: string | null
  lastMessageType: string | null
  lastMessageBy: string | null
  lastMessageContent: string | null
  notes: string | null
  tagIds: string[]
  customAttributes: Record<string, unknown>
  funnelStages: Record<string, unknown>
  createdAt: number | null
  updatedAt: number | null
  /**
   * Montada a partir de uma linha de contato unificado, enquanto `GET /chats/:id` não
   * responde: serve ao cabeçalho, mas não para decidir nada sobre a conversa.
   */
  partial?: boolean
}

export type ChatsResponse = {
  chats: Chat[]
  meta: { page: number; perPage: number; hasMore: boolean }
}

export type ChatResponse = {
  chat: Chat
  attributeList: AttributeDefinition[]
  connectorProvider: string | null
}

/** O que `ChatListChannel` entrega. */
export type ChatListMessage =
  | { action: "upsert"; event: Chat }
  | { action: "remove"; event: { id: string } }
  | { action: "recent_chats"; events: Chat[] }

export type MessageRole = "user" | "assistant" | "base" | "system"

export type MessageStatus = "pending" | "server_ack" | "delivery_ack" | "read" | "failed"

export type MessageReaction = {
  emoji: string
  from: string
  senderName?: string | null
  accountId?: string | null
  reactedAt?: number | null
}

export type MediaProperties = {
  fileName?: string | null
  fileLength?: number | string | { low?: number; high?: number; unsigned?: boolean } | null
  seconds?: number | null
  width?: number | null
  height?: number | null
  mimetype?: string | null
  isAnimated?: boolean | null
}

export type ExternalAdReply = {
  title?: string | null
  body?: string | null
  sourceApp?: string | null
  sourceType?: string | null
  sourceUrl?: string | null
  sourceId?: string | null
  mediaUrl?: string | null
  mediaType?: string | number | null
  thumbnailUrl?: string | null
  originalImageUrl?: string | null
  greetingMessageBody?: string | null
}

export type ChatMessage = {
  id: string
  chatId: string
  role: MessageRole
  roleBaseType: string | null
  typeElement: "text" | "image" | "audio" | "media" | string
  content: string | null
  caption: string | null
  mediaType: string | null
  mediaUrl: string | null
  audioUrl: string | null
  mediaProperties: MediaProperties | null
  messageId: string | null
  messageOrigin: "frontend" | "platform" | string | null
  senderName: string | null
  accountId: string | null
  status: MessageStatus | null
  statusMessage: string | null
  replyToMessageId: string | null
  reactions: MessageReaction[]
  contextMessage: Record<string, unknown> | null
  externalAdReply: ExternalAdReply | null
  hasSpan: boolean
  isSpan: boolean
  missingMessage: boolean | null
  campaignId: string | null
  deletedAt: number | null
  deletedScope: string | null
  createdAt: number
  /** Só na linha do tempo "Todos": de que canal veio. */
  connectorId?: string | null
  senderPhoneNumberId?: string | null
}

export type AttributeDefinition = {
  name: string
  key: string
  description: string | null
  valueType: CustomFieldType
  optionValues: string[]
}

export type MessagesResponse = {
  messages: ChatMessage[]
  hasMore: boolean
  oldestId: string | null
  assignedAccountId?: string | null
  automationEnabled?: boolean
  tagIds?: string[]
  customAttributes?: Record<string, unknown>
  unreadMessages?: number
  attributeList?: AttributeDefinition[]
  connectorProvider?: string | null
}

/** Eventos de `ChatChannel` que não são a própria mensagem. Desconhecido é ignorado. */
export type ChatChannelEnvelope =
  | {
      event: "message_reaction_failed"
      id: string
      reactions: MessageReaction[]
      errors?: string[]
    }
  | { event: "messages_deleted"; messageIds: string[]; scope: "me" | "everyone" }
  | { event: string; [key: string]: unknown }

export type ChatChannelMessage = ChatMessage | ChatChannelEnvelope

export type BulkDeleteScope = "me" | "everyone"

export type BulkDeleteResponse = {
  scopeApplied: BulkDeleteScope
  deletedIds: string[]
  revokedIds: string[]
}

export type UnifiedContactChat = {
  chatId: string
  connectorId: string | null
  unread: number
  lastMessageAt: number | null
  senderPhoneNumberId: string | null
  audienceType: string | null
  status: ChatStatus
  matched: boolean
}

export type UnifiedContact = {
  externalId: string
  audienceId: string | null
  name: string | null
  profilePictureUrl: string | null
  totalUnread: number
  matchCount: number
  lastMessageAt: number | null
  lastMessageContent: string | null
  lastMessageBy: string | null
  /** A API passou a trazer para a prévia de mídia sem legenda; antes disso, ausente. */
  lastMessageType?: string | null
  chats: UnifiedContactChat[]
}

export type UnifiedContactsResponse = {
  contacts: UnifiedContact[]
  meta: { page: number; perPage: number; hasMore: boolean; filtered: boolean }
}

export type ChatTag = {
  id: string
  name: string
  description: string | null
  color: string
  createdAt: number
}

export type ChatTagsResponse = { chatTags: ChatTag[]; meta: PaginationMeta }

export type ChatPerson = {
  id: string
  name: string
  email: string
  avatarUrl: string | null
  teamIds: string[]
  setupOnly: boolean
}

export type ChatTeam = { id: string; name: string; visible: boolean }

export type CustomFieldType = "text" | "number" | "list" | "checkbox" | "date"

export type CustomField = {
  id: string
  name: string
  key: string
  description: string | null
  valueType: CustomFieldType
  defaultValue: string | null
  optionValues: string[]
}

export type CustomFieldsResponse = { customFields: CustomField[]; meta: PaginationMeta }

export type QueryOperator = "and" | "or"

/** Uma condição dos filtros avançados e das visões salvas, como a API a lê. */
export type FilterCondition = {
  attributeKey: string
  filterOperator: string
  values: string[]
  queryOperator: QueryOperator
  /** Só em campo personalizado: é texto no Mongo, e compara como número por isto. */
  valueType?: string
}

export type ChatView = {
  id: string
  name: string
  payload: FilterCondition[]
  personal: boolean
  accountId: string | null
  createdAt: number
  updatedAt: number
}

export type ChatViewsResponse = { chatViews: ChatView[]; meta: PaginationMeta }
