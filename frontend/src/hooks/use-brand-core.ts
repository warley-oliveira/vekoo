import { useCallback } from "react"
import { useSWRConfig } from "swr"

import { useApi } from "@/hooks/use-api"
import { BRANDS_KEY } from "@/hooks/use-brands"
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

// O Brandcore de **uma** marca (`/brands/:id`). Toda mutação recebe o id:
// não existe mais "a marca da organização", existe a marca da URL.

export function brandKey(brandId: string): string {
  return `/brands/${brandId}`
}

export function brandVersionsKey(brandId: string): string {
  return `/brands/${brandId}/versions`
}

/** Chave da marca (documento, versões, peças…) — para invalidar a família. */
export function isBrandKey(brandId: string) {
  return (key: unknown): key is string => typeof key === "string" && key.startsWith(brandKey(brandId))
}

export function useBrandCore(brandId: string | undefined) {
  const { data, error, isLoading, mutate } = useApi<BrandCore>(brandId ? brandKey(brandId) : null)

  return {
    brandCore: data,
    isLoading: isLoading && !data,
    error,
    reload: () => mutate(),
  }
}

export function useBrandVersions(brandId: string, enabled = true) {
  const { data, error, isLoading, mutate } = useApi<{ versions: BrandVersion[] }>(
    enabled ? brandVersionsKey(brandId) : null
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

export function useBrandCoreMutations(brandId: string) {
  const { mutate } = useSWRConfig()
  const key = brandKey(brandId)

  const store = useCallback(
    async (brandCore: BrandCore) => {
      await mutate(key, brandCore, { revalidate: false })
      // O resumo no seletor (nome, progresso) acompanha.
      await mutate(BRANDS_KEY)
    },
    [key, mutate]
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
        key,
        { brand: { document: { [section]: data }, progress } },
        clientHeaders()
      )
      await store(saved)
      return saved
    },
    [key, store]
  )

  const saveProgress = useCallback(
    async (progress: ProgressPayload): Promise<BrandCore> => {
      const saved = await apiPatch<BrandCore>(key, { brand: { progress } }, clientHeaders())
      await store(saved)
      return saved
    },
    [key, store]
  )

  const publish = useCallback(async (): Promise<BrandCore> => {
    const published = await apiPost<BrandCore>(`${key}/publish`, undefined, clientHeaders())
    await store(published)
    await mutate(brandVersionsKey(brandId))
    return published
  }, [brandId, key, mutate, store])

  const uploadAsset = useCallback(
    async (kind: BrandAssetKind, variant: string | null, file: File) => {
      const body = new FormData()
      body.append("file", file)
      body.append("kind", kind)
      if (variant) body.append("variant", variant)
      const asset = await apiFetch<BrandCore["assets"][number]>(`${key}/assets`, {
        method: "POST",
        body,
        ...clientHeaders(),
      })
      // A completude muda com o logo, então o documento inteiro volta.
      await mutate(key, apiGet<BrandCore>(key), { revalidate: false })
      return asset
    },
    [key, mutate]
  )

  const deleteAsset = useCallback(
    async (id: string) => {
      await mutate(
        key,
        (current?: BrandCore) =>
          current && { ...current, assets: current.assets.filter((asset) => asset.id !== id) },
        { revalidate: false }
      )
      try {
        await apiDelete(`${key}/assets/${id}`, clientHeaders())
      } finally {
        await mutate(key)
      }
    },
    [key, mutate]
  )

  const reload = useCallback(() => mutate(isBrandKey(brandId)), [brandId, mutate])

  return { saveSection, saveProgress, publish, uploadAsset, deleteAsset, reload }
}
