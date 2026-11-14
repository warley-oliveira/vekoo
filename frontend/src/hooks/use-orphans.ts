import { useCallback } from "react"
import { useSWRConfig } from "swr"

import { useApi } from "@/hooks/use-api"
import { isCarouselKey } from "@/hooks/use-carousels"
import { isFoldersKey } from "@/hooks/use-folders"
import { ApiError, apiPost } from "@/lib/api"
import type { BrandSummary } from "@/lib/brand-core"
import type { CarouselSummary } from "@/lib/types"

// A migração do legado (ver `OrphanMigration` no Rails). Temporária: a API
// responde 404 quando desligada, e a tela some quando os órfãos zeram.

export const ORPHANS_KEY = "/orphans"

export type OrphansPayload = {
  counts: { carousels: number; folders: number }
  carousels: CarouselSummary[]
  brands: BrandSummary[]
  moved?: number
}

export function useOrphans() {
  const { data, error, isLoading, mutate } = useApi<OrphansPayload>(ORPHANS_KEY, {
    // 404 = migração desligada; não insistir.
    shouldRetryOnError: false,
  })
  const disabled = error instanceof ApiError && error.status === 404

  return { orphans: data, disabled, isLoading: isLoading && !data, error: disabled ? undefined : error, reload: () => mutate() }
}

export function useOrphanMutations() {
  const { mutate } = useSWRConfig()

  const assign = useCallback(
    async (brandId: string, carouselIds?: string[]): Promise<OrphansPayload> => {
      const result = await apiPost<OrphansPayload>(`${ORPHANS_KEY}/assign`, { brandId, carouselIds })
      await mutate(ORPHANS_KEY, result, { revalidate: false })
      await mutate(isCarouselKey)
      await mutate(isFoldersKey)
      return result
    },
    [mutate]
  )

  return { assign }
}
