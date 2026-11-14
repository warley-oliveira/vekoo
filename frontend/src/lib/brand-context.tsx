/* eslint-disable react/only-export-components */
import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react"

import { useBrands } from "@/hooks/use-brands"
import { currentAccountHashid } from "@/lib/account-scope"
import type { BrandSummary } from "@/lib/brand-core"
import { matchPath, useLocation, useParams } from "@/lib/router"

// A marca ativa é o contexto raiz de tudo que está sob `/brands/:brandId` (dentro de
// `/a/<hashid>`). A URL manda (link compartilhado abre na marca certa); o localStorage só
// lembra a última usada **em cada organização**, para o menu de Criação e os caminhos antigos
// (`/carousels`, `/trash`…) saberem para onde ir.

const ACTIVE_BRAND_KEY = "vekoo.brand.active"

function storageKey(): string {
  const hashid = currentAccountHashid()
  return hashid ? `${ACTIVE_BRAND_KEY}.${hashid}` : ACTIVE_BRAND_KEY
}

export function readActiveBrandId(): string | null {
  try {
    return localStorage.getItem(storageKey())
  } catch {
    return null
  }
}

export function rememberActiveBrand(id: string): void {
  try {
    localStorage.setItem(storageKey(), id)
  } catch {
    /* armazenamento indisponível: a URL continua mandando */
  }
}

/** A marca lembrada sumiu (apagada, ou de outra organização): a próxima escolha é do `BrandGate`. */
export function forgetActiveBrand(id: string): void {
  try {
    if (localStorage.getItem(storageKey()) === id) localStorage.removeItem(storageKey())
  } catch {
    /* nada a esquecer */
  }
}

export function brandPath(brandId: string, sub = ""): string {
  return `/brands/${brandId}${sub}`
}

/**
 * Um caminho de Criação na marca ativa, para quem não sabe qual é: `BrandGate` escolhe a marca
 * e leva a `sub` dentro dela (`/brands?to=/contents`).
 */
export function activeBrandHref(sub = ""): string {
  return sub ? `/brands?to=${encodeURIComponent(sub)}` : "/brands"
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

/**
 * A marca de agora para quem vive fora de `/brands/:brandId` (a casca: menu, busca, "criar
 * carrossel"): a da URL quando a tela é de uma marca, senão a última usada nesta organização.
 * `null` quando ainda não houve nenhuma — aí o caminho certo é `activeBrandHref`.
 */
export function useCurrentBrandId(): string | null {
  const ctx = useContext(BrandContext)
  const { pathname } = useLocation()
  const fromUrl = matchPath({ path: "/brands/:brandId", end: false }, pathname)?.params.brandId
  return ctx?.brandId ?? fromUrl ?? readActiveBrandId()
}
