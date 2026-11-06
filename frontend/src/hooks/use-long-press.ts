import { useCallback, useEffect, useMemo, useRef } from "react"
import type { MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent } from "react"

export type LongPressEvent = ReactMouseEvent<HTMLElement> | ReactTouchEvent<HTMLElement>

export type UseLongPressOptions = {
  /** Tempo pressionando até disparar, em ms. */
  delay?: number
  /** Movimento, em px, que cancela: quem arrasta está rolando, não pressionando. */
  moveThreshold?: number
}

export type UseLongPressHandlers = {
  onMouseDown: (event: ReactMouseEvent<HTMLElement>) => void
  onMouseMove: (event: ReactMouseEvent<HTMLElement>) => void
  onMouseUp: () => void
  onMouseLeave: () => void
  onTouchStart: (event: ReactTouchEvent<HTMLElement>) => void
  onTouchMove: (event: ReactTouchEvent<HTMLElement>) => void
  onTouchEnd: () => void
  onTouchCancel: () => void
  onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void
}

export type UseLongPressReturn = {
  handlers: UseLongPressHandlers
  /** Se o último gesto disparou; serve para ignorar o clique que vem em seguida. */
  didFire: () => boolean
}

// Depois de um toque o navegador ainda emite mouse sintético, que zeraria o gesto.
const SYNTHETIC_MOUSE_WINDOW = 800

function pointOf(event: LongPressEvent) {
  const touch = "touches" in event ? event.touches[0] : undefined
  if (touch) return { x: touch.clientX, y: touch.clientY }

  const mouse = event as ReactMouseEvent<HTMLElement>
  return { x: mouse.clientX ?? 0, y: mouse.clientY ?? 0 }
}

/**
 * Pressionar e segurar, em toque e mouse (selecionar mensagem à moda do WhatsApp).
 * Espalhe `handlers` no elemento alvo; toques e cliques normais seguem funcionando.
 */
export function useLongPress(
  onLongPress: (event: LongPressEvent) => void,
  { delay = 500, moveThreshold = 10 }: UseLongPressOptions = {}
): UseLongPressReturn {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const fired = useRef(false)
  const lastTouch = useRef(0)

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    start.current = null
  }, [])

  useEffect(() => clear, [clear])

  const begin = useCallback(
    (event: LongPressEvent) => {
      clear()
      start.current = pointOf(event)
      fired.current = false
      timer.current = setTimeout(() => {
        fired.current = true
        onLongPress(event)
      }, delay)
    },
    [clear, delay, onLongPress]
  )

  const move = useCallback(
    (event: LongPressEvent) => {
      if (!start.current) return
      const point = pointOf(event)
      const dx = Math.abs(point.x - start.current.x)
      const dy = Math.abs(point.y - start.current.y)
      if (dx > moveThreshold || dy > moveThreshold) clear()
    },
    [clear, moveThreshold]
  )

  const handlers = useMemo<UseLongPressHandlers>(
    () => ({
      onMouseDown: (event) => {
        if (Date.now() - lastTouch.current > SYNTHETIC_MOUSE_WINDOW) begin(event)
      },
      onMouseMove: move,
      onMouseUp: clear,
      onMouseLeave: clear,
      onTouchStart: (event) => {
        lastTouch.current = Date.now()
        begin(event)
      },
      onTouchMove: move,
      onTouchEnd: () => {
        lastTouch.current = Date.now()
        clear()
      },
      onTouchCancel: clear,
      // No Android, segurar também abre o menu do navegador sobre imagens e links.
      onContextMenu: (event) => {
        if (Date.now() - lastTouch.current < SYNTHETIC_MOUSE_WINDOW || timer.current) {
          event.preventDefault()
        }
      },
    }),
    [begin, clear, move]
  )

  const didFire = useCallback(() => fired.current, [])

  return { handlers, didFire }
}
