import { useEffect } from "react"

import type { BrandAsset, BrandFont } from "@/lib/brand-core"
import { ensureCatalogFont, ensureFileFont, findCatalogFont, fontStack } from "@/lib/font-catalog"

/** Carrega a fonte do preview (catálogo ou arquivo) quando ela muda e devolve o `font-family`. */
export function useBrandFont(font: BrandFont, assets: BrandAsset[]): string {
  const asset = font.source === "file" ? assets.find((a) => a.id === font.assetId) : undefined

  useEffect(() => {
    if (!font.family) return
    if (font.source === "catalog") ensureCatalogFont(font.family)
    if (font.source === "file" && asset) ensureFileFont(font.family, asset.url)
  }, [font.family, font.source, asset])

  return fontStack(font.family, findCatalogFont(font.family)?.category)
}
