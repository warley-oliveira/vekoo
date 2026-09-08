import { createConsumer, type Consumer, type Subscription } from "@rails/actioncable"

import { BASE_URL } from "@/lib/api"
import { getToken } from "@/lib/token"

// O WebSocket do ActionCable, um por aba. O token vai na URL (`?token=`)
// porque o WebSocket não carrega cabeçalho `Authorization` — é a única
// diferença em relação ao `Bearer` do `apiFetch`.

let consumer: Consumer | null = null
let consumerToken: string | null = null

function cableUrl(token: string): string {
  const base = BASE_URL.replace(/^http/, "ws")
  return `${base}/cable?token=${encodeURIComponent(token)}`
}

export function getConsumer(): Consumer | null {
  const token = getToken()
  if (!token) return null
  if (consumer && consumerToken === token) return consumer

  consumer?.disconnect()
  consumer = createConsumer(cableUrl(token))
  consumerToken = token
  return consumer
}

export function dropConsumer(): void {
  consumer?.disconnect()
  consumer = null
  consumerToken = null
}

/**
 * Identidade desta aba, mandada em `X-Client-Id` a cada mutação: é como a
 * aba reconhece o eco do que ela mesma acabou de salvar e não recarrega
 * por cima do que a pessoa está digitando.
 */
const CLIENT_ID_KEY = "vekoo.client"

function makeClientId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

let clientId: string | null = null

export function getClientId(): string {
  if (clientId) return clientId
  try {
    clientId = sessionStorage.getItem(CLIENT_ID_KEY)
    if (!clientId) {
      clientId = makeClientId()
      sessionStorage.setItem(CLIENT_ID_KEY, clientId)
    }
  } catch {
    clientId = makeClientId()
  }
  return clientId
}

export type ChannelHandlers<Message> = {
  received: (message: Message) => void
  connected?: () => void
  disconnected?: () => void
}

/** Assina um canal e devolve a função que desassina. */
export function subscribe<Message>(
  channel: string,
  handlers: ChannelHandlers<Message>
): (() => void) | null {
  const current = getConsumer()
  if (!current) return null

  const subscription: Subscription = current.subscriptions.create(channel, {
    received: (message: Message) => handlers.received(message),
    connected: () => handlers.connected?.(),
    disconnected: () => handlers.disconnected?.(),
  })

  return () => subscription.unsubscribe()
}
