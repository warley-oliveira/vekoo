import { create } from "zustand"

import { apiGet } from "@/lib/api"
import { getChat, patchChat, subscribeChatEvents } from "./chat-store"
import { unifiedMessagesPath } from "./list-query"
import type {
  AttributeDefinition,
  Chat,
  ChatChannelMessage,
  ChatMessage,
  MessageReaction,
  MessagesResponse,
} from "./types"

// O histórico de cada conversa já aberta, fora do React.
//
// É o que faz voltar a uma conversa ser instantâneo e sem pedir nada à API: a conversa fica
// aqui, e o que muda enquanto ela não está aberta a lista conta (`ChatListChannel`), marcando
// o histórico como defasado. Só então, ao abrir de novo, ele busca a janela mais recente e
// funde por id. Na origem cada troca de conversa apagava tudo e buscava de novo.
//
// A chave é o id da conversa, ou `contact:<externalId>` na linha do tempo "Todos".

const PAGE_SIZE = 50

/** Quantos históricos ficam em memória. O mais antigo sai primeiro. */
const MAX_THREADS = 30

/** Sem eco do servidor nesse prazo, a mensagem vira "não enviada", com tentar de novo. */
const SEND_TIMEOUT_MS = 20_000

/** Folga até a lista "contar" uma mensagem que o canal da conversa ainda vai entregar. */
const OPEN_TOLERANCE_INBOUND_MS = 1_000
/** Nossa mensagem: `lastMessageAt` é gravado depois do envio, que pode levar segundos. */
const OPEN_TOLERANCE_OUTBOUND_MS = 60_000

const TYPING_TTL_MS = 10_000

export type OutgoingMessage = {
  localId: string
  /** O texto como foi escrito, para mostrar. */
  text: string
  /** O que vai ao servidor, com as citações de anexo. */
  payload: string
  replyToMessageId: string | null
  createdAt: number
  status: "sending" | "failed"
  failure?: "offline" | "timeout"
}

/** O que o canal conta do contato agora. Só a Evolution informa. */
export type ContactPresence = "composing" | "recording" | null

export type ThreadState = {
  status: "loading" | "ready" | "error"
  error: unknown
  messages: ChatMessage[]
  hasMore: boolean
  oldestId: string | null
  loadingOlder: boolean
  olderError: unknown
  /** A lista disse que há novidade aqui e o histórico ainda não buscou. */
  stale: boolean
  /** O `lastMessageAt` que este histórico já conhece. */
  syncedLastMessageAt: number
  connectorProvider: string | null
  attributeList: AttributeDefinition[]
  outbox: OutgoingMessage[]
  /** O contato está digitando ou gravando áudio, quando o canal contar. */
  presence: ContactPresence
  touchedAt: number
}

type ThreadStoreState = {
  threads: Record<string, ThreadState>
}

export const useThreadStore = create<ThreadStoreState>()(() => ({ threads: {} }))

function emptyThread(): ThreadState {
  return {
    status: "loading",
    error: null,
    messages: [],
    hasMore: false,
    oldestId: null,
    loadingOlder: false,
    olderError: null,
    stale: false,
    syncedLastMessageAt: 0,
    connectorProvider: null,
    attributeList: [],
    outbox: [],
    presence: null,
    touchedAt: Date.now(),
  }
}

let openThreadKey: string | null = null

function threadOf(key: string): ThreadState | undefined {
  return useThreadStore.getState().threads[key]
}

function evict(threads: Record<string, ThreadState>): Record<string, ThreadState> {
  const keys = Object.keys(threads)
  if (keys.length <= MAX_THREADS) return threads

  const removable = keys
    .filter(
      (key) =>
        key !== openThreadKey &&
        threads[key].outbox.length === 0 &&
        threads[key].status !== "loading"
    )
    .sort((a, b) => threads[a].touchedAt - threads[b].touchedAt)

  const next = { ...threads }
  for (const key of removable.slice(0, keys.length - MAX_THREADS)) delete next[key]
  return next
}

