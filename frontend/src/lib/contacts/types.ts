import type { PaginationMeta } from "@/lib/api"
import type { Connector, ConnectorType } from "@/lib/connectors/types"

// Contato aqui é a conversa: uma pessoa em um canal. Quem decide quais a pessoa vê é o
// servidor (`chat_list_to`), então nenhum total desta tela quer dizer "a organização
// inteira": é sempre "o que você vê".

export type ContactStatus = "open" | "closed"

export type Contact = {
  id: string
  userName: string | null
  displayName: string | null
  externalId: string | null
  phoneNumber: string | null
  /** Caminho relativo à API ou URL absoluta: use `apiAssetUrl`. */
  profilePictureUrl: string | null
  lastMessageAt: number | null
  lastMessageFrom: string | null
  lastMessageType: string | null
  lastMessageBy: string | null
  lastMessageContent: string | null
  status: ContactStatus
  automationEnabled: boolean
  assignedAccountId: string | null
  teamId: string | null
  connectorId: string | null
  connectorName: string | null
  connectorType: ConnectorType | null
  tagIds: string[]
  activeSession: boolean
  createdAt: number
  unreadMessages: number
  notes: string | null
  /** Sempre texto, inclusive número e booleano. */
  customAttributes: Record<string, string>
}

export type ContactsResponse = {
  contacts: Contact[]
  meta: PaginationMeta
}

export type ContactTag = {
  id: string
  name: string
  description: string | null
  color: string
}

export type ContactUser = {
  id: string
  name: string
  /** `false`: quem configura, mas não atende. Entra no filtro, e a atribuição recusaria. */
  assignable?: boolean
}

export type ContactTeam = { id: string; name: string }

export type ContactFilterOptions = {
  connectors: Connector[]
  tags: ContactTag[]
  users: ContactUser[]
  teams: ContactTeam[]
}

export type CustomFieldType = "text" | "number" | "list" | "checkbox" | "date"

export type CustomField = {
  id: string
  name: string
  key: string
  description: string | null
  valueType: CustomFieldType
  optionValues: string[]
}

export type CustomFieldsResponse = {
  customFields: CustomField[]
  meta: PaginationMeta
}

export type BulkResult = { updatedCount: number }

/* ---------- importação ---------- */

export type ContactImportStatus = "pending" | "processing" | "completed" | "failed"

export type ContactImport = {
  id: string
  connectorId: string
  accountId: string | null
  fileName: string | null
  status: ContactImportStatus
  totalContacts: number
  importedContactsCount: number
  errorsCount: number
  includeCountryCode: boolean
  batchIndex: number | null
  totalBatches: number | null
  successRate: number
  progressPercentage: number
  processingDuration: number | null
  startedAt: number | null
  completedAt: number | null
  createdAt: number
}

export type ContactImportsResponse = {
  contactImports: ContactImport[]
  meta: PaginationMeta
}

export type CreateContactImportResponse = {
  contactImport: ContactImport
  importedCount: number
  totalContacts: number
}

/* ---------- exportação: eventos de `ContactsExportChannel` ---------- */

export type ContactsExportEvent =
  | { action: "progress"; data: { processed: number; total: number } }
  | {
      action: "completed"
      data: {
        downloadUrl: string | null
        total: number
        fileName?: string
        message?: string
      }
    }
  | { action: "error"; data: { error: string } }
