import { ApiError, apiFetch, apiGet, apiPost } from "@/lib/api"

// Notificação push deste aparelho, fora do React: `lib/auth.tsx` também precisa, para
// desvincular o aparelho ao sair. Em tela, use `usePushNotifications`.
//
// Módulo sem idioma: as falhas são códigos, e a tela traduz.

const DEVICES_PATH = "/push-devices"
export const VAPID_KEY_PATH = `${DEVICES_PATH}/vapid-public-key`

export type PushFailure = "unsupported" | "denied" | "unavailable" | "failed"

export class PushError extends Error {
  readonly code: PushFailure

  constructor(code: PushFailure) {
    super(code)
    this.name = "PushError"
    this.code = code
  }
}

export type PushPermission = NotificationPermission | "unsupported"

export function isPushSupported(): boolean {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  )
}

export function pushPermission(): PushPermission {
  return isPushSupported() ? Notification.permission : "unsupported"
}

function urlBase64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=")
  const raw = window.atob(padded.replace(/-/g, "+").replace(/_/g, "/"))
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i)
  return bytes
}

function sameKey(current: ArrayBuffer | null, expected: Uint8Array): boolean {
  if (!current || current.byteLength !== expected.byteLength) return false
  const bytes = new Uint8Array(current)
  return bytes.every((byte, index) => byte === expected[index])
}

/** `null`: este servidor não expõe push (rota ausente, ou sem chaves VAPID). */
async function fetchVapidKey(): Promise<string | null> {
  try {
    const { publicKey } = await apiGet<{ publicKey?: string }>(VAPID_KEY_PATH)
    return publicKey ?? null
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

/**
 * Inscreve este aparelho na conta da sessão. Pede a permissão do navegador se ainda
 * não houver resposta: chame a partir de um gesto da pessoa, nunca ao carregar a tela.
 */
export async function subscribeDevice(): Promise<PushSubscription> {
  if (!isPushSupported()) throw new PushError("unsupported")

  const registration = await navigator.serviceWorker.getRegistration()
  if (!registration) throw new PushError("unavailable")

  const permission = await Notification.requestPermission()
  if (permission !== "granted") throw new PushError("denied")

  const key = await fetchVapidKey()
  if (!key) throw new PushError("unavailable")
  const keyBytes = urlBase64ToBytes(key)

  let subscription = await registration.pushManager.getSubscription()
  // Chave trocada no servidor: a inscrição antiga não recebe mais, e assinar por cima
  // dela é erro no navegador.
  if (subscription && !sameKey(subscription.options.applicationServerKey, keyBytes)) {
    await subscription.unsubscribe()
    subscription = null
  }
  subscription ??= await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: keyBytes,
  })

  await apiPost(DEVICES_PATH, { subscription: subscription.toJSON() })
  return subscription
}

/** Desfaz a inscrição do aparelho, aqui e no servidor. */
export async function unsubscribeDevice(): Promise<void> {
  if (!isPushSupported()) return

  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return

  const { endpoint } = subscription
  await subscription.unsubscribe()
  await apiFetch(DEVICES_PATH, {
    method: "DELETE",
    body: JSON.stringify({ endpoint }),
  })
}

/**
 * Quem já permitiu antes volta a receber neste aparelho ao entrar, sem novo pedido: a
 * inscrição é do navegador, mas o vínculo é com a conta da sessão.
 */
export async function relinkDevice(): Promise<void> {
  if (pushPermission() !== "granted") return
  await subscribeDevice()
}

/** O aparelho está inscrito? `false` se não houver service worker registrado. */
export async function isDeviceSubscribed(): Promise<boolean> {
  if (!isPushSupported()) return false
  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  return Boolean(subscription)
}

/** Há service worker para receber push? Em desenvolvimento, normalmente não. */
export async function hasServiceWorker(): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return false
  return Boolean(await navigator.serviceWorker.getRegistration())
}
