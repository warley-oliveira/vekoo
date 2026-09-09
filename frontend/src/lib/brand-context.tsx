import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react"
import { useParams } from "react-router"

import { useBrands } from "@/hooks/use-brands"
import type { BrandSummary } from "@/lib/brand-core"

// A marca ativa é o contexto raiz de tudo que está sob `/brands/:brandId`.
// A URL manda (link compartilhado abre na marca certa); o localStorage só
// lembra a última usada para a raiz `/` saber para onde ir.

const ACTIVE_BRAND_KEY = "vekoo.brand.active"

export function readActiveBrandId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_BRAND_KEY)
  } catch {
    return null
  }
}

export function rememberActiveBrand(id: string): void {
  try {
    localStorage.setItem(ACTIVE_BRAND_KEY, id)
  } catch {
    /* armazenamento indisponível: a URL continua mandando */
  }
}

export function brandPath(brandId: string, sub = ""): string {
  return `/brands/${brandId}${sub}`
}

type BrandContextValue = {
  brandId: string
  /** O resumo da marca ativa (da lista). `undefined` enquanto a lista carrega. */
  brand: BrandSummary | undefined
  brands: BrandSummary[] | undefined
  /** `path("/contents")` → `/brands/<ativa>/contents`. */
  path: (sub?: string) => string
}

const BrandContext = createContext<BrandContextValue | null>(null)

export function BrandProvider({ brandId, children }: { brandId: string; children: ReactNode }) {
  const { brands } = useBrands()

  useEffect(() => rememberActiveBrand(brandId), [brandId])

  const value = useMemo<BrandContextValue>(
    () => ({
      brandId,
      brand: brands?.find((b) => b.id === brandId),
      brands,
      path: (sub = "") => brandPath(brandId, sub),
    }),
    [brandId, brands]
  )

  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>
}

export function useActiveBrand(): BrandContextValue {
  const ctx = useContext(BrandContext)
  if (!ctx) throw new Error("useActiveBrand precisa estar dentro de /brands/:brandId")
  return ctx
}

/** O id da marca da URL, para quem pode estar fora do provider (o editor). */
export function useBrandIdFromRoute(): string | undefined {
  return useParams().brandId
}