function patch(key: string, change: (thread: ThreadState) => Partial<ThreadState>) {
  useThreadStore.setState((state) => {
    const current = state.threads[key] ?? emptyThread()
    const changes = change(current)
    const next = { ...current, ...changes }
    const threads = { ...state.threads, [key]: next }
    return { threads: state.threads[key] ? threads : evict(threads) }
  })
}

/* ---------- fusão ---------- */

function sameMessage(a: ChatMessage, b: ChatMessage): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b)
}

/**
 * Funde por id, mantendo a referência do que não mudou: é o que permite à bolha, memoizada,
 * não se desenhar quando chega uma janela inteira com 49 mensagens iguais.
 */
function upsertMessage(list: ChatMessage[], incoming: ChatMessage): ChatMessage[] {
  for (let index = list.length - 1; index >= 0; index -= 1) {
    if (list[index].id !== incoming.id) continue
    const merged = { ...list[index], ...incoming }
    if (sameMessage(list[index], merged)) return list
    const next = [...list]
    next[index] = merged
    return next
  }

  let at = list.length
  while (at > 0 && list[at - 1].createdAt > incoming.createdAt) at -= 1
  return [...list.slice(0, at), incoming, ...list.slice(at)]
}

function newestAt(messages: ChatMessage[]): number {
  return messages.length > 0 ? messages[messages.length - 1].createdAt : 0
}

/** O eco de uma mensagem nossa tira a versão otimista da fila, na ordem de envio. */
/**
 * As mensagens que chegaram no lugar de uma bolha otimista, com a hora em que a otimista nasceu. A
 * bolha já estava na tela: a de verdade não entra de novo, só continua a entrada de onde a otimista
 * parou (o eco local chega em menos de 100 ms) e troca o relógio pelo status. Guarda poucas.
 */
const echoes = new Map<string, number>()
const MAX_ECHOES = 50

function rememberEcho(id: string, optimisticAt: number) {
  echoes.set(id, optimisticAt)
  if (echoes.size > MAX_ECHOES) echoes.delete(echoes.keys().next().value as string)
}

/** Se esta mensagem tomou o lugar de uma bolha otimista que a pessoa acabou de ver. */
export function isOptimisticEcho(id: string): boolean {
  return echoes.has(id)
}

/** Quando nasceu a bolha otimista que esta mensagem substituiu. */
export function optimisticEchoStartedAt(id: string): number | undefined {
  return echoes.get(id)
}

function settleOutbox(outbox: OutgoingMessage[], incoming: ChatMessage): OutgoingMessage[] {
  if (outbox.length === 0) return outbox
  if (incoming.role !== "assistant" || incoming.messageOrigin !== "frontend") return outbox

  const content = (incoming.content ?? "").trim()
  const index = outbox.findIndex((entry) => entry.payload.trim() === content)
  if (index >= 0) {
    rememberEcho(incoming.id, outbox[index].createdAt)
    return outbox.filter((_, position) => position !== index)
  }

  // Mensagem longa ou com anexo sai em partes, com o texto já tratado pelo servidor: a primeira
  // parte que chega responde pela mais antiga da fila.
  if (!incoming.isSpan) return outbox
  rememberEcho(incoming.id, outbox[0].createdAt)
  return outbox.slice(1)
}

/** Só o que é novo para este histórico conta como eco: mensagem antiga igual não responde. */
function settleWithNew(
  outbox: OutgoingMessage[],
  known: ChatMessage[],
  fresh: ChatMessage[]
): OutgoingMessage[] {
  if (outbox.length === 0) return outbox
  const knownIds = new Set(known.map((message) => message.id))
  return fresh
    .filter((message) => !knownIds.has(message.id))
    .reduce(settleOutbox, outbox)
}

export function receiveMessage(key: string, incoming: ChatMessage): void {
  if (!threadOf(key)) return

  patch(key, (thread) => {
    const messages = upsertMessage(thread.messages, incoming)
    const isNew = messages.length > thread.messages.length
    const chat = key.startsWith("contact:") ? undefined : getChat(key)
    const caughtUp =
      thread.stale &&
      (chat?.lastMessageAt ?? 0) <= newestAt(messages) + OPEN_TOLERANCE_INBOUND_MS

    return {
      messages,
      outbox: isNew ? settleOutbox(thread.outbox, incoming) : thread.outbox,
      stale: caughtUp ? false : thread.stale,
    }
  })
}

