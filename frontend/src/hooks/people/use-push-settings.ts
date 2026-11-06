import { useCallback, useEffect, useState, useSyncExternalStore } from "react"

import { useApi, useOptionalApi } from "@/hooks/use-api"
import { useNotificationPermission } from "@/hooks/use-notification-permission"
import { usePushNotifications } from "@/hooks/use-push-notifications"
import { apiDelete } from "@/lib/api"
import type { PushDevice } from "@/lib/people/types"
import {
  VAPID_KEY_PATH,
  hasServiceWorker,
  isDeviceSubscribed,
  pushPermission,
} from "@/lib/push"

const NO_KEY: { publicKey?: string | null } = {}
const DEVICES_KEY = "/push-devices?perPage=50"

/**
 * A permissão muda fora da página, nas configurações do navegador. Lida a cada render e
 * de novo quando a pessoa volta para a aba: é assim que quem desbloqueou vê a tela mudar.
 */
function subscribeToPermission(notify: () => void) {
  window.addEventListener("focus", notify)
  document.addEventListener("visibilitychange", notify)
  let status: PermissionStatus | null = null
  let released = false
  navigator.permissions
    ?.query({ name: "notifications" })
    .then((result) => {
      if (released) return
      status = result
      status.addEventListener("change", notify)
    })
    .catch(() => {
      /* sem esta API, ficam o foco e a visibilidade */
    })

  return () => {
    released = true
    window.removeEventListener("focus", notify)
    document.removeEventListener("visibilitychange", notify)
    status?.removeEventListener("change", notify)
  }
}

async function currentEndpoint(): Promise<string | null> {
  if (!("serviceWorker" in navigator)) return null
  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = await registration?.pushManager?.getSubscription()
  return subscription?.endpoint ?? null
}

/** Tudo o que a tela de preferências precisa saber deste aparelho e dos outros da pessoa. */
export function usePushSettings() {
  const push = usePushNotifications()
  const { requestPermission } = useNotificationPermission()
  const permission = useSyncExternalStore(subscribeToPermission, pushPermission)

  const vapid = useOptionalApi(push.isSupported ? VAPID_KEY_PATH : null, NO_KEY, {
    revalidateOnFocus: false,
  })
  const devices = useApi<{ pushDevices: PushDevice[] }>(DEVICES_KEY)

  const [checkedDevice, setCheckedDevice] = useState(false)
  const [endpoint, setEndpoint] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void Promise.all([hasServiceWorker(), isDeviceSubscribed(), currentEndpoint()])
      .then(([, , current]) => {
        if (!cancelled) setEndpoint(current)
      })
      .finally(() => {
        if (!cancelled) setCheckedDevice(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const reloadDevices = devices.mutate
  const refreshDevice = useCallback(async () => {
    setEndpoint(await currentEndpoint().catch(() => null))
    await reloadDevices()
  }, [reloadDevices])

  const pushSubscribe = push.subscribe
  const subscribe = useCallback(async () => {
    const done = await pushSubscribe()
    if (done) await refreshDevice()
    return done
  }, [pushSubscribe, refreshDevice])

  const pushUnsubscribe = push.unsubscribe
  const unsubscribe = useCallback(async () => {
    const done = await pushUnsubscribe()
    if (done) await refreshDevice()
    return done
  }, [pushUnsubscribe, refreshDevice])

  const removeDevice = useCallback(
    async (device: PushDevice) => {
      // Este aparelho sai pelo caminho completo: a inscrição do navegador também precisa cair.
      if (device.endpoint === endpoint) {
        await pushUnsubscribe()
        await refreshDevice()
      } else {
        await apiDelete(`/push-devices/${device.id}`)
        await reloadDevices()
      }
    },
    [endpoint, pushUnsubscribe, refreshDevice, reloadDevices]
  )

  return {
    ...push,
    permission,
    /** Só para "já liberei": com a resposta dada, o navegador não pergunta de novo. */
    recheckPermission: requestPermission,
    subscribe,
    unsubscribe,
    isChecking: push.isSupported && (vapid.isLoading || !checkedDevice),
    keyError: vapid.error as unknown,
    reloadKey: () => vapid.mutate(),
    endpoint,
    devices: devices.data?.pushDevices,
    devicesLoading: devices.isLoading,
    devicesError: devices.error as unknown,
    reloadDevices: () => devices.mutate(),
    removeDevice,
  }
}
