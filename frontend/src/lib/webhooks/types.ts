// O contrato de webhooks (docs/migration/api/automation.md). No banco o modelo se chama `Hook`, e as rotas e a tela,
// webhook. `config` é a forma de cada tipo de ação, em camelCase; `headers` e `body` são da pessoa e passam intactos.

export const WEBHOOK_STATUSES = ["test", "active", "inactive"] as const
export type WebhookStatus = (typeof WEBHOOK_STATUSES)[number]

export const ACTION_TYPES = {
  contact: "HookAction::ContactHandling",
  startFlow: "HookAction::StartFlow",
  userField: "HookAction::UserField",
  code: "HookAction::CodeRunner",
  http: "HookAction::HttpRequest",
} as const
export type HookActionType = (typeof ACTION_TYPES)[keyof typeof ACTION_TYPES]

export const MESSAGE_BLOCK_TYPES = ["text", "image", "video", "document", "audio"] as const
export type MessageBlockType = (typeof MESSAGE_BLOCK_TYPES)[number]

export type MessageBlock = {
  id: string
  type: MessageBlockType
  content?: string | null
  mediaUrl?: string | null
  fileName?: string | null
  caption?: string | null
  mediaSource?: "url" | "attachment" | null
  attachmentId?: string | null
}

export type HttpHeader = { key: string; value: string }

export type HookActionConfig = {
  contactIdentifier?: string | null
  contactName?: string | null
  customFieldId?: string | null
  valueTemplate?: string | null
  connectorId?: string | null
  flowId?: string | null
  sendMode?: "simple" | "advanced" | null
  messageText?: string | null
  messageBlocks?: MessageBlock[] | null
  whatsappTemplateId?: string | null
  whatsappTemplateParams?: string[] | null
  phoneNumberId?: string | null
  code?: string | null
  url?: string | null
  httpMethod?: string | null
  headers?: HttpHeader[] | null
  body?: string | Record<string, unknown> | null
}

export type HookAction = {
  id: string
  type: HookActionType
  /** Fixa: não sai do webhook. */
  static: boolean
  config: HookActionConfig
  createdAt: number
  updatedAt: number
}

export type Webhook = {
  id: string
  uid: string
  name: string
  slug: string
  status: WebhookStatus
  totalRequest: number
  /** Vem de `BACKEND_URL`. Sem ela, só o caminho: quem mostra completa com a origem da API. */
  url: string
  /** O último que chegou em teste, achatado: `body.cliente.nome => "Ana"`. */
  receivedPayload: Record<string, unknown>
  signatureEnabled: boolean
  /** `whsec_••••••••4f2a`: só para reconhecer a chave. */
  signingSecretHint: string | null
  signingSecretGeneratedAt: number | null
  webhookActions: HookAction[]
  createdAt: number
  updatedAt: number
}

/** A única resposta em que a chave aparece inteira. Religar com chave antiga devolve `null`. */
export type SignatureResult = { webhook: Webhook; signingSecret: string | null }

export type WebhookAlert = {
  id: string
  category: string
  severity: string
  originType: string
  originId: string
  originName: string | null
  code: string
  message: string | null
  metadata: Record<string, unknown> | null
  createdAt: number
  updatedAt: number
}

export const LOG_STATUSES = ["success", "error", "skipped"] as const
export type WebhookLogStatus = (typeof LOG_STATUSES)[number]

export type WebhookLog = {
  id: string
  webhookId: string
  webhookUid: string
  webhookName: string
  requestMethod: string
  requestHeaders: Record<string, unknown>
  requestBody: Record<string, unknown>
  requestQuery: Record<string, unknown>
  requestIp: string | null
  status: WebhookLogStatus
  statusCode: number | null
  errorMessage: string | null
  processingTimeMs: number | null
  /** Como o webhook estava na hora. */
  webhookStatus: WebhookStatus | null
  createdAt: number
}

export type WebhookDayStats = { total: number; success: number; error: number; skipped: number }

export type WebhookLogStats = {
  periodDays: number
  totalRequests: number
  successCount: number
  errorCount: number
  skippedCount: number
  avgProcessingTimeMs: number
  /** Só os dias com alguma requisição. */
  dailyStats: Record<string, WebhookDayStats>
}
