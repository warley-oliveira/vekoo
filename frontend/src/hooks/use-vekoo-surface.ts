import { useLayoutEffect } from "react"

/**
 * Veste a página com a paleta do site (`.surface-vekoo` no `<html>`) enquanto
 * a tela está montada. No `<html>`, e não num `div`, porque menu, diálogo e
 * popover abrem em portal fora da árvore — e precisam da mesma paleta. O
 * `useLayoutEffect` troca antes da pintura: não pisca o tema antigo.
 */
export function useVekooSurface() {
  useLayoutEffect(() => {
    const root = document.documentElement
    root.classList.add("surface-vekoo")
    return () => root.classList.remove("surface-vekoo")
  }, [])
}
