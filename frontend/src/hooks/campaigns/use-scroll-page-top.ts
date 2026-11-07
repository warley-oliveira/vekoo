import { useCallback } from "react"
import { useReducedMotion } from "motion/react"

import { useShell } from "@/components/app-shell"

/** Trocar de página leva ao começo da lista: sem isto, a página nova abriria já lá embaixo. */
export function useScrollPageTop() {
  const { scroller } = useShell()
  const reducedMotion = useReducedMotion()

  return useCallback(() => {
    scroller?.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" })
  }, [reducedMotion, scroller])
}