/**
 * Tudo que `ChatChannel` entrega. Só a própria mensagem é fundida; `event` desconhecido (há
 * `bookings_changed` e `scheduled_actions_changed`, de outros painéis) passa sem quebrar.
 */
export function applyChannelMessage(key: string, payload: ChatChannelMessage): void {
  if (!payload || typeof payload !== "object") return

  if ("event" in payload) {
    if (payload.event === "message_reaction_failed") {
      const { id, reactions } = payload as { id: string; reactions: MessageReaction[] }
      patchMessage(key, id, { reactions: reactions ?? [] })
    } else if (payload.event === "messages_deleted") {
      const { messageIds } = payload as { messageIds: string[] }
      applyDeleted(key, messageIds ?? [])
    } else if (payload.event === "presence") {
      const value = (payload as { value?: string }).value
      setPresence(key, value === "composing" || value === "recording" ? value : null)
    }
    return
  }

  if ("id" in payload && payload.id) {
    const message = payload as ChatMessage
    receiveMessage(key, message)
    if (message.role === "user") setPresence(key, null)
  }
}

const presenceTimers = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * "Digitando" e "gravando áudio". Sem evento de fim garantido, então expira sozinho, no mesmo prazo
 * que o servidor guarda a presença. Só a Evolution informa: nos outros canais o aviso simplesmente
 * não aparece.
 */
function setPresence(key: string, presence: ContactPresence) {
  const timer = presenceTimers.get(key)
  if (timer) clearTimeout(timer)
  presenceTimers.delete(key)

  if (threadOf(key)?.presence !== presence) patch(key, () => ({ presence }))
  if (presence) {
    presenceTimers.set(
      key,
      setTimeout(() => setPresence(key, null), TYPING_TTL_MS)
    )
  }
}

export function patchMessage(key: string, id: string, changes: Partial<ChatMessage>): void {
  patch(key, (thread) => {
    const index = thread.messages.findIndex((message) => message.id === id)
    if (index < 0) return {}
    const messages = [...thread.messages]
    messages[index] = { ...messages[index], ...changes }
    return { messages }
  })
}

export function applyDeleted(key: string, ids: string[]): void {
  const set = new Set(ids)
  if (set.size === 0) return

  patch(key, (thread) => ({
    messages: thread.messages.filter((message) => !set.has(message.id)),
  }))
}

/** Só uma reação por lado: a nossa substitui a anterior, e emoji vazio tira. */
export function applyOwnReaction(
  reactions: MessageReaction[] | null | undefined,
  emoji: string,
  senderName?: string
): MessageReaction[] {
  const others = (reactions ?? []).filter((reaction) => reaction.from !== "assistant")
  return emoji ? [...others, { emoji, from: "assistant", senderName }] : others
}

/* ---------- busca ---------- */

function messagesPath(
  key: string,
  { beforeId, initial }: { beforeId?: string | null; initial?: boolean }
): string {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) })
  if (beforeId) params.set("beforeId", beforeId)

  if (key.startsWith("contact:")) {
    return `${unifiedMessagesPath(key.slice("contact:".length))}?${params}`
  }

  // `initial=false`: só as mensagens, sem marcar como lida.
  if (initial === false) params.set("initial", "false")
  return `/chats/${key}/messages?${params}`
}

function syncedAtOf(key: string, messages: ChatMessage[]): number {
  if (key.startsWith("contact:")) return newestAt(messages)
  return Math.max(getChat(key)?.lastMessageAt ?? 0, newestAt(messages))
}

/** A primeira página já zerou as não lidas no servidor: a lista não precisa esperar o evento. */
function syncUnread(key: string, page: MessagesResponse) {
  if (key.startsWith("contact:") || page.unreadMessages === undefined) return
  patchChat(key, { unreadMessages: page.unreadMessages })
}

const inFlight = new Map<string, Promise<void>>()

