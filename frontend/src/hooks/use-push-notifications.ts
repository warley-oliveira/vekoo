import { useCallback, useEffect, useState } from "react"

import { useOptionalApi } from "@/hooks/use-api"
import { useAuth } from "@/lib/auth"
import {
  PushError,
  VAPID_KEY_PATH,
  hasServiceWorker,
  isDeviceSubscribed,
  isPushSupported,
  pushPermission,
  relinkDevice,
  sendTestPush,
  subscribeDevice,
  unsubscribeDevice,
  type PushFailure,
  type PushPermission,
} from "@/lib/push"

const NO_KEY: { publicKey?: string | null } = {}

function failureOf(error: unknown): PushFailure {
  return error instanceof PushError ? error.code : "failed"
}

/**
 * Push deste aparelho, para tela. Nunca pede permissão sozinho: `subscribe()` é para
 * ser chamado por um gesto da pessoa, num momento em que o pedido faz sentido.
 *
 * `isAvailable` diz se dá para oferecer a opção agora: navegador com suporte, service
 * worker registrado e servidor com chaves VAPID (sem elas, `publicKey` vem nulo e a
 * opção fica escondida).
 */
export function usePushNotifications() {
  const isSupported = isPushSupported()
  const [permission, setPermission] = useState<PushPermission>(pushPermission)
  const [hasWorker, setHasWorker] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<PushFailure | null>(null)

  const { data: vapid } = useOptionalApi(
    isSupported ? VAPID_KEY_PATH : null,
    NO_KEY,
    { revalidateOnFocus: false }
  )

  useEffect(() => {
    let cancelled = false
    void Promise.all([hasServiceWorker(), isDeviceSubscribed()]).then(
      ([worker, subscribed]) => {
        if (cancelled) return
        setHasWorker(worker)
        setIsSubscribed(subscribed)
      }
    )
    return () => {
      cancelled = true
    }
  }, [])

  const subscribe = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      await subscribeDevice()
      setIsSubscribed(true)
      return true
    } catch (caught) {
      setError(failureOf(caught))
      return false
    } finally {
      setPermission(pushPermission())
      setIsLoading(false)
    }
  }, [])

  const unsubscribe = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      await unsubscribeDevice()
      setIsSubscribed(false)
      return true
    } catch (caught) {
      setError(failureOf(caught))
      return false
    } finally {
      setIsLoading(false)
    }
  }, [])

  return {
    isSupported,
    isAvailable: isSupported && hasWorker && Boolean(vapid?.publicKey),
    permission,
    isSubscribed,
    isLoading,
    error,
    subscribe,
    unsubscribe,
    /** Lança `ApiError` (`noPushDevices`, `pushNotConfigured`): quem chama trata. */
    sendTest: sendTestPush,
  }
}

/**
 * Vincula o aparelho à conta de quem entrou, se a permissão já tinha sido dada. Montado
 * uma vez, na casca. Falhar aqui é silencioso: push é um extra, não pode atrapalhar.
 */
export function usePushSessionSync() {
  const { session } = useAuth()
  const accountId = session?.account.id

  useEffect(() => {
    if (!accountId) return
    relinkDevice().catch(() => {
      /* sem push até a próxima sessão */
    })
  }, [accountId])
}
