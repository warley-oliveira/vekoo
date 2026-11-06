import { mutate as globalMutate } from "swr"
import { create } from "zustand"
import { persist } from "zustand/middleware"

import { apiGet } from "@/lib/api"
import { joinChannel, performOnChannel } from "@/lib/cable"
import { afterBulkAction } from "@/lib/chat/actions"
import { getChat, publishChat } from "@/lib/chat/chat-store"
import type { ChatResponse } from "@/lib/chat/types"
import { createSafeJSONStorage } from "@/lib/safe-local-storage"
import type { Credits } from "@/lib/types"
import type {
  CopilotActivity,
  CopilotArchive,
  CopilotBroadcast,
  CopilotChange,
  CopilotError,
  CopilotMessage,
  CopilotSegment,
} from "./copilot-types"

// O copiloto fora do React: a resposta pode levar minutos, e continua chegando com o painel fechado
// ou na aba do contato. Um pedaço de texto por vez desenha só a mensagem em andamento, e as anteriores
// ficam memoizadas.
//
// **O servidor é quem guarda:** o histórico é um por pessoa, em `connected`. **Nada tenta de novo
// sozinho:** uma mensagem pode já ter enviado algo a um contato, e repetir enviaria de novo. Quem
// decide é a pessoa, com `skipSave`.

const CHANNEL = "CopilotChannel"

/** Separa as abas: a resposta só chega à aba que perguntou. */
const SESSION_ID = `copilot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
const PARAMS = { sessionId: SESSION_ID }

/** Quanto sem nenhum sinal até dizer que parou. Uma ferramenta lenta avisa ao começar e ao acabar. */
const SILENCE_LIMIT_MS = 180_000

export const COPILOT_MAX_CHARS = 10_000

/** Quanto custa uma mensagem. `aiCosts`, em `GET /catalog`, ainda não traz este valor. */
export const COPILOT_MESSAGE_COST = 2

export type CopilotLive = {
  startedAt: number
  userText: string
  segments: CopilotSegment[]
}

type CopilotState = {
  connected: boolean
  /** O histórico já chegou do servidor. */
  loaded: boolean
  messages: CopilotMessage[]
  live: CopilotLive | null
  error: CopilotError | null
  /** O pedido que falhou, para tentar de novo. */
  failedText: string | null
}

const INITIAL: CopilotState = {
  connected: false,
  loaded: false,
  messages: [],
  live: null,
  error: null,
  failedText: null,
}

export const useCopilotStore = create<CopilotState>()(() => INITIAL)

const get = () => useCopilotStore.getState()
const set = (changes: Partial<CopilotState>) => useCopilotStore.setState(changes)

/* ---------- texto em pedaços ---------- */

let expectedSeq = 0
const outOfOrder = new Map<number, string>()
let pendingText = ""
let frame: number | null = null
let silence: ReturnType<typeof setTimeout> | null = null

function resetStream() {
  expectedSeq = 0
  outOfOrder.clear()
  pendingText = ""
  if (frame !== null) cancelAnimationFrame(frame)
  frame = null
}

function stopWatching() {
  if (silence) clearTimeout(silence)
  silence = null
}

function watchSilence() {
  stopWatching()
  silence = setTimeout(() => {
    silence = null
    failLive({ code: "timeout", message: null })
  }, SILENCE_LIMIT_MS)
}

/** Vários pedaços no mesmo quadro viram um desenho só. */
function flushText() {
  if (frame !== null) cancelAnimationFrame(frame)
  frame = null
  if (!pendingText) return

  const text = pendingText
  pendingText = ""
  const live = get().live
  if (!live) return

  const last = live.segments[live.segments.length - 1]
  set({
    live: {
      ...live,
      segments:
        last?.type === "text"
          ? [...live.segments.slice(0, -1), { type: "text", content: last.content + text }]
          : [...live.segments, { type: "text", content: text }],
    },
  })
}

function receiveChunk(chunk: string, seq: number) {
  if (!get().live || seq < expectedSeq) return

  outOfOrder.set(seq, chunk)
  while (outOfOrder.has(expectedSeq)) {
    pendingText += outOfOrder.get(expectedSeq)
    outOfOrder.delete(expectedSeq)
    expectedSeq += 1
  }
  if (pendingText && frame === null) frame = requestAnimationFrame(flushText)
}

/* ---------- atividades ---------- */

function sameContact(a: CopilotActivity, b: CopilotActivity) {
  const left = a.contact?.userName
  const right = b.contact?.userName
  return !left || !right || left === right
}

function receiveActivity(activity: CopilotActivity) {
  flushText()
  const live = get().live
  if (!live) return

  if (activity.status === "started") {
    set({ live: { ...live, segments: [...live.segments, { type: "activity", activity }] } })
    return
  }

  const segments = [...live.segments]
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index]
    if (
      segment.type === "activity" &&
      segment.activity.status === "started" &&
      segment.activity.toolName === activity.toolName &&
      sameContact(segment.activity, activity)
    ) {
      segments[index] = { type: "activity", activity }
      set({ live: { ...live, segments } })
      return
    }
  }
  set({ live: { ...live, segments: [...segments, { type: "activity", activity }] } })
}

function segmentsText(segments: CopilotSegment[]): string {
  return segments.map((segment) => (segment.type === "text" ? segment.content : "")).join("")
}

/** `message_complete` traz o texto inteiro: vale ele, se os pedaços se perderam pelo caminho. */
function finalSegments(segments: CopilotSegment[], text: string): CopilotSegment[] {
  if (segmentsText(segments).trim() === text.trim()) return segments
  return [
    ...segments.filter((segment) => segment.type === "activity"),
    ...(text ? [{ type: "text" as const, content: text }] : []),
  ]
}

function localId(prefix: string) {
  return `local-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

