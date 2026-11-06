import { useEffect, useState } from "react"

export type UseScrollDirectionOptions = {
  /** Área que rola. Na casca é o `<main>`, não a janela. */
  element: HTMLElement | null
  /** Movimento menor que isso é ignorado (elástico, deriva de subpixel). */
  threshold?: number
  /** Dentro desta distância do topo, conta sempre como "subindo". */
  topOffset?: number
  enabled?: boolean
}

/**
 * Diz se a pessoa está rolando para baixo. Um quadro por vez e `setState` só na
 * transição: custa umas duas renders por sessão de rolagem, não uma por quadro.
 */
export function useScrollDirection({
  element,
  threshold = 8,
  topOffset = 32,
  enabled = true,
}: UseScrollDirectionOptions): boolean {
  const [isScrollingDown, setIsScrollingDown] = useState(false)

  useEffect(() => {
    if (!enabled || !element) {
      setIsScrollingDown(false)
      return
    }

    let frame = 0
    let lastY = element.scrollTop
    let lastValue = false

    const measure = () => {
      frame = 0
      const currentY = element.scrollTop
      const delta = currentY - lastY

      if (Math.abs(delta) < threshold) return
      lastY = currentY

      const next = currentY > topOffset && delta > 0
      if (next === lastValue) return

      lastValue = next
      setIsScrollingDown(next)
    }

    const handleScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(measure)
    }

    element.addEventListener("scroll", handleScroll, { passive: true })

    return () => {
      element.removeEventListener("scroll", handleScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [element, threshold, topOffset, enabled])

  return isScrollingDown
}
