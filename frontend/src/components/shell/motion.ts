import { useEffect, useState } from "react"

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
