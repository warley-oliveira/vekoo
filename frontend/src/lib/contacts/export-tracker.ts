import { joinChannel, performOnChannel } from "@/lib/cable"
import { safeLocalStorage } from "@/lib/safe-local-storage"
import type { ContactsExportEvent } from "./types"

// A exportação em segundo plano. Vive fora do React de propósito: uma base grande leva tempo, e
// a pessoa vai sair da tela para atender alguém. Se a assinatura morresse junto com a página, o
// aviso de "pronto" se perderia, e o link com ele, porque o servidor não guarda para quem pediu.
// Então a assinatura fica de pé enquanto houver exportação em andamento, e o link pronto fica no
// navegador até vencer.
//
// Módulo sem idioma: guarda o texto que o servidor mandou e códigos, e quem desenha traduz.

const CHANNEL = "ContactsExportChannel"
const CHANNEL_PARAMS = {}
const STORAGE_KEY = "vekoo.contacts.export.v1"

/** `Contacts::ExportToken::TTL`. O relógio do servidor manda: esta é só a estimativa da tela. */
export const EXPORT_LINK_TTL_MS = 60 * 60 * 1000
const CONNECT_TIMEOUT_MS = 15_000
/** Sem notícia por este tempo: a fila pode estar cheia, ou o aviso pode ter se perdido. */
const STALL_AFTER_MS = 60_000

export type ExportPhase =
  /** Nada acontecendo. */
  | "idle"
  /** Pedido feito, esperando o primeiro aviso. */
  | "requesting"
  | "running"
  | "ready"
  /** Terminou sem nada para exportar. */
  | "empty"
  | "expired"
  | "failed"

export type ExportState = {
  phase: ExportPhase
  processed: number
  total: number
  /** Sem aviso há um tempo. Continua ouvindo: pode chegar ainda. */
  stalled: boolean
  downloadUrl: string | null
  fileName: string | null
  expiresAt: number | null
  /** O texto do servidor, já no idioma da pessoa. */
  message: string | null
  /** O canal não respondeu, e o pedido nem saiu. */
  noConnection: boolean
}

const IDLE: ExportState = {
  phase: "idle",
  processed: 0,
  total: 0,
  stalled: false,
  downloadUrl: null,
  fileName: null,
  expiresAt: null,
  message: null,
  noConnection: false,
}

type StoredLink = Pick<ExportState, "downloadUrl" | "fileName" | "total" | "expiresAt"> & {
  accountId: string
}

let state: ExportState = IDLE
let owner: string | null = null
let holders = 0
let leaveChannel: (() => void) | null = null
let pendingPayload: object | null = null
let connectTimer: ReturnType<typeof setTimeout> | null = null
let stallTimer: ReturnType<typeof setTimeout> | null = null
let expiryTimer: ReturnType<typeof setTimeout> | null = null
let awayListener: ((state: ExportState) => void) | null = null

const listeners = new Set<() => void>()

function setState(next: Partial<ExportState>) {
  state = { ...state, ...next }
  listeners.forEach((listener) => listener())
}

function clearTimer(timer: ReturnType<typeof setTimeout> | null) {
  if (timer) clearTimeout(timer)
}

function isActive() {
  return state.phase === "requesting" || state.phase === "running"
}

function touchWatchdog() {
  clearTimer(stallTimer)
  stallTimer = setTimeout(() => {
    if (isActive()) setState({ stalled: true })
  }, STALL_AFTER_MS)
}

function storedLink(accountId: string): StoredLink | null {
  try {
    const raw = safeLocalStorage.getItem(STORAGE_KEY)
    const link = raw ? (JSON.parse(raw) as StoredLink) : null
    return link?.accountId === accountId ? link : null
  } catch {
    return null
  }
}

function forgetLink() {
  safeLocalStorage.removeItem(STORAGE_KEY)
}

function scheduleExpiry(expiresAt: number) {
  clearTimer(expiryTimer)
  expiryTimer = setTimeout(
    () => {
      forgetLink()
      if (state.phase === "ready") setState({ phase: "expired" })
    },
    Math.max(expiresAt - Date.now(), 0)
  )
}

function maybeLeaveChannel() {
  if (holders > 0 || isActive() || !leaveChannel) return
  leaveChannel()
  leaveChannel = null
}

/** Terminou com a página fora da tela: quem pediu ainda precisa saber. */
function notifyAway() {
  if (holders === 0) awayListener?.(state)
  awayListener = null
}

