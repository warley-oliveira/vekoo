import { useEffect, useRef } from "react"

import { pushLayer } from "@/lib/back-stack"

/** Enquanto `active`, o voltar do aparelho fecha isto antes de sair da tela. Ver `back-stack.ts`. */
export function useBackLayer(active: boolean, close: () => boolean | void): void {
  const latest = useRef(close)
  useEffect(() => {
    latest.current = close
  })

  useEffect(() => {
    if (!active) return
    return pushLayer(() => latest.current())
  }, [active])
}
