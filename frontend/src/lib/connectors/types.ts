import type { PaginationMeta } from "@/lib/api"

// Formato de `docs/migration/api/connectors.md`. Ids como string, datas em milissegundos.

export type ConnectorStatus =
  | "inactive"
  | "pending"
  | "active"
  | "paused"
  | "failed"
  | "closed"
  | "reject"

export type ConnectorType =
  | "whatsapp_cloud"
  | "whatsapp_web"
  | "zapi"
  | "lead_chat"
  | "facebook_messenger"
  | "instagram_direct"
  | "web_widget"

type ConnectorBase<TType extends ConnectorType> = {
  id: string
  type: TType
  name: string
  status: ConnectorStatus
  active: boolean
  errorMessage: string | null
  sendCollaboratorName: boolean
  createdAt: number
  /** Só na resposta da criação: é o que a pessoa cola no painel da Meta. */
  webhookUrl?: string
  verificationToken?: string
}

export type WhatsappPhoneNumber = {
  id: string
  verifiedName: string | null
  displayPhoneNumber: string | null
  qualityRating: string | null
  isPinEnabled: boolean | null
  isOfficialBusinessAccount: boolean | null
  accountMode: string | null
  certificate: string | null
  codeVerificationStatus: string | null
  eligibilityForApiBusinessGlobalSearch: string | null
  nameStatus: string | null
  newNameStatus: string | null
  status: string | null
  searchVisibility: string | null
}

export type PhoneNumberDetails = {
  about?: string | null
  address?: string | null
  description?: string | null
  email?: string | null
  profilePictureUrl?: string | null
  websites?: string[] | null
}

export type WhatsappCloudConnector = ConnectorBase<"whatsapp_cloud"> & {
  profileName: string | null
  fbStatus: string | null
  qualityRating: string | null
  businessId: string | null
  wabaId: string | null
  phoneNumberId: string | null
  displayPhoneNumber: string | null
  phoneNumberDetails: Record<string, PhoneNumberDetails>
  phoneNumberList: WhatsappPhoneNumber[]
}

export type WhatsappProvider = "evolution_api" | "aiva_api" | "zapi"

export type WhatsappWebConnector = ConnectorBase<"whatsapp_web"> & {
  providerApi: WhatsappProvider | null
  profileName: string | null
  profilePictureUrl: string | null
  numberId: string | null
  numberFormatted: string | null
  reactionsSupported: boolean
  deleteForEveryoneSupported: boolean
}

export type ZapiConnector = ConnectorBase<"zapi"> & {
  instanceId: string | null
  profileName: string | null
  profilePictureUrl: string | null
  numberFormatted: string | null
}

export type InstagramConnector = ConnectorBase<"instagram_direct"> & {
  accountName: string | null
  profileName: string | null
  profilePictureUrl: string | null
  instagramAccountId: string | null
  instagramUsername: string | null
  biography: string | null
  followersCount: number | null
  followsCount: number | null
  mediaCount: number | null
  website: string | null
  accountType: string | null
  authProvider: "instagram_login" | "facebook_login" | null
  linkedMessengerConnectorId: string | null
}

export type MessengerConnector = ConnectorBase<"facebook_messenger"> & {
  profileName: string | null
  profilePictureUrl: string | null
  pageId: string | null
  pageUrl: string | null
  linkedInstagramConnectorId: string | null
}

export type LeadChatConnector = ConnectorBase<"lead_chat"> & {
  phoneNumberId: string | null
}

export type WidgetConnector = ConnectorBase<"web_widget"> & {
  botDisplayName: string | null
  botAvatarUrl: string | null
  primaryColor: string | null
  position: string | null
  welcomeMessage: string | null
  allowedOrigins: string[]
  launcherIcon: string | null
  locale: string | null
}

export type Connector =
  | WhatsappCloudConnector
  | WhatsappWebConnector
  | ZapiConnector
  | InstagramConnector
  | MessengerConnector
  | LeadChatConnector
  | WidgetConnector

export type ConnectorsResponse = { connectors: Connector[]; meta: PaginationMeta }

export type ConnectorResponse = {
  connector: Connector
  extras: { qrCode?: string | null; pairCode?: string | null }
}