function once(key: string, run: () => Promise<void>): Promise<void> {
  const running = inFlight.get(key)
  if (running) return running

  const promise = run().finally(() => inFlight.delete(key))
  inFlight.set(key, promise)
  return promise
}

/** Primeira carga. Marca a conversa como lida no servidor, se for da pessoa ou sem dono. */
export function loadThread(key: string): Promise<void> {
  return once(`load:${key}`, async () => {
    patch(key, () => ({ status: "loading", error: null, touchedAt: Date.now() }))

    try {
      const page = await apiGet<MessagesResponse>(messagesPath(key, {}))
      patch(key, (thread) => {
        // O que chegou pelo socket durante a busca continua valendo.
        const messages = page.messages.reduce(upsertMessage, thread.messages)
        return {
          status: "ready",
          error: null,
          messages,
          hasMore: page.hasMore,
          oldestId: page.oldestId,
          stale: false,
          syncedLastMessageAt: syncedAtOf(key, messages),
          connectorProvider: page.connectorProvider ?? thread.connectorProvider,
          attributeList: page.attributeList ?? thread.attributeList,
          outbox: settleWithNew(thread.outbox, thread.messages, page.messages),
        }
      })
      syncUnread(key, page)
    } catch (error) {
      patch(key, () => ({ status: "error", error }))
    }
  })
}

/** Mensagens mais antigas, ao chegar no topo. */
export function loadOlder(key: string): Promise<void> {
  return once(`older:${key}`, async () => {
    const thread = threadOf(key)
    if (!thread?.hasMore || !thread.oldestId) return

    patch(key, () => ({ loadingOlder: true, olderError: null }))

    try {
      const page = await apiGet<MessagesResponse>(
        messagesPath(key, { beforeId: thread.oldestId, initial: false })
      )
      patch(key, (current) => {
        const knownIds = new Set(current.messages.map((message) => message.id))
        return {
          loadingOlder: false,
          // Vêm todas de antes do que já está aqui: basta pôr na frente.
          messages: [
            ...page.messages.filter((message) => !knownIds.has(message.id)),
            ...current.messages,
          ],
          hasMore: page.hasMore,
          oldestId: page.oldestId,
        }
      })
    } catch (error) {
      patch(key, () => ({ loadingOlder: false, olderError: error }))
    }
  })
}

/**
 * Busca a janela mais recente e funde por id. Dentro da janela, o servidor é a verdade: o que
 * sumiu dela foi apagado. Mais antigo que a janela fica, para não perder o que já foi rolado.
 */
export function resyncThread(key: string, { markRead = false } = {}): Promise<void> {
  return once(`resync:${key}`, async () => {
    try {
      const page = await apiGet<MessagesResponse>(messagesPath(key, { initial: markRead }))
      const fresh = page.messages

      patch(key, (thread) => {
        const known = thread.messages
        const base = {
          status: "ready" as const,
          error: null,
          stale: false,
          connectorProvider: page.connectorProvider ?? thread.connectorProvider,
          attributeList: page.attributeList ?? thread.attributeList,
          outbox: settleWithNew(thread.outbox, known, fresh),
        }

        if (fresh.length === 0) {
          return { ...base, syncedLastMessageAt: syncedAtOf(key, known) }
        }

        const freshIds = new Set(fresh.map((message) => message.id))
        const overlaps = known.some((message) => freshIds.has(message.id))

        // Ficou fora mais tempo do que a janela alcança: recomeça dela, e o resto vem ao rolar.
        if (known.length > 0 && !overlaps) {
          return {
            ...base,
            messages: fresh,
            hasMore: page.hasMore,
            oldestId: page.oldestId,
            syncedLastMessageAt: syncedAtOf(key, fresh),
          }
        }

        const windowStart = fresh[0].createdAt
        const windowEnd = newestAt(fresh)
        const outside = known.filter(
          (message) =>
            !freshIds.has(message.id) &&
            // Mais nova que a resposta: chegou pelo socket enquanto a busca estava no ar.
            (message.createdAt <= windowStart || message.createdAt > windowEnd)
        )
        const hasOlder = outside.some((message) => message.createdAt <= windowStart)

        // A mesma referência para o que não mudou.
        const messages = fresh.reduce(
          (list, message) => upsertMessage(list, message),
          known.filter((message) => freshIds.has(message.id) || outside.includes(message))
        )

        return {
          ...base,
          messages,
          hasMore: hasOlder ? thread.hasMore : page.hasMore,
          oldestId: hasOlder ? thread.oldestId : page.oldestId,
          syncedLastMessageAt: syncedAtOf(key, messages),
        }
      })
      syncUnread(key, page)
    } catch {
      // Sem rede: o próximo gatilho (reconexão, retomada) tenta de novo.
    }
  })
}

