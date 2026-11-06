import { useCallback } from "react"
import useSWR from "swr"
import { useTranslation } from "react-i18next"

import { apiDelete, apiPatch, apiPost } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { fetchAllPages } from "@/lib/people/fetch-all-pages"
import type { AccessRole, AccessRolePermissions } from "@/lib/people/types"
import { useRevalidatePeople } from "./use-people"

export const ACCESS_ROLES_KEY = "/access-roles?perPage=100"

type AccessRoleInput = {
  name?: string
  permissions?: Partial<AccessRolePermissions>
}

/** `/access-roles` exige `core_settings`, até para ler: sem ela, não pede. */
export function useAccessRoles({ enabled = true }: { enabled?: boolean } = {}) {
  const { data, error, isLoading, isValidating, mutate } = useSWR<AccessRole[]>(
    enabled ? ACCESS_ROLES_KEY : null,
    () => fetchAllPages<AccessRole>(ACCESS_ROLES_KEY, "accessRoles")
  )

  return {
    roles: data,
    error,
    isLoading,
    isValidating,
    reload: () => mutate(),
  }
}

/** O nome gravado dos grupos padrão é dado, em pt-BR: na tela, `defaultKey` traduz. */
export function useRoleName() {
  const { t } = useTranslation()

  return useCallback(
    (role: Pick<AccessRole, "name" | "defaultKey">) =>
      role.defaultKey ? t(`people.roles.defaults.${role.defaultKey}`) : role.name,
    [t]
  )
}

export function useAccessRoleMutations() {
  const { refreshSession } = useAuth()
  const revalidatePeople = useRevalidatePeople()

  // Mexer num grupo muda o que quem está nele pode, inclusive quem está mexendo.
  const settle = useCallback(async () => {
    await revalidatePeople()
    await refreshSession()
  }, [refreshSession, revalidatePeople])

  const createRole = useCallback(
    async (input: AccessRoleInput) => {
      const role = await apiPost<AccessRole>("/access-roles", { accessRole: input })
      await revalidatePeople()
      return role
    },
    [revalidatePeople]
  )

  const updateRole = useCallback(
    async (id: string, input: AccessRoleInput) => {
      const role = await apiPatch<AccessRole>(`/access-roles/${id}`, { accessRole: input })
      await settle()
      return role
    },
    [settle]
  )

  const deleteRole = useCallback(
    async (id: string) => {
      await apiDelete(`/access-roles/${id}`)
      await settle()
    },
    [settle]
  )

  return { createRole, updateRole, deleteRole }
}
