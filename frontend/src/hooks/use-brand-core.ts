import { useCallback } from "react"
import { useSWRConfig } from "swr"

import { useApi } from "@/hooks/use-api"
import { apiDelete, apiFetch, apiGet, apiPatch, apiPost } from "@/lib/api"
import type {
  BrandAssetKind,
  BrandCore,
  BrandDocument,
  BrandSection,
  BrandStep,
  BrandVersion,
} from "@/lib/brand-core"
import { getClientId } from "@/lib/cable"

export const BRAND_CORE_KEY = "/brand-core"
export const BRAND_VERSIONS_KEY = "/brand-core/versions"

export function isBrandCoreKey(key: unknown): boolean {
  return typeof key === "string" && key.startsWith(BRAND_CORE_KEY)
}

/** O Brandcore da organização — criado pelo servidor na primeira visita. */
export function useBrandCore() {
  const { data, error, isLoading, mutate } = useApi<BrandCore>(BRAND_CORE_KEY)

  return {
    brandCore: data,
    isLoading: isLoading && !data,
    error,
    reload: () => mutate(),
  }
}

export function useBrandVersions(enabled = true) {
  const { data, error, isLoading, mutate } = useApi<{ versions: BrandVersion[] }>(
    enabled ? BRAND_VERSIONS_KEY : null
  )

  return {
    versions: data?.versions,
    isLoading: isLoading && !data,
    error,
    reload: () => mutate(),
  }
}

type SectionPayload<S extends BrandSection> = BrandDocument[S]

type ProgressPayload = { visitedSteps?: BrandStep[]; lastStep?: BrandStep }

/** Cabeçalho que deixa o servidor devolver o eco desta aba pelo canal. */
function clientHeaders() {
  return { headers: { "X-Client-Id": getClientId() } }
}

export function useBrandCoreMutations() {
  const { mutate } = useSWRConfig()

  const store = useCallback(
    (brandCore: BrandCore) => mutate(BRAND_CORE_KEY, brandCore, { revalidate: false }),
    [mutate]
  )

  /**
   * Salva uma seção inteira (uma etapa) e, junto, o progresso. O servidor
   * normaliza e devolve o documento completo, que substitui o cache — sem
   * revalidar por cima do que a pessoa está digitando.
   */
  const saveSection = useCallback(
    async <S extends BrandSection>(
      section: S,
      data: SectionPayload<S>,
      progress?: ProgressPayload
    ): Promise<BrandCore> => {
      const saved = await apiPatch<BrandCore>(
        BRAND_CORE_KEY,
        { brandCore: { document: { [section]: data }, progress } },
        clientHeaders()
      )
      await store(saved)
      return saved
    },
    [store]
  )

  const saveProgress = useCallback(
    async (progress: ProgressPayload): Promise<BrandCore> => {
      const saved = await apiPatch<BrandCore>(BRAND_CORE_KEY, { brandCore: { progress } }, clientHeaders())
      await store(saved)
      return saved
    },
    [store]
  )

  const publish = useCallback(async (): Promise<BrandCore> => {
    const published = await apiPost<BrandCore>(`${BRAND_CORE_KEY}/publish`, undefined, clientHeaders())
    await store(published)
    await mutate(BRAND_VERSIONS_KEY)
    return published
  }, [mutate, store])

  const uploadAsset = useCallback(
    async (kind: BrandAssetKind, variant: string | null, file: File) => {
      const body = new FormData()
      body.append("file", file)
      body.append("kind", kind)
      if (variant) body.append("variant", variant)
      const asset = await apiFetch<BrandCore["assets"][number]>(`${BRAND_CORE_KEY}/assets`, {
        method: "POST",
        body,
        ...clientHeaders(),
      })
      // A completude muda com o logo, então o documento inteiro volta.
      await mutate(BRAND_CORE_KEY, apiGet<BrandCore>(BRAND_CORE_KEY), { revalidate: false })
      return asset
    },
    [mutate]
  )

  const deleteAsset = useCallback(
    async (id: string) => {
      await mutate(
        BRAND_CORE_KEY,
        (current?: BrandCore) =>
          current && { ...current, assets: current.assets.filter((asset) => asset.id !== id) },
        { revalidate: false }
      )
      try {
        await apiDelete(`${BRAND_CORE_KEY}/assets/${id}`, clientHeaders())
      } finally {
        await mutate(BRAND_CORE_KEY)
      }
    },
    [mutate]
  )

  const reload = useCallback(() => mutate(isBrandCoreKey), [mutate])

  return { saveSection, saveProgress, publish, uploadAsset, deleteAsset, reload }
}
