import { useCallback, useState } from "react"

const WIDTH_STEP = 8

/**
 * A largura de um elemento, em degraus: o suficiente para decidir folgas e rótulos sem redesenhar a cada pixel de um
 * redimensionamento. Mede ao ligar, antes de pintar, para o primeiro desenho já sair certo.
 */
export function useSteppedWidth(active = true) {
  const [width, setWidth] = useState(0)

  const ref = useCallback(
    (node: HTMLElement | null) => {
      if (!node || !active) return
      const measure = () => setWidth(Math.round(node.clientWidth / WIDTH_STEP) * WIDTH_STEP)
      measure()
      const observer = new ResizeObserver(measure)
      observer.observe(node)
      return () => observer.disconnect()
    },
    [active]
  )

  return { ref, width }
}
