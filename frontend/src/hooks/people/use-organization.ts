import { useCallback, useEffect } from "react"
import { useSWRConfig } from "swr"

import { useApi } from "@/hooks/use-api"
import { apiDelete, apiPatch, apiUpload } from "@/lib/api"
import { useAuth, useSession, type Organization } from "@/lib/auth"
import type { OrganizationSettings } from "@/lib/people/types"

const KEY = "/organization"

export type OrganizationInput = {
  name?: string
  timezone?: string
  settings?: OrganizationSettings
}

/**
 * A organização da sessão. Ela já veio em `/me`, então a tela abre sem esperar, e a leitura
 * só confere se alguém mudou algo enquanto isso.
 */
export function useOrganization() {
  const { organization: fromSession } = useSession()
  const { updateSession } = useAuth()
  const { mutate: globalMutate } = useSWRConfig()
  const { data, error, isValidating, mutate } = useApi<Organization>(KEY, {
    fallbackData: fromSession,
  })

  const fresh = data && !isValidating && !error ? data : null
  useEffect(() => {
    if (fresh) updateSession({ organization: fresh })
  }, [fresh, updateSession])

  const apply = useCallback(
    (organization: Organization) => {
      updateSession({ organization })
      void globalMutate(KEY, organization, { revalidate: false })
      return organization
    },
    [globalMutate, updateSession]
  )

  const updateOrganization = useCallback(
    async (input: OrganizationInput) =>
      apply(await apiPatch<Organization>(KEY, { organization: input })),
    [apply]
  )

  const uploadLogo = useCallback(
    async (file: File, options?: { signal?: AbortSignal; onProgress?: (fraction: number) => void }) => {
      const body = new FormData()
      body.append("file", file)
      return apply(await apiUpload<Organization>(`${KEY}/logo`, body, options))
    },
    [apply]
  )

  const removeLogo = useCallback(
    async () => apply(await apiDelete<Organization>(`${KEY}/logo`)),
    [apply]
  )

  return {
    organization: data ?? fromSession,
    error,
    reload: () => mutate(),
    updateOrganization,
    uploadLogo,
    removeLogo,
  }
}
