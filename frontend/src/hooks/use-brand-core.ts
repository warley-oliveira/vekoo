import { useCallback } from "react"
import { useSWRConfig } from "swr"

import { useApi } from "@/hooks/use-api"
import { BRANDS_KEY } from "@/hooks/use-brands"
import { apiDelete, apiDownload, apiFetch, apiGet, apiPatch, apiPost } from "@/lib/api"
import type {
  BrandAssetKind,
  BrandCore,
  BrandDocument,
  BrandSection,
  BrandStep,
  BrandVersion,
  LogoDownload,
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

  /**
   * "restaurar": o documento de uma versão antiga volta para o rascunho. Não
   * publica — o motor segue na versão atual até alguém publicar.
   */
  const restoreVersion = useCallback(
    async (versionId: string): Promise<BrandCore> => {
      const restored = await apiPost<BrandCore>(`${key}/versions/${versionId}/restore`, undefined, clientHeaders())
      await store(restored)
      return restored
    },
    [key, store]
  )

  /**
   * Torna uma logo a principal. É uma mudança do **rascunho** (seção
   * `assets`): o motor só a usa depois de publicar.
   */
  const chooseLogo = useCallback(
    async (logoId: string): Promise<BrandCore> => {
      const saved = await apiPatch<BrandCore>(
        key,
        { brand: { document: { assets: { primaryLogoId: logoId } } } },
        clientHeaders()
      )
      await store(saved)
      return saved
    },
    [key, store]
  )

  /** "regenerar": três logotipos novos, sem apagar nem trocar a principal. */
  const generateLogos = useCallback(async (): Promise<string[]> => {
    const { logoIds, brandCore } = await apiPost<{ logoIds: string[]; brandCore: BrandCore }>(
      `${key}/logos/generate`,
      undefined,
      clientHeaders()
    )
    await store(brandCore)
    return logoIds
  }, [key, store])

  const downloadLogo = useCallback(
    (logoId: string, option: LogoDownload, fallbackName: string) => {
      const query = new URLSearchParams({ variant: option.variant, format: option.format })
      if (option.size) query.set("size", String(option.size))
      return apiDownload(`${key}/logos/${logoId}/download?${query}`, fallbackName)
    },
    [key]
  )

  /**
   * Logo: `logoId` junta a variante a uma logo enviada que já existe;
   * `primary` a torna a principal no rascunho.
   */
  const uploadAsset = useCallback(
    async (
      kind: BrandAssetKind,
      variant: string | null,
      file: File,
      options: { logoId?: string; primary?: boolean } = {}
    ) => {
      const body = new FormData()
      body.append("file", file)
      body.append("kind", kind)
      if (variant) body.append("variant", variant)
      if (options.logoId) body.append("logoId", options.logoId)
      if (options.primary) body.append("primary", "true")
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

  return {
    saveSection,
    saveProgress,
    publish,
    restoreVersion,
    chooseLogo,
    generateLogos,
    downloadLogo,
    uploadAsset,
    deleteAsset,
    reload,
  }
}
