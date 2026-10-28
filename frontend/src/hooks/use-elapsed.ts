import { useEffect, useState } from "react"

/**
 * Segundos desde `since`, contando de um em um enquanto `running`. Quando para,
 * fica no número final — o "levou 11s" de um passo que terminou.
 */
export function useElapsed(since: number | null | undefined, running: boolean, until?: number | null): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!running) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [running])

  if (!since) return 0
  const end = running ? now : (until ?? now)
  return Math.max(0, Math.round((end - since) / 1000))
}
