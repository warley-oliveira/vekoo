import { useCallback } from "react"

import { useApi } from "@/hooks/use-api"
import { apiPatch } from "@/lib/api"
import type { AutomationSettings } from "@/lib/flows/types"

const KEY = "/automation-settings"

export function useAutomationSettings() {
  const { data, error, isLoading, mutate } = useApi<{ automationSettings: AutomationSettings }>(KEY, {
    revalidateOnFocus: false,
  })

  /** A API mescla: o que não vai no corpo continua como está. */
  const update = useCallback(
    async (patch: Partial<AutomationSettings>) => {
      const response = await apiPatch<{ automationSettings: AutomationSettings }>(KEY, patch)
      await mutate(response, { revalidate: false })
      return response.automationSettings
    },
    [mutate]
  )

  return { settings: data?.automationSettings ?? null, error, isLoading, reload: mutate, update }
}
