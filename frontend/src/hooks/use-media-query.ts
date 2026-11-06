import { useCallback, useSyncExternalStore } from "react"

/** Reage a uma media query. Lê no primeiro render, sem piscar o layout errado. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (listener: () => void) => {
      const media = window.matchMedia(query)
      media.addEventListener("change", listener)
      return () => media.removeEventListener("change", listener)
    },
    [query]
  )

  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches)
}

/**
 * Dedo, não mouse. Separado do `useIsMobile` de propósito: *layout* decide pela
 * largura, *interação* (hover, área de toque, Enter) decide por isto. Um iPad Pro
 * tem tela larga e toque; uma janela estreita no desktop tem mouse.
 */
export function useIsTouch(): boolean {
  return useMediaQuery("(hover: none) and (pointer: coarse)")
}
