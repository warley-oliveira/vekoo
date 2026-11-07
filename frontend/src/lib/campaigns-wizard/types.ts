import type { PaginationMeta } from "@/lib/api"

// O formato de `docs/migration/api/outreach.md`. Ids como string, datas em milissegundos. Duplicar um
// tipo da frente da lista é de propósito: as duas frentes de campanhas não dividem módulo.

export type CampaignStatus = "draft" | "scheduled" | "running" | "paused" | "completed" | "cancelled"
export type CampaignMode = "text" | "template"
export type MessageType = "text" | "media"

export type Campaign = {
  id: string
  name: string
  status: CampaignStatus
  messageType: MessageType
  campaignMode: CampaignMode
  messages: string[]
  attachmentId: string | null
  mediaUrl: string | null
  mediaContentType: string | null
  mediaFileName: string | null
  totalContacts: number
  connectorIds: string[]
  wabaConnectorId: string | null
  phoneNumberIds: string[]
  templateIds: string[]
  /** `{ "<id do modelo>": { "<posição>": "texto com {{variáveis}}" } }`. */
  templateParams: Record<string, Record<string, string>>
  flowId: string | null
  chatTagIds: string[]
  raiseChats: boolean
  sendWindowStart: string
  sendWindowEnd: string
  sendDays: number[]
  /** Em segundos. */
  intervalMin: number
  intervalMax: number
  dailyLimitPerConnector: number
  timezone: string
  scheduledAt: number | null
  createdAt: number
  updatedAt: number
}

export type CampaignResponse = { campaign: Campaign }

export type CampaignWarning = { code: string; connectorIds?: string[]; message: string }

export type LaunchResponse = CampaignResponse & {
  warnings: CampaignWarning[]
  estimatedCompletionAt: number | null
}

export type ImportResult = {
  importedCount: number
  skippedCount: number
  invalidCount: number
  totalRecipients: number
}

export type RemoveResult = { removedCount: number; totalRecipients: number }

export type RecipientVariable = { name: string; count: number }

export type RecipientSample = {
  name: string
  phone: string
  variables: Record<string, unknown>
}

export type RecipientSummary = {
  total: number
  fromContacts: number
  imported: number
  variables: RecipientVariable[]
  sample: RecipientSample | null
}

export type Recipient = {
  id: string
  contactName: string
  phoneNumber: string
  status: string
}

export type RecipientsResponse = { recipients: Recipient[]; meta: PaginationMeta }

export type Capabilities = {
  placeExtractions: { available: boolean }
  googleSheets: {
    available: boolean
    clientId: string | null
    apiKey: string | null
    appId: string | null
  }
}

export type CampaignFlow = { id: string; name: string }

export type CampaignTag = {
  id: string
  name: string
  description: string | null
  color: string
}

/* ---------- estabelecimentos ---------- */

export type PlaceHours = { day: string; hours: string }

export type PlaceResult = {
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
  totalScore: number | null
  reviewsCount: number | null
  imageUrl: string
  url: string
  placeId: string
  latitude: number | null
  longitude: number | null
  instagram: string
  facebook: string
  openingHours: PlaceHours[]
}

export type PlaceContact = PlaceResult & {
  extractionId: string
  extractionQuery: string
  extractionLocation: string | null
  extractedAt: number
}

export type PlaceExtractionStatus = "pending" | "running" | "completed" | "failed"

export type PlaceExtraction = {
  id: string
  status: PlaceExtractionStatus
  searchQuery: string
  location: string | null
  resultsCount: number
  errorCode: string | null
  errorMessage: string | null
}

/** Uma busca aberta pelo link da tela de buscas. Ainda em andamento, vem sem resultados. */
export type LinkedPlaces = {
  extraction: PlaceExtraction
  results: PlaceResult[]
}

export type PlaceChannelEvent = {
  action: "status_update" | "extraction_completed"
  data: PlaceExtraction
}
