import type { PermissionKey } from "@/lib/auth"
import type { AccessRolePermissions } from "./types"

// O mapa de permissões, espelho de `AccessRole` no Rails. A tela valida com estes mesmos
// níveis antes de enviar: como "qualquer valor diferente de none libera", um nível
// inventado daria acesso, e a API recusaria com 422.

/** `AccessRole::LEVELS`. */
export const PERMISSION_LEVELS = ["all", "own", "none"] as const
/** `AccessRole::CHAT_LIST_LEVELS`: quais conversas a pessoa enxerga. */
export const CHAT_LIST_LEVELS = ["all", "team", "assigned"] as const

export type ChatListLevel = (typeof CHAT_LIST_LEVELS)[number]
export type PermissionResource = Exclude<PermissionKey, "chat_list_to">

/** Na mesma ordem e nos mesmos grupos do menu lateral: é assim que a pessoa conhece as áreas. */
export const PERMISSION_SECTIONS: { id: string; resources: PermissionResource[] }[] = [
  { id: "home", resources: ["dashboard", "custom_dashboards"] },
  { id: "ai", resources: ["flows"] },
  { id: "productivity", resources: ["calendar", "pipelines"] },
  { id: "service", resources: ["chat", "contacts", "catalog", "funnel", "campaigns"] },
  { id: "system", resources: ["core_settings"] },
]

export const PERMISSION_RESOURCES: PermissionResource[] = PERMISSION_SECTIONS.flatMap(
  (section) => section.resources
)

/** `AccessRole::BLANK_PERMISSIONS`: o ponto de partida de um grupo novo. */
export const BLANK_PERMISSIONS: AccessRolePermissions = {
  dashboard: "none",
  custom_dashboards: "none",
  flows: "none",
  calendar: "none",
  pipelines: "none",
  chat: "none",
  chat_list_to: "all",
  contacts: "none",
  catalog: "none",
  funnel: "none",
  campaigns: "none",
  core_settings: "none",
}

export const FULL_PERMISSIONS: AccessRolePermissions = {
  dashboard: "all",
  custom_dashboards: "all",
  flows: "all",
  calendar: "all",
  pipelines: "all",
  chat: "all",
  chat_list_to: "all",
  contacts: "all",
  catalog: "all",
  funnel: "all",
  campaigns: "all",
  core_settings: "all",
}

/** O mapa de um grupo, com o que faltar preenchido: chave ausente é o mesmo que `none`. */
export function completePermissions(
  permissions: Partial<AccessRolePermissions> | undefined
): AccessRolePermissions {
  return { ...BLANK_PERMISSIONS, ...permissions }
}

/** `none` nega; qualquer outro nível libera, como no Rails. */
export function isGranted(level: string | undefined): boolean {
  return Boolean(level) && level !== "none"
}

export function grantedResources(
  permissions: Partial<AccessRolePermissions> | undefined
): PermissionResource[] {
  return PERMISSION_RESOURCES.filter((resource) => isGranted(permissions?.[resource]))
}

export function chatListLevel(
  permissions: Partial<AccessRolePermissions> | undefined
): ChatListLevel {
  const level = permissions?.chat_list_to
  return CHAT_LIST_LEVELS.find((candidate) => candidate === level) ?? "all"
}