/* ---------- abrir e sair ---------- */

/** O que mudou fora daqui. A conversa aberta recebe pelo próprio canal, e tem folga. */
function checkStale(chat: Chat) {
  const thread = threadOf(chat.id)
  if (!thread || thread.status !== "ready" || thread.stale) return

  const at = chat.lastMessageAt ?? 0
  if (at <= thread.syncedLastMessageAt) return

  if (chat.id === openThreadKey) {
    const tolerance =
      chat.lastMessageBy === "user" ? OPEN_TOLERANCE_INBOUND_MS : OPEN_TOLERANCE_OUTBOUND_MS
    if (at <= newestAt(thread.messages) + tolerance) return
  }

  patch(chat.id, () => ({ stale: true }))
}

subscribeChatEvents((event) => {
  if (event.type === "upsert") {
    checkStale(event.chat)
  } else if (event.type === "recent") {
    event.chats.forEach(checkStale)
  } else if (event.type === "remove") {
    useThreadStore.setState((state) => {
      if (!state.threads[event.id]) return state
      const threads = { ...state.threads }
      delete threads[event.id]
      return { threads }
    })
  }
})

/**
 * A conversa que está na tela. Ao sair, o histórico guarda até onde conhece: a partir daí,
 * qualquer `lastMessageAt` novo na lista é novidade que ele não viu.
 */
export function setOpenThread(key: string | null): void {
  const previous = openThreadKey
  openThreadKey = key

  if (previous && previous !== key && threadOf(previous)?.status === "ready") {
    patch(previous, (thread) =>
      thread.stale ? {} : { syncedLastMessageAt: syncedAtOf(previous, thread.messages) }
    )
  }
  if (key && threadOf(key)) patch(key, () => ({ touchedAt: Date.now() }))
}

/* ---------- envio otimista ---------- */

const sendTimers = new Map<string, ReturnType<typeof setTimeout>>()

function clearSendTimer(localId: string) {
  const timer = sendTimers.get(localId)
  if (timer) clearTimeout(timer)
  sendTimers.delete(localId)
}

/**
 * Mostra a mensagem antes do eco. O protocolo não tem id do cliente, então o eco é reconhecido
 * pelo texto e pela ordem (`settleOutbox`). Sem eco no prazo, vira "não enviada".
 */
export function addOutgoing(
  key: string,
  entry: Pick<OutgoingMessage, "text" | "payload" | "replyToMessageId">
): string {
  const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  patch(key, (thread) => ({
    outbox: [...thread.outbox, { ...entry, localId, createdAt: Date.now(), status: "sending" }],
  }))

  sendTimers.set(
    localId,
    setTimeout(() => {
      sendTimers.delete(localId)
      failOutgoing(key, localId, "timeout")
    }, SEND_TIMEOUT_MS)
  )
  return localId
}

export function failOutgoing(key: string, localId: string, failure: "offline" | "timeout"): void {
  clearSendTimer(localId)
  patch(key, (thread) => ({
    outbox: thread.outbox.map((entry) =>
      entry.localId === localId && entry.status === "sending"
        ? { ...entry, status: "failed", failure }
        : entry
    ),
  }))
}

export function removeOutgoing(key: string, localId: string): void {
  clearSendTimer(localId)
  patch(key, (thread) => ({
    outbox: thread.outbox.filter((entry) => entry.localId !== localId),
  }))
}

/** Tudo que está carregado, sem assinar: para o visualizador de mídia e a seleção. */
export function getThreadMessages(key: string): ChatMessage[] {
  return threadOf(key)?.messages ?? []
}
