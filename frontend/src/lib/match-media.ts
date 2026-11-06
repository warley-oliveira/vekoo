import { useCallback, useSyncExternalStore } from "react"

/**
 * Lê uma media query sem passar por `useEffect`: a primeira render já vem certa, e o
 * shell do desktop não pisca antes do shell do celular. Sem SSR, de propósito.
 */
export function useMatchMedia(query: string): boolean {
  const subscribe = useCallback(
    (notify: () => void) => {
      const list = window.matchMedia(query)
      list.addEventListener("change", notify)
      return () => list.removeEventListener("change", notify)
    },
    [query]
  )
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches)
}
