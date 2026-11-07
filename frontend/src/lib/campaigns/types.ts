import type { PaginationMeta } from "@/lib/api"

// O contrato está em `docs/migration/api/outreach.md`. O assistente de criação tem os tipos dele: as
// duas frentes evoluem em separado, e um tipo repetido é mais barato que um arquivo disputado.

export const CAMPAIGN_STATUSES = [
  "running",
  "paused",
  "scheduled",
  "draft",
  "completed",
  "cancelled",
] as const
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number]

export type PauseReason = "noActiveConnectors" | "channelFailing"

export type Campaign = {
  id: string
  name: string
  status: CampaignStatus
  /** Quando quem pausou foi a plataforma. `null` quando foi uma pessoa. */
  pauseReason: PauseReason | null
  messageType: "text" | "media"
  campaignMode: "text" | "template"
  attachmentId: string | null
  mediaUrl: string | null
  mediaContentType: string | null
  mediaFileName: string | null
  totalContacts: number
  sentCount: number
  deliveredCount: number
  readCount: number
  failedCount: number
  /** Só existe depois de o back-end desta frente entrar: sem ele, a tela não mostra respostas. */
  repliedCount?: number
  connectorIds: string[]
  wabaConnectorId: string | null
  phoneNumberIds: string[]
  templateIds: string[]
  flowId: string | null
  chatTagIds: string[]
  raiseChats: boolean
  sendWindowStart: string | null
  sendWindowEnd: string | null
  sendDays: number[]
  intervalMin: number
  intervalMax: number
  dailyLimitPerConnector: number
  timezone: string
  scheduledAt: number | null
  startedAt: number | null
  completedAt: number | null
  estimatedCompletionAt: number | null
  createdAt: number
  updatedAt: number
}

export type ActivityAction =
  | "created"
  | "scheduled"
  | "launched"
  | "paused"
  | "resumed"
  | "cancelled"
  | "completed"
  | "launch_failed"
  | "channel_stopped"
  | "channel_resumed"

export type ActivityEvent = {
  id: string
  action: ActivityAction | (string & {})
  /** `null` quando foi a plataforma. */
  accountId: string | null
  occurredAt: number
  /** A frase pronta, no idioma da requisição. */
  details: string | null
  metadata: Record<string, unknown>
}

export type CampaignDetail = Campaign & {
  messages: string[]
  batchSize: number
  createdByAccountId: string | null
  activityEvents: ActivityEvent[]
}

/** O que o evento `progress` traz. `pending` e `skipped` só saem em `GET /stats`. */
export type LiveStats = {
  totalContacts: number
  sent: number
  delivered: number
  read: number
  failed: number
  replied?: number
  deliveryRate: number
  openRate: number
  messagesPerHour: number
  estimatedCompletion: number | null
}

export type CampaignStats = LiveStats & {
  pending: number
  skipped: number
}

export const RECIPIENT_STATUSES = [
  "pending",
  "sending",
  "sent",
  "delivered",
  "read",
  "failed",
  "skipped",
] as const
export type RecipientStatus = (typeof RECIPIENT_STATUSES)[number]

export type RecipientErrorCode =
  | "whatsappError"
  | "numberNotFound"
  | "noPhoneNumber"
  | "mediaUnsupported"
  | "mediaUnavailable"
  | "templateUnavailable"
  | "interrupted"

export type Recipient = {
  id: string
  contactName: string | null
  phoneNumber: string
  status: RecipientStatus
  chatId: string | null
  sentAt: number | null
  deliveredAt: number | null
  readAt: number | null
  repliedAt?: number | null
  errorCode: RecipientErrorCode | (string & {}) | null
  errorMessage: string | null
}

export type CampaignSummary = {
  total: number
  byStatus: Record<CampaignStatus, number>
  sent: number
  delivered: number
  read: number
  failed: number
  replied?: number
  openRate: number
}

export type CampaignConnector = {
  id: string
  type: string
  name: string
  status: string
  active: boolean
  profileName?: string | null
  numberFormatted?: string | null
  displayPhoneNumber?: string | null
}

export type CampaignTag = {
  id: string
  name: string
  color: string | null
}

export type CampaignFlow = {
  id: string
  name: string
}

export type CampaignCapabilities = {
  placeExtractions: { available: boolean }
  googleSheets: { available: boolean }
}

/* ---------- respostas ---------- */

export type CampaignsResponse = { campaigns: Campaign[]; meta: PaginationMeta }
export type CampaignResponse = { campaign: CampaignDetail }
export type CampaignStatsResponse = { stats: CampaignStats }
export type RecipientsResponse = { recipients: Recipient[]; meta: PaginationMeta }
export type CampaignSummaryResponse = { summary: CampaignSummary }
export type ConnectorsResponse = { connectors: CampaignConnector[] }
export type TagsResponse = { tags: CampaignTag[] }
export type FlowsResponse = { flows: CampaignFlow[] }
export type CapabilitiesResponse = { capabilities: CampaignCapabilities }

/* ---------- tempo real ---------- */

export type CampaignChannelEvent =
  | { event: "progress"; campaignId: string; status: CampaignStatus; stats: LiveStats }
  | { event: "status"; campaignId: string; campaign: Campaign }
  | { event: "recipient"; campaignId: string; recipient: Recipient }
  | { event: "activity"; campaignId: string; activity: ActivityEvent }

/* ---------- busca de estabelecimentos ---------- */

export const PLACE_EXTRACTION_STATUSES = ["pending", "running", "completed", "failed"] as const
export type PlaceExtractionStatus = (typeof PLACE_EXTRACTION_STATUSES)[number]

export type PlaceExtractionEvent = {
  id: string
  status: PlaceExtractionStatus
  searchQuery: string
  location: string | null
  resultsCount: number
  errorCode: string | null
  errorMessage: string | null
  durationSeconds: number | null
  completedAt: number | null
}

export type PlaceExtraction = PlaceExtractionEvent & {
  maxPlaces: number
  language: string
  filters: Record<string, unknown>
  startedAt: number | null
  createdAt: number
  createdBy: { id: string | null; name: string | null }
}

export type Place = {
  title: string
  phone: string
  phoneUnformatted: string
  address: string
  street: string
  city: string
  state: string
  postalCode: string
  countryCode: string
  neighborhood: string
  website: string
  categoryName: string
  categories: string[]
  totalScore: number
  reviewsCount: number
  imageUrl: string
  url: string
  placeId: string
  latitude: number | null
  longitude: number | null
  instagram: string
  facebook: string
  openingHours: { day: string; hours: string }[]
}

export type PlaceContact = Place & {
  extractionId: string
  extractionQuery: string
  extractionLocation: string | null
  extractedAt: number | null
}

export type PlaceExtractionChannelEvent = {
  action: "status_update" | "extraction_completed"
  data: PlaceExtractionEvent
}

export type PlaceExtractionsResponse = { extractions: PlaceExtraction[]; meta: PaginationMeta }
export type PlaceExtractionResultsResponse = {
  id: string
  status: PlaceExtractionStatus
  results: Place[]
  resultsCount: number
}
export type PlaceContactsResponse = { contacts: PlaceContact[]; meta: PaginationMeta }
