import { useCallback, useEffect } from "react"
import { useSWRConfig } from "swr"

import { useApi } from "@/hooks/use-api"
import { apiDelete, apiPatch, apiUpload } from "@/lib/api"
import { useAuth, useSession, type Account } from "@/lib/auth"

const KEY = "/profile"

export type ProfileInput = {
  name?: string
  phone?: string | null
  currentPassword?: string
  password?: string
  passwordConfirmation?: string
}

/** A conta de quem está usando. Mesma ideia da organização: abre com o que veio em `/me`. */
export function useProfile() {
  const { account: fromSession } = useSession()
  const { updateSession } = useAuth()
  const { mutate: globalMutate } = useSWRConfig()
  const { data, isValidating, error } = useApi<Account>(KEY, { fallbackData: fromSession })

  const fresh = data && !isValidating && !error ? data : null
  useEffect(() => {
    if (fresh) updateSession({ account: fresh })
  }, [fresh, updateSession])

  const apply = useCallback(
    (account: Account) => {
      updateSession({ account })
      void globalMutate(KEY, account, { revalidate: false })
      return account
    },
    [globalMutate, updateSession]
  )

  const updateProfile = useCallback(
    async (input: ProfileInput) => apply(await apiPatch<Account>(KEY, { profile: input })),
    [apply]
  )

  const uploadAvatar = useCallback(
    async (file: File, options?: { signal?: AbortSignal; onProgress?: (fraction: number) => void }) => {
      const body = new FormData()
      body.append("file", file)
      return apply(await apiUpload<Account>(`${KEY}/avatar`, body, options))
    },
    [apply]
  )

  const removeAvatar = useCallback(
    async () => apply(await apiDelete<Account>(`${KEY}/avatar`)),
    [apply]
  )

  return { account: data ?? fromSession, updateProfile, uploadAvatar, removeAvatar }
}
