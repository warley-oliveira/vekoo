import { useCallback, useState } from "react"

/** O estado da permissão de notificação do navegador, sem envolver push. */
export function useNotificationPermission() {
  const isSupported = typeof window !== "undefined" && "Notification" in window
  const [permission, setPermission] = useState<NotificationPermission>(() =>
    isSupported ? Notification.permission : "default"
  )
  const [isLoading, setIsLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  /** Abre o pedido do navegador. Só a partir de um gesto, nunca ao carregar a tela. */
  const requestPermission = useCallback(async () => {
    if (!isSupported) return "denied" as const

    setIsLoading(true)
    setFailed(false)
    try {
      const answer = await Notification.requestPermission()
      setPermission(answer)
      return answer
    } catch {
      setFailed(true)
      return "default" as const
    } finally {
      setIsLoading(false)
    }
  }, [isSupported])

  return {
    isSupported,
    permission,
    isLoading,
    failed,
    requestPermission,
    isGranted: permission === "granted",
    isDenied: permission === "denied",
    isDefault: permission === "default",
  }
}
