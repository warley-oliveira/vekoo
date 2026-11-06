import { useCallback } from "react"

import {
  useAuth,
  type PermissionKey,
  type PermissionLevel,
} from "@/lib/auth"

/** Nível da pessoa numa permissão, a partir da sessão. Chave ausente é `none`. */
export function usePermissionLevel(key: PermissionKey): PermissionLevel {
  const { session } = useAuth()
  return session?.account.permissions?.[key] ?? "none"
}

/**
 * `useCan("chat")`: a pessoa tem acesso a esta área?
 *
 * Só decide o que aparece na tela: quem garante de verdade é o `require_permission`
 * do controlador. Sem chave (`useCan()`) é sempre `true`, para item livre de menu.
 */
export function useCan(key?: PermissionKey): boolean {
  const { session } = useAuth()
  if (!key) return true
  return (session?.account.permissions?.[key] ?? "none") !== "none"
}

/** Versão para listas: uma função só, em vez de um hook por item. */
export function useCanAccess(): (key?: PermissionKey) => boolean {
  const { session } = useAuth()
  const permissions = session?.account.permissions
  return useCallback(
    (key?: PermissionKey) => !key || (permissions?.[key] ?? "none") !== "none",
    [permissions]
  )
}
