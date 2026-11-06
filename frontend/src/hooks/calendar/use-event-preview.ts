import { useCallback, useEffect, useRef, useState } from "react"

import type { CalendarEvent } from "@/lib/calendar/types"

const OPEN_DELAY = 400
const LEAVE_DELAY = 500
const POPUP_LEAVE_DELAY = 300

/**
 * Espiar um evento sem abrir nada. Só com mouse: com o dedo, tocar já abre o painel. Dá tempo de
 * levar o ponteiro até a prévia, que fica aberta enquanto ele estiver sobre ela.
 */
export function useEventPreview() {
  const [preview, setPreview] = useState<{ id: string; element: HTMLElement } | null>(null)
  const openTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const onPopup = useRef(false)

  const clearTimers = () => {
    clearTimeout(openTimer.current)
    clearTimeout(closeTimer.current)
  }
  useEffect(() => clearTimers, [])

  const hover = useCallback((event: CalendarEvent | null, element: HTMLElement | null) => {
    if (event && element) {
      clearTimers()
      openTimer.current = setTimeout(() => setPreview({ id: event.id, element }), OPEN_DELAY)
      return
    }
    clearTimeout(openTimer.current)
    clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => {
      if (!onPopup.current) setPreview(null)
    }, LEAVE_DELAY)
  }, [])

  const close = useCallback(() => {
    clearTimers()
    onPopup.current = false
    setPreview(null)
  }, [])

  const popupHandlers = {
    onMouseEnter: () => {
      onPopup.current = true
      clearTimeout(closeTimer.current)
    },
    onMouseLeave: () => {
      onPopup.current = false
      closeTimer.current = setTimeout(() => setPreview(null), POPUP_LEAVE_DELAY)
    },
  }

  return { preview, hover, close, popupHandlers }
}
