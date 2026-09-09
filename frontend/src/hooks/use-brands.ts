import { useCallback } from "react"
import { useSWRConfig } from "swr"

import { useApi } from "@/hooks/use-api"
import { apiPost } from "@/lib/api"
import type { BrandCore, BrandSummary } from "@/lib/brand-core"

export const BRANDS_KEY = "/brands"

/** As marcas da organização, em resumo — é o que o seletor lista. */
export function useBrands() {
  const { data, error, isLoading, mutate } = useApi<{ brands: BrandSummary[] }>(BRANDS_KEY)
  return { brands: data?.brands, isLoading: isLoading && !data, error, reload: () => mutate() }
}

export function useBrandMutations() {
  const { mutate } = useSWRConfig()

  /** Abre uma marca nova em rascunho; quem chama leva a pessoa ao formulário dela. */
  const createBrand = useCallback(
    async (name?: string): Promise<BrandCore> => {
      const brand = await apiPost<BrandCore>(BRANDS_KEY, { brand: { name } })
      await mutate(BRANDS_KEY)
      return brand
    },
    [mutate]
  )

  return { createBrand, reloadBrands: () => mutate(BRANDS_KEY) }
}
