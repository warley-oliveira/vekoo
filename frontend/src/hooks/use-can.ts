import { useCallback } from "react"

import {
  useAuth,
  type PermissionKey,
  type PermissionLevel,
} from "@/lib/auth"

// As permissões são do vínculo da pessoa com a organização da aba (`session.account`). O suporte
// do Vekoo (`user.master`) pode tudo em qualquer organização: a API já responde `all` em cada
// chave para ele, e a exceção aqui só garante que a tela nunca o bloqueie antes da API.

/** Nível da pessoa numa permissão, a partir da sessão. Chave ausente é `none`. */
export function usePermissionLevel(key: PermissionKey): PermissionLevel {
  const { session } = useAuth()
  if (session?.user.master) return "all"
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
  if (!key || session?.user.master) return true
  return (session?.account.permissions?.[key] ?? "none") !== "none"
}

/** Versão para listas: uma função só, em vez de um hook por item. */
export function useCanAccess(): (key?: PermissionKey) => boolean {
  const { session } = useAuth()
  const permissions = session?.account.permissions
  const master = session?.user.master ?? false
  return useCallback(
    (key?: PermissionKey) => master || !key || (permissions?.[key] ?? "none") !== "none",
    [permissions, master]
  )
}
