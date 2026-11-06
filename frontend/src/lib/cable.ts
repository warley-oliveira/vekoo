import { createConsumer, type Consumer, type Subscription } from "@rails/actioncable"

import { API_URL } from "@/lib/api"

// O único consumer de ActionCable do app. Não há outro `createConsumer`: telas
// assinam canais por `useChannel` (hooks/use-channel.ts).
//
// Duas coisas que não vêm prontas e são a razão deste módulo existir:
//
// - **Uma assinatura por identificador.** O servidor ignora um segundo `subscribe`
//   com o mesmo identificador e não confirma de novo; no cliente, o guardião de
//   assinaturas do ActionCable fica reenviando esse `subscribe` a cada 500 ms, para
//   sempre. Então dois componentes no mesmo canal (com os mesmos parâmetros)
//   compartilham a mesma assinatura, por contagem de ouvintes.
// - **Sobreviver à troca de sessão.** O token vai na URL, então trocar de conta é
//   trocar de consumer. Quem já estava ouvindo continua ouvindo: as assinaturas são
//   refeitas aqui, sem o componente perceber.
// - **Não insistir em canal que não responde.** Um canal sem classe no servidor (o
//   front chegou antes do back) nunca é confirmado nem recusado, e o mesmo guardião
//   reenviaria o `subscribe` duas vezes por segundo, de cada aba aberta, para sempre.
//   Sem confirmação no prazo, a assinatura sai e volta a tentar bem depois.

/** Num servidor saudável, a confirmação chega em bem menos que isso. */
const CONFIRM_TIMEOUT_MS = 10_000
const RETRY_UNCONFIRMED_MS = 60_000

export type ChannelParams = Record<string, unknown>

export type ChannelListener = {
  onMessage: (message: unknown) => void
  onStatus: (connected: boolean) => void
}

type Entry = {
  channel: string
  params: ChannelParams
  listeners: Set<ChannelListener>
  connected: boolean
  subscription: Subscription | null
  pendingRemoval: ReturnType<typeof setTimeout> | null
  /** O prazo da confirmação ou, depois de desistir, a próxima tentativa. */
  confirmTimer: ReturnType<typeof setTimeout> | null
}

const entries = new Map<string, Entry>()
let consumer: Consumer | null = null
let currentToken: string | null = null

function cableUrl(token: string): string {
  const base = API_URL.replace(/^http/, "ws").replace(/\/+$/, "")
  return `${base}/cable?token=${encodeURIComponent(token)}`
}

function setStatus(entry: Entry, connected: boolean) {
  if (entry.connected === connected) return
  entry.connected = connected
  for (const listener of entry.listeners) listener.onStatus(connected)
}

function clearConfirmTimer(entry: Entry) {
  if (entry.confirmTimer) clearTimeout(entry.confirmTimer)
  entry.confirmTimer = null
}

function attach(entry: Entry) {
  if (!consumer || entry.subscription) return
  entry.subscription = consumer.subscriptions.create(
    { channel: entry.channel, ...entry.params },
    {
      connected: () => {
        clearConfirmTimer(entry)
        setStatus(entry, true)
      },
      disconnected: () => setStatus(entry, false),
      // Recusa é resposta: o servidor sabe quem é a pessoa e disse não. Não insiste.
      rejected: () => {
        clearConfirmTimer(entry)
        setStatus(entry, false)
      },
      received: (message: unknown) => {
        for (const listener of entry.listeners) listener.onMessage(message)
      },
    }
  )
  entry.confirmTimer = setTimeout(() => giveUpForNow(entry), CONFIRM_TIMEOUT_MS)
}

function giveUpForNow(entry: Entry) {
  entry.subscription?.unsubscribe()
  entry.subscription = null
  entry.confirmTimer = setTimeout(() => {
    entry.confirmTimer = null
    attach(entry)
  }, RETRY_UNCONFIRMED_MS)
}

/** Fecha o WebSocket. Os ouvintes ficam registrados para a próxima sessão. */
export function closeCable(): void {
  consumer?.disconnect()
  consumer = null
  currentToken = null
  for (const entry of entries.values()) {
    clearConfirmTimer(entry)
    entry.subscription = null
    setStatus(entry, false)
  }
}

/** Abre o WebSocket da sessão. Mesmo token é no-op; outro token troca o consumer. */
export function openCable(token: string): void {
  if (token === currentToken && consumer) return
  closeCable()
  currentToken = token
  consumer = createConsumer(cableUrl(token))
  for (const entry of entries.values()) attach(entry)
}

function channelKey(channel: string, params: ChannelParams): string {
  const sorted = Object.keys(params)
    .sort()
    .map((key) => [key, params[key]])
  return JSON.stringify([channel, sorted])
}

/** Entra no canal e devolve a função de sair. Em componentes, use `useChannel`. */
export function joinChannel(
  channel: string,
  params: ChannelParams,
  listener: ChannelListener
): () => void {
  const key = channelKey(channel, params)
  let entry = entries.get(key)
  if (!entry) {
    entry = {
      channel,
      params,
      listeners: new Set(),
      connected: false,
      subscription: null,
      pendingRemoval: null,
      confirmTimer: null,
    }
    entries.set(key, entry)
    attach(entry)
  }
  if (entry.pendingRemoval) {
    clearTimeout(entry.pendingRemoval)
    entry.pendingRemoval = null
  }
  entry.listeners.add(listener)
  listener.onStatus(entry.connected)

  const joined = entry
  return () => {
    joined.listeners.delete(listener)
    if (joined.listeners.size > 0) return
    // Adiado: o StrictMode e a troca de rota saem e entram no mesmo tick, e não há
    // por que mandar `unsubscribe` + `subscribe` ao servidor nesses casos.
    joined.pendingRemoval = setTimeout(() => {
      if (joined.listeners.size > 0) return
      clearConfirmTimer(joined)
      joined.subscription?.unsubscribe()
      entries.delete(key)
    }, 0)
  }
}

/** Chama uma ação do canal. `false` se ainda não há assinatura confirmada. */
export function performOnChannel(
  channel: string,
  params: ChannelParams,
  action: string,
  data?: object
): boolean {
  const entry = entries.get(channelKey(channel, params))
  if (!entry?.subscription || !entry.connected) return false
  return entry.subscription.perform(action, data)
}