/** O que sobrou de uma resposta interrompida continua à vista, marcado para sair ao tentar de novo. */
function partialMessage(live: CopilotLive): CopilotMessage | null {
  const text = segmentsText(live.segments)
  if (!text.trim()) return null
  return {
    id: localId("partial"),
    role: "assistant",
    content: text,
    timestamp: Date.now(),
    contentSegments: live.segments,
  }
}

function failLive({ code, message }: Pick<CopilotError, "code" | "message">) {
  flushText()
  stopWatching()
  const { live, messages } = get()
  const partial = live ? partialMessage(live) : null

  set({
    live: null,
    messages: partial ? [...messages, partial] : messages,
    failedText: live?.userText ?? get().failedText,
    error: {
      code,
      message,
      mayHaveActed: Boolean(
        live?.segments.some(
          (segment) =>
            segment.type === "activity" &&
            segment.activity.activityType === "writing" &&
            segment.activity.status === "completed"
        )
      ),
    },
  })
  resetStream()
}

/* ---------- o que o copiloto mudou ---------- */

/**
 * `changesApplied` diz o que mudou, para a tela recarregar. A lista e o painel leem do store: basta
 * trazer de novo as conversas que a tela conhece. As outras chegam quando alguém abrir.
 */
async function reflectChanges(changes: CopilotChange[] | undefined) {
  if (!changes?.length) return

  const known = [...new Set(changes.flatMap((change) => change.chatId ?? []))].filter((id) =>
    Boolean(getChat(id))
  )
  await Promise.allSettled(
    known.slice(0, 20).map(async (id) => {
      const { chat } = await apiGet<ChatResponse>(`/chats/${id}`)
      publishChat(chat)
    })
  )
  afterBulkAction()

  if (changes.some((change) => change.appointmentId)) {
    void globalMutate((key) => typeof key === "string" && key.startsWith("/calendar-events"))
  }
}

/* ---------- o canal ---------- */

function receiveHistory(saved: CopilotMessage[]) {
  const { live } = get()
  if (!live) {
    set({ messages: saved, loaded: true })
    return
  }

  // A conexão voltou com uma resposta em andamento: ela pode ter acabado enquanto o socket caiu.
  const last = saved[saved.length - 1]
  const previous = saved[saved.length - 2]
  const finished =
    last?.role === "assistant" &&
    previous?.content === live.userText &&
    last.timestamp >= live.startedAt - 60_000

  if (finished) {
    stopWatching()
    resetStream()
    set({ messages: saved, live: null, loaded: true })
    return
  }

  const hasQuestion = last?.role === "user" && last.content === live.userText
  set({
    loaded: true,
    messages: hasQuestion
      ? saved
      : [
          ...saved,
          {
            id: localId("user"),
            role: "user",
            content: live.userText,
            timestamp: live.startedAt,
          },
        ],
  })
}

function receive(event: CopilotBroadcast) {
  switch (event.action) {
    case "connected":
      receiveHistory(event.data.savedMessages ?? [])
      break

    case "text_chunk":
      watchSilence()
      receiveChunk(event.data.chunk, event.data.seq ?? 0)
      break

    case "tool_activity":
      watchSilence()
      receiveActivity(event.data)
      break

    case "message_complete": {
      flushText()
      stopWatching()
      const { live, messages } = get()
      const text = event.data.text ?? ""
      const changes = event.data.changesApplied ?? []
      resetStream()

      // Nada útil saiu: o crédito volta, e a pessoa precisa saber que não veio resposta.
      if (!text.trim() && changes.length === 0) {
        set({
          live: null,
          failedText: live?.userText ?? null,
          error: { code: "empty", message: null, mayHaveActed: false },
        })
        break
      }

      const segments = finalSegments(live?.segments ?? [], text)
      set({
        live: null,
        error: null,
        failedText: null,
        messages: [
          ...messages,
          {
            id: localId("assistant"),
            role: "assistant",
            content: text,
            timestamp: Date.now(),
            changesApplied: changes,
            contentSegments: segments.length > 0 ? segments : null,
          },
        ],
      })
      void reflectChanges(changes)
      break
    }

    case "credits_updated":
      void globalMutate<Credits>(
        "/credits",
        (current) =>
          current
            ? {
                ...current,
                left: event.data.messageCredits,
                used: current.total - event.data.messageCredits,
              }
            : current,
        { revalidate: false }
      )
      break

    case "error":
      failLive({ code: event.data.code, message: event.data.error })
      break

    case "history_cleared":
      stopWatching()
      resetStream()
      set({ messages: [], live: null, error: null, failedText: null })
      break
  }
}

