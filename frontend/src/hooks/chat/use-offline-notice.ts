import { useEffect, useState } from "react"

/** Só avisa depois desse tempo: uma reconexão rápida não merece aparecer. */
const OFFLINE_NOTICE_DELAY_MS = 4_000

export function useOfflineNotice(connected: boolean): boolean {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (connected) {
      setShow(false)
      return
    }
    const timer = setTimeout(() => setShow(true), OFFLINE_NOTICE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [connected])

  return show
}