function finish(next: Partial<ExportState>) {
  clearTimer(stallTimer)
  clearTimer(connectTimer)
  pendingPayload = null
  setState({ ...next, stalled: false })
  notifyAway()
  maybeLeaveChannel()
}

function handleMessage(message: unknown) {
  const event = message as ContactsExportEvent
  if (!event?.action) return

  switch (event.action) {
    case "progress":
      touchWatchdog()
      setState({
        phase: "running",
        processed: event.data.processed,
        total: event.data.total,
        stalled: false,
        downloadUrl: null,
        fileName: null,
        expiresAt: null,
        message: null,
        noConnection: false,
      })
      break

    case "completed":
      if (!event.data.downloadUrl) {
        finish({
          phase: "empty",
          total: 0,
          processed: 0,
          downloadUrl: null,
          message: event.data.message ?? null,
        })
        break
      }
      {
        const expiresAt = Date.now() + EXPORT_LINK_TTL_MS
        if (owner) {
          const link: StoredLink = {
            accountId: owner,
            downloadUrl: event.data.downloadUrl,
            fileName: event.data.fileName ?? null,
            total: event.data.total,
            expiresAt,
          }
          safeLocalStorage.setItem(STORAGE_KEY, JSON.stringify(link))
        }
        scheduleExpiry(expiresAt)
        finish({
          phase: "ready",
          processed: event.data.total,
          total: event.data.total,
          downloadUrl: event.data.downloadUrl,
          fileName: event.data.fileName ?? null,
          expiresAt,
          message: null,
        })
      }
      break

    case "error":
      finish({ phase: "failed", message: event.data.error, noConnection: false })
      break
  }
}

function sendPending() {
  if (!pendingPayload) return
  if (performOnChannel(CHANNEL, CHANNEL_PARAMS, "export", pendingPayload)) {
    pendingPayload = null
    clearTimer(connectTimer)
    touchWatchdog()
  }
}

function joinIfNeeded() {
  if (leaveChannel) return
  leaveChannel = joinChannel(CHANNEL, CHANNEL_PARAMS, {
    onMessage: handleMessage,
    onStatus: (connected) => {
      if (connected) sendPending()
    },
  })
}

export function subscribeToExport(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getExportState(): ExportState {
  return state
}

/**
 * A tela entrou: assina o canal, para a exportação de quem recarregou no meio voltar a aparecer
 * com o próximo aviso, e recupera o link que ainda vale. Devolve a função de sair.
 */
export function attachExportTracker(accountId: string): () => void {
  holders++

  if (owner !== accountId) {
    // Outra conta no mesmo navegador: o link de uma pessoa não é da outra.
    clearTimer(expiryTimer)
    clearTimer(stallTimer)
    clearTimer(connectTimer)
    pendingPayload = null
    owner = accountId
    state = IDLE

    const link = storedLink(accountId)
    if (link?.expiresAt && link.expiresAt > Date.now()) {
      state = {
        ...IDLE,
        phase: "ready",
        processed: link.total,
        total: link.total,
        downloadUrl: link.downloadUrl,
        fileName: link.fileName,
        expiresAt: link.expiresAt,
      }
      scheduleExpiry(link.expiresAt)
    } else if (link) {
      forgetLink()
    }
    listeners.forEach((listener) => listener())
  }

  joinIfNeeded()

  return () => {
    holders--
    maybeLeaveChannel()
  }
}

export function startExport(payload: object, onFinishAway?: (state: ExportState) => void) {
  clearTimer(expiryTimer)
  clearTimer(connectTimer)
  forgetLink()

  awayListener = onFinishAway ?? null
  pendingPayload = payload
  setState({ ...IDLE, phase: "requesting" })

  joinIfNeeded()
  sendPending()

  if (pendingPayload) {
    connectTimer = setTimeout(() => {
      if (pendingPayload) finish({ phase: "failed", noConnection: true })
    }, CONNECT_TIMEOUT_MS)
  }
}

/** O servidor disse que o link venceu, antes do relógio da tela. */
export function markExportExpired() {
  clearTimer(expiryTimer)
  forgetLink()
  setState({ phase: "expired" })
}

/** Volta ao começo. A exportação que estiver rodando no servidor continua, sem ninguém olhar. */
export function dismissExport() {
  clearTimer(expiryTimer)
  clearTimer(stallTimer)
  clearTimer(connectTimer)
  pendingPayload = null
  awayListener = null
  forgetLink()
  setState(IDLE)
  maybeLeaveChannel()
}
