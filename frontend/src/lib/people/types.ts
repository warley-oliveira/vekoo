import type { Account, PermissionKey } from "@/lib/auth"

// A forma do domínio de pessoas, como a API devolve (docs/migration/api/access.md).

/** A ficha completa de `/users`, para quem tem `core_settings`. */
export type Person = Account & {
  teamIds: string[]
  /** "Não atribuir atendimentos": administra, mas não aparece para receber conversas. */
  setupOnly: boolean
  revokedAt: number | null
}

export type Team = {
  id: string
  name: string
  active: boolean
  /** Conta só quem está ativo. */
  accountsCount: number
  createdAt: number
}

export type AccessRolePermissions = Record<PermissionKey, string>

export type AccessRole = {
  id: string
  /** Dado gravado, em pt-BR. Para mostrar, use `useRoleName`: os padrões têm tradução. */
  name: string
  permissions: Partial<AccessRolePermissions>
  default: boolean
  defaultKey: "manager" | "member" | null
  /** Conta só quem está ativo. */
  accountsCount: number
  createdAt: number
  updatedAt: number
}

/** O que `GET /users/check-email` responde. */
export type EmailCheck = {
  exists: boolean
  hasOrganizationAccess: boolean
  revoked: boolean
}

export type PushDevice = {
  id: string
  endpoint: string
  userAgent: string | null
  createdAt: number
}

/** `organization.settings`, que a sessão trata como mapa livre. */
export type OrganizationSettings = {
  companyInfo?: {
    businessName?: string | null
    cnpj?: string | null
    formattedCnpj?: string | null
    companyName?: string | null
    validCnpj?: boolean
  }
  chatSettings?: {
    autoRemoveWaitingOperatorTag?: boolean
    reopenConversationOnInboundEnabled?: boolean
  }
}
