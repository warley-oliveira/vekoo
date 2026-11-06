import { useCallback, useRef } from "react"

import { useIsTouch } from "@/hooks/use-media-query"

/**
 * Foco inicial de painéis e Sheets. Com dedo, focar o primeiro campo sobe o teclado
 * virtual e faz a tela pular antes de a pessoa decidir o que quer, então o foco fica no
 * próprio painel, a não ser que a tela tenha pedido `autoFocus` em um campo. Com teclado
 * e mouse vale o padrão: o primeiro controle.
 */
export function useSheetFocus() {
  const isTouch = useIsTouch()
  const popupRef = useRef<HTMLDivElement>(null)

  const initialFocus = useCallback(() => {
    if (!isTouch) return true

    const popup = popupRef.current
    const active = document.activeElement
    return popup?.contains(active) ? (active as HTMLElement) : popup
  }, [isTouch])

  return { popupRef, initialFocus }
}
