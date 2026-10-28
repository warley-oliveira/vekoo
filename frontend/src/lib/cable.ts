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
  channels.clear()
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

/*
 * Uma assinatura **de verdade** por canal, dividida entre quem ouve.
 *
 * O ActionCable identifica a assinatura só pelo nome do canal: duas
 * assinaturas de `AgentChannel` na mesma aba são uma só para o servidor, e o
 * `unsubscribe` de qualquer uma derruba as duas — a outra continua achando
 * que ouve e nunca mais recebe nada (era o "pensando…" que não terminava).
 * Aqui cada canal tem uma assinatura e uma lista de ouvintes; ela só sai
 * quando o último ouvinte sai, e com um respiro, para o monta-desmonta-monta
 * do React (StrictMode, troca de rota) não virar sai-e-entra no servidor.
 */
const RELEASE_MS = 300

type Listener = ChannelHandlers<unknown>
type Entry = {
  consumer: Consumer
  subscription: Subscription
  listeners: Set<Listener>
  connected: boolean
  release: number | null
}

const channels = new Map<string, Entry>()

function forget(channel: string, entry: Entry) {
  if (channels.get(channel) === entry) channels.delete(channel)
  entry.subscription.unsubscribe()
}

/** Assina um canal e devolve a função que desassina. */
export function subscribe<Message>(
  channel: string,
  handlers: ChannelHandlers<Message>
): (() => void) | null {
  const current = getConsumer()
  if (!current) return null

  let entry = channels.get(channel)
  // O consumidor mudou (outro token): a assinatura antiga morreu com ele.
  if (entry && entry.consumer !== current) {
    channels.delete(channel)
    entry = undefined
  }

  if (!entry) {
    const listeners = new Set<Listener>()
    const created: Entry = { consumer: current, subscription: null as unknown as Subscription, listeners, connected: false, release: null }
    created.subscription = current.subscriptions.create(channel, {
      received: (message: unknown) => listeners.forEach((listener) => listener.received(message)),
      connected: () => {
        created.connected = true
        listeners.forEach((listener) => listener.connected?.())
      },
      disconnected: () => {
        created.connected = false
        listeners.forEach((listener) => listener.disconnected?.())
      },
    })
    channels.set(channel, created)
    entry = created
  }

  const shared = entry
  if (shared.release !== null) {
    window.clearTimeout(shared.release)
    shared.release = null
  }
  const listener = handlers as Listener
  shared.listeners.add(listener)
  // Quem chega depois da conexão ouve o "conectado" também.
  if (shared.connected) listener.connected?.()

  return () => {
    shared.listeners.delete(listener)
    if (shared.listeners.size > 0 || shared.release !== null) return
    shared.release = window.setTimeout(() => {
      shared.release = null
      if (shared.listeners.size === 0) forget(channel, shared)
    }, RELEASE_MS)
  }
}
