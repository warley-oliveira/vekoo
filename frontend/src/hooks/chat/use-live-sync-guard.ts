import { useEffect, useRef } from "react"

export type LiveSyncGuardOptions = {
  enabled?: boolean
  /** Intervalo da reconciliação, em ms. Para com a aba oculta. */
  pollMs?: number
}

/**
 * Garante o sincronismo quando o WebSocket fica meio morto (Wi-Fi oscilando, notebook que
 * dormiu, aba em segundo plano): o ActionCable nem sempre percebe, e não reenvia o que se
 * perdeu. Chama uma função idempotente por sinais que não dependem do socket: voltar para a
 * aba, voltar a rede, focar a janela e um relógio de baixa frequência, parado com a aba oculta.
 */
export function useLiveSyncGuard(
  resync: () => void,
  { enabled = true, pollMs = 60_000 }: LiveSyncGuardOptions = {}
): void {
  const resyncRef = useRef(resync)
  useEffect(() => {
    resyncRef.current = resync
  })

  useEffect(() => {
    if (!enabled) return

    let interval: ReturnType<typeof setInterval> | null = null
    const isVisible = () => document.visibilityState === "visible"

    const start = () => {
      if (interval === null) {
        interval = setInterval(() => {
          if (isVisible()) resyncRef.current()
        }, pollMs)
      }
    }
    const stop = () => {
      if (interval !== null) clearInterval(interval)
      interval = null
    }

    const onVisibility = () => {
      if (isVisible()) {
        resyncRef.current()
        start()
      } else {
        stop()
      }
    }
    const onResume = () => {
      if (isVisible()) resyncRef.current()
    }

    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("online", onResume)
    window.addEventListener("focus", onResume)
    if (isVisible()) start()

    return () => {
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("online", onResume)
      window.removeEventListener("focus", onResume)
      stop()
    }
  }, [enabled, pollMs])
}