export type ConnectorCreated = {
  connector: Connector
  instagramConnector: InstagramConnector | null
}

/** Como `POST /connectors` chama cada tipo. Não é o `type` da resposta. */
export type ConnectorCreateType =
  | "whatsapp_cloud"
  | "whatsapp_web"
  | "meta_channels"
  | "instagram_direct"
  | "web_widget"

/** O que chega por `ConnectorsChannel`. */
export type ConnectionEvent =
  | { status: "qr_updated"; base64?: string | null; pairCode?: string | null }
  | { status: "success_scan"; base64?: string }
  | { status: "qr_timeout"; base64?: string }
  | { status: "qr_error"; error?: string }

export type ConnectorAlert = {
  id: string
  category: string
  severity: string
  originType: string
  originId: string
  originName: string | null
  code: string
  message: string
  metadata: Record<string, unknown> | null
  createdAt: number
  updatedAt: number
}

export type BusinessProfile = {
  about: string | null
  address: string | null
  description: string | null
  email: string | null
  profilePictureUrl: string | null
  websites: string[] | null
  vertical: string | null
}

export type TemplateStatus =
  | "approved"
  | "pending"
  | "rejected"
  | "paused"
  | "disabled"
  | "in_appeal"
  | "limit_exceeded"
  | "archived"
  | "pending_deletion"
  | "deleted"
  | "removed"

/** Payload da Meta: as chaves saem como ela manda, em snake_case. */
export type TemplateButton = {
  type: "PHONE_NUMBER" | "URL" | "QUICK_REPLY" | "COPY_CODE"
  text: string
  phone_number?: string
  url?: string
  /** O endereço completo de exemplo de um link que muda por contato. */
  example?: string[]
}

export type TemplateComponent = {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS"
  format?: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | "LOCATION"
  text?: string
  buttons?: TemplateButton[]
  example?: {
    header_url?: string[]
    header_handle?: string[]
    header_text?: string[]
    header_location?: {
      latitude?: string
      longitude?: string
      name?: string
      address?: string
    }
    body_text?: string[][]
    body_text_named_params?: { param_name: string; example: string }[]
  }
}

export type WhatsappTemplate = {
  id: string
  connectorId: string
  templateId: string | null
  name: string
  language: string
  category: string
  subCategory: string | null
  previousCategory: string | null
  correctCategory: string | null
  rejectedReason: string | null
  status: TemplateStatus
  removed: boolean
  components: TemplateComponent[]
  headerFormat: string | null
  headerMediaUrl: string | null
  hasMediaHeader: boolean
  hasLocationHeader: boolean
  hasParameters: boolean
  buttons: TemplateButton[]
  lastSyncedAt: number | null
  createdAt: number
  updatedAt: number
}

export type WidgetRelease = {
  version: string
  sri?: string | null
  releasedAt?: string | null
  notes?: string | null
}

export type WidgetConfig = {
  id: string
  status: ConnectorStatus
  active: boolean
  publicToken: string | null
  primaryColor: string | null
  position: "bottom-right" | "bottom-left"
  welcomeMessage: string | null
  botAvatarUrl: string | null
  botDisplayName: string | null
  launcherIcon: string | null
  locale: string | null
  preChatFields: "off" | "name" | "name_phone" | "name_phone_email"
  autoPageContext: boolean
  proactiveEnabled: boolean
  launcherImageUrl: string | null
  launcherSize: number | null
  headerBgColor: string | null
  headerTextColor: string | null
  userBubbleColor: string | null
  userBubbleTextColor: string | null
  assistantBubbleColor: string | null
  assistantBubbleTextColor: string | null
  messageAreaBg: string | null
  bubbleRadius: number | null
  panelRadius: number | null
  fontFamily: string | null
  customCss: string | null
  rateLimitPerMin: number | null
  dailyMessageCap: number | null
  dailyVisitorCap: number | null
  allowedOrigins: string[]
  deliveryMode: "rolling" | "pinned"
  pinnedVersion: string | null
  widgetSri: string | null
  cspHeader: string | null
  availableVersions: WidgetRelease[]
  installSnippet: string | null
}
