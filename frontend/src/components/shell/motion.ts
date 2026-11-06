import { useEffect, useState } from "react"
import type { Transition } from "motion/react"

/** Cabeçalho e barra inferior saem e voltam com a mesma mola: um movimento só. */
export const CHROME_SPRING: Transition = {
  type: "spring",
  duration: 0.28,
  bounce: 0.05,
}

/** A pílula da aba ativa, deslizando de uma aba para a outra. */
export const INDICATOR_SPRING: Transition = {
  type: "spring",
  duration: 0.24,
  bounce: 0.05,
}

/**
 * `visibility: hidden` só depois da animação de sair, nunca durante. É o que tira a
 * barra da ordem de tabulação e da árvore de acessibilidade, em vez de deixar um
 * elemento invisível focável. Com movimento reduzido não há fim de animação confiável,
 * então acompanha o alvo direto.
 */
export function useOffscreenAfterExit(hidden: boolean, reducedMotion: boolean | null) {
  const [offscreen, setOffscreen] = useState(hidden)

  useEffect(() => {
    if (reducedMotion) setOffscreen(hidden)
  }, [hidden, reducedMotion])

  return {
    offscreen,
    onAnimationStart: () => setOffscreen(false),
    onAnimationComplete: () => setOffscreen(hidden),
  }
}
