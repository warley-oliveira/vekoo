import { useEffect, useLayoutEffect, useRef } from "react"

/**
 * Evento perdido não volta: quem reconecta relê. A primeira conexão não conta, porque a tela acabou
 * de ler o que precisava.
 */
export function useOnReconnect(connected: boolean, onReconnect: () => void) {
  const handler = useRef(onReconnect)
  useLayoutEffect(() => {
    handler.current = onReconnect
  })

  const wasConnected = useRef(false)
  const dropped = useRef(false)

  useEffect(() => {
    if (!connected) {
      if (wasConnected.current) dropped.current = true
      return
    }

    wasConnected.current = true
    if (dropped.current) {
      dropped.current = false
      handler.current()
    }
  }, [connected])
}
