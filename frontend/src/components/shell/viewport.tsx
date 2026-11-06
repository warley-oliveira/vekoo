import { useEffect } from "react"

import { useMobileShell } from "@/hooks/use-mobile-shell"
import { useVisualViewport } from "@/hooks/use-visual-viewport"

/**
 * O único escritor das variáveis de viewport em `<html>`: `--app-vh`, `--app-vv-top`,
 * `--kb-inset` e `data-keyboard`. Todo o resto lê do CSS e re-renderiza zero vezes.
 */
export function VisualViewportBridge(): null {
  useVisualViewport({ writeCssVars: true })
  return null
}

/** O que está no `index.html`. `viewport-fit=cover` é o que liga as áreas seguras. */
const BASE_VIEWPORT = "width=device-width, initial-scale=1, viewport-fit=cover"

/**
 * `interactive-widget=resizes-content` faz o Android encolher o viewport de layout ao
 * abrir o teclado, em vez de cobrir a tela. Só na casca móvel; em tempo de execução,
 * para não pesar no resto.
 */
const MOBILE_VIEWPORT = `${BASE_VIEWPORT}, interactive-widget=resizes-content`

export function MobileViewportMeta(): null {
  const { isMobileShell } = useMobileShell()

  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
    if (!meta) return

    meta.setAttribute("content", isMobileShell ? MOBILE_VIEWPORT : BASE_VIEWPORT)
    return () => meta.setAttribute("content", BASE_VIEWPORT)
  }, [isMobileShell])

  return null
}
