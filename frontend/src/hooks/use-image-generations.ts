import { useCallback } from "react"
import { useSWRConfig } from "swr"

import { useApi } from "@/hooks/use-api"
import { brandKey } from "@/hooks/use-brand-core"
import { useCreditMutations } from "@/hooks/use-credits"
import { apiPost } from "@/lib/api"
import { isPending, type ImageGeneration, type ImageGenerationList, type ImageRequest } from "@/lib/images"

export function imageGenerationsKey(brandId: string, origin?: string): string {
  return `/brands/${brandId}/image-generations${origin ? `?origin=${origin}` : ""}`
}

/** Enquanto alguma geração roda, a lista se confere sozinha. */
const POLL_MS = 2_500

export function useImageGenerations(brandId: string, origin?: "studio" | "editor") {
  const { data, error, isLoading, mutate } = useApi<ImageGenerationList>(imageGenerationsKey(brandId, origin), {
    refreshInterval: (latest) => (latest?.generations.some(isPending) ? POLL_MS : 0),
  })
  return { list: data, isLoading: isLoading && !data, error, reload: () => mutate() }
}

export function useImageGenerationMutations(brandId: string) {
  const { mutate } = useSWRConfig()
  const { refresh } = useCreditMutations()

  const generate = useCallback(
    async (request: ImageRequest): Promise<ImageGeneration> => {
      const generation = await apiPost<ImageGeneration>(`/brands/${brandId}/image-generations`, { generation: request })
      // A nova entra no topo na hora; o saldo é o do servidor.
      await mutate((key) => typeof key === "string" && key.startsWith(`/brands/${brandId}/image-generations`))
      await refresh()
      return generation
    },
    [brandId, mutate, refresh]
  )

  /** Quando uma geração termina, a marca (os ativos) e o saldo acompanham. */
  const settle = useCallback(async () => {
    await mutate(brandKey(brandId))
    await refresh()
  }, [brandId, mutate, refresh])

  return { generate, settle }
}