let leave: (() => void) | null = null
let currentAccount: string | null = null

/** Só assina quando alguém abre o copiloto: quem nunca abre não paga um canal a mais. */
export function connectCopilot(accountId: string | undefined): void {
  if (!accountId) return

  if (currentAccount && currentAccount !== accountId) disconnectCopilot()
  currentAccount = accountId
  if (leave) return

  leave = joinChannel(CHANNEL, PARAMS, {
    onMessage: (message) => receive(message as CopilotBroadcast),
    onStatus: (connected) => set({ connected }),
  })
}

/** Ao sair do chat. O que estava rodando termina no servidor, e volta em `connected`. */
export function disconnectCopilot(): void {
  leave?.()
  leave = null
  currentAccount = null
  stopWatching()
  resetStream()
  useCopilotStore.setState(INITIAL, true)
}

function begin(text: string) {
  resetStream()
  set({
    error: null,
    failedText: null,
    live: { startedAt: Date.now(), userText: text, segments: [] },
  })
  watchSilence()
}

/** Devolve `false` se não saiu: a caixa de texto continua com o que a pessoa escreveu. */
export function sendCopilotMessage(text: string): boolean {
  const message = text.trim()
  if (!message || get().live) return false

  const previous = get().messages
  set({
    messages: [
      ...previous,
      { id: localId("user"), role: "user", content: message, timestamp: Date.now() },
    ],
  })
  begin(message)

  if (performOnChannel(CHANNEL, PARAMS, "message", { userMessage: message })) return true

  stopWatching()
  set({
    messages: previous,
    live: null,
    error: { code: "offline", message: null, mayHaveActed: false },
  })
  return false
}

/** Só a pessoa decide repetir. A pergunta já está guardada no servidor, daí o `skipSave`. */
export function retryCopilot(): void {
  const { failedText, messages } = get()
  if (!failedText || get().live) return

  set({ messages: messages.filter((message) => !message.id.startsWith("local-partial")) })
  begin(failedText)

  if (!performOnChannel(CHANNEL, PARAMS, "message", { userMessage: failedText, skipSave: true })) {
    stopWatching()
    set({
      live: null,
      failedText,
      error: { code: "offline", message: null, mayHaveActed: false },
    })
  }
}

export function dismissCopilotError(): void {
  set({ error: null, failedText: null })
}

/* ---------- conversas guardadas ---------- */

// Guardadas no navegador, como na origem: no servidor o histórico é um só. Com teto, porque é
// dado de atendimento em `localStorage`, e sem a entrada e a saída das ferramentas, que pesam.
const MAX_ARCHIVES = 20
const MAX_ARCHIVED_MESSAGES = 100
const PREVIEW_LENGTH = 80

type ArchivesState = {
  byAccount: Record<string, CopilotArchive[]>
  add: (accountId: string, archive: CopilotArchive) => void
  remove: (accountId: string, id: string) => void
}

export const useCopilotArchives = create<ArchivesState>()(
  persist(
    (setState) => ({
      byAccount: {},
      add: (accountId, archive) =>
        setState((state) => ({
          byAccount: {
            ...state.byAccount,
            [accountId]: [archive, ...(state.byAccount[accountId] ?? [])].slice(0, MAX_ARCHIVES),
          },
        })),
      remove: (accountId, id) =>
        setState((state) => ({
          byAccount: {
            ...state.byAccount,
            [accountId]: (state.byAccount[accountId] ?? []).filter((item) => item.id !== id),
          },
        })),
    }),
    {
      name: "vekoo.chat.copilot-archives.v1",
      storage: createSafeJSONStorage(),
    }
  )
)

function withoutToolData(activity: CopilotActivity): CopilotActivity {
  return { ...activity, input: undefined, output: undefined }
}

function archiveOf(messages: CopilotMessage[]): CopilotArchive {
  const first = messages.find((message) => message.role === "user") ?? messages[0]
  return {
    id: localId("archive"),
    preview: first.content.slice(0, PREVIEW_LENGTH),
    archivedAt: Date.now(),
    messages: messages.slice(-MAX_ARCHIVED_MESSAGES).map((message) => ({
      ...message,
      toolActivities: message.toolActivities?.map(withoutToolData) ?? null,
      contentSegments:
        message.contentSegments?.map((segment) =>
          segment.type === "activity"
            ? { type: "activity", activity: withoutToolData(segment.activity) }
            : segment
        ) ?? null,
    })),
  }
}

/**
 * Começa do zero: guarda a conversa neste navegador e limpa o histórico no servidor, que é o contexto
 * do modelo. Devolve `false` se o canal estiver fora.
 */
export function startNewCopilotConversation(accountId: string): boolean {
  const { messages, live } = get()
  if (live || messages.length === 0) return false
  if (!performOnChannel(CHANNEL, PARAMS, "clear_history")) return false

  useCopilotArchives.getState().add(accountId, archiveOf(messages))
  return true
}
