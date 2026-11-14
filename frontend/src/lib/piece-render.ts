import { useEffect, useState } from "react"

import { ensureCatalogFont, ensureFileFont } from "@/lib/font-catalog"
import type { BoxSpec } from "@/lib/piece-geometry"
import type { ColorToken, LayoutContract, PieceDocument, StyleRole } from "@/lib/piece-document"

// O que um renderizador recebe para desenhar uma versão — o mesmo payload no
// preview (com a sessão) e no export pelo Chromium (com o token). Espelho de
// `PieceRenderers.payload` e `PieceDocument::Theme`.

export type RoleTheme = {
  font: "display" | "utility"
  family: string
  weight: number
  transform: "none" | "uppercase"
  lineHeight: number
  /** Em em. */
  tracking: number
}

export type LogoTheme = { assetId: string; url: string; width: number | null; height: number | null } | null

export type RenderTheme = {
  brandCoreVersion: number
  colors: Record<ColorToken, string>
  /** A tinta legível sobre cada token. */
  ink: Record<ColorToken, string>
  /** O rótulo: acento quando contrasta com o fundo, senão a tinta. */
  accentInk: Record<ColorToken, string>
  accent: string
  imageInk: string
  roles: Record<StyleRole, RoleTheme>
  fonts: Array<{ role: string; family: string; source: string; url: string | null; weights: number[] }>
  logo: { light: LogoTheme; dark: LogoTheme }
}

export type RenderAsset = { url: string; width: number | null; height: number | null }

export type GeometryLayer = {
  kind: "fill" | "image" | "scrim" | "logo" | "stack" | "quote_mark" | "swipe_hint" | "slide_number"
  box: BoxSpec
  slot?: string
  optional?: boolean
  when?: "image"
  from?: "top" | "bottom"
  opacity?: number
  /** O expoente do degradê do `scrim` (padrão 1,4; menor escurece mais cedo). */
  curve?: number
  height?: number
  size?: number
  text?: string
  anchor?: "top" | "bottom" | "center"
  inset?: number | number[]
  gap?: number
  ink?: "image" | "background" | "auto"
  items?: Array<{ slot: string; size: number; gap?: number }>
}

export type RenderLayout = LayoutContract & { geometry: Record<string, GeometryLayer[]> }

export type RenderPayload = {
  pieceId: string
  versionId: string
  document: PieceDocument
  theme: RenderTheme
  assets: Record<string, RenderAsset>
  layouts: RenderLayout[]
}

/**
 * Carrega as fontes da marca e diz quando estão prontas. Nada se desenha
 * antes: um preview com a fonte de reserva mostraria uma peça que não existe.
 */
export function useRenderFonts(theme: RenderTheme | undefined): boolean {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!theme) return
    let alive = true
    const faces = Object.values(theme.roles)
    for (const font of theme.fonts) {
      if (font.url) ensureFileFont(font.family, font.url)
      else ensureCatalogFont(font.family, font.weights)
    }
    // `document.fonts.load` devolve vazio enquanto o CSS do Google Fonts
    // não chegou: tenta de novo até achar a face (ou desistir em 6 s e
    // desenhar com o que houver — o export avisa pela fonte, não trava).
    void Promise.all(faces.map((role) => loadFace(role.family, role.weight)))
      .then(() => document.fonts.ready)
      .then(() => alive && setReady(true))
    return () => {
      alive = false
    }
  }, [theme])

  return ready
}

async function loadFace(family: string, weight: number): Promise<void> {
  const deadline = Date.now() + 6_000
  while (Date.now() < deadline) {
    const faces = await document.fonts.load(`${weight} 40px "${family}"`).catch(() => [])
    if (faces.length > 0) return
    await new Promise((resolve) => window.setTimeout(resolve, 100))
  }
}
