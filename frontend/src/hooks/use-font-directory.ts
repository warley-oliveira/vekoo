import { useEffect, useState } from "react"

import { loadFontDirectory, type CatalogFont } from "@/lib/font-catalog"

/**
 * O índice inteiro do Google Fonts, só quando `enabled` (o seletor abriu,
 * a marca usa uma fonte fora da vitrine). Baixa uma vez por sessão.
 */
export function useFontDirectory(enabled: boolean) {
  const [fonts, setFonts] = useState<readonly CatalogFont[]>()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!enabled || fonts) return
    let alive = true
    loadFontDirectory()
      .then((loaded) => alive && setFonts(loaded))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [enabled, fonts])

  return { fonts, failed }
}
