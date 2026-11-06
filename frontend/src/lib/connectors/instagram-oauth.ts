import { safeLocalStorage } from "@/lib/safe-local-storage"
import { instagramAppId, instagramRedirectOverride } from "./meta-config"

// O login do Instagram abre uma janela, que volta para `/auth/instagram/callback`. A volta
// chega por três caminhos, porque nenhum vale sempre:
//
// - `postMessage` para quem abriu: o caminho normal.
// - `BroadcastChannel` e `storage`: a página da Meta pode cortar o `window.opener`.
// - O próprio `localStorage`, lido depois: com a janela bloqueada (celular, PWA) o login
//   acontece na mesma aba, e a página se recupera ao voltar.
//
// `state` é o que garante que a resposta é do pedido desta pessoa, e não de um link que
// alguém mandou: sem ele, qualquer site poderia entregar um código de outra conta.

const REQUEST_KEY = "vekoo.instagram-oauth.request"
const RESULT_KEY = "vekoo.instagram-oauth.result"
const CHANNEL_NAME = "vekoo.instagram-oauth"
const MESSAGE_TYPE = "instagram_oauth_callback"
const SCOPE = "instagram_business_basic,instagram_business_manage_messages"
/** O código da Meta vale pouco e é de uso único: resposta velha não se reaproveita. */
const RESULT_TTL_MS = 10 * 60 * 1000
/** Depois que a janela fecha, a resposta ainda pode estar a caminho. */
const CLOSED_GRACE_MS = 1_500

export const INSTAGRAM_CALLBACK_PATH = "/auth/instagram/callback"
export const INSTAGRAM_RESUME_PARAM = "instagram"

export type InstagramResult = {
  state: string | null
  code?: string
  error?: string
  errorDescription?: string
  at: number
}

export type InstagramRequest = {
  state: string
  /** Reconectando um canal que já existe. Sem isto, é um canal novo. */
  connectorId?: string
  /** A janela foi bloqueada e o login aconteceu nesta mesma aba. */
  sameWindow?: boolean
}

export function instagramRedirectUri(): string {
  return instagramRedirectOverride ?? `${window.location.origin}${INSTAGRAM_CALLBACK_PATH}`
}

function readJson<T>(key: string): T | null {
  try {
    const raw = safeLocalStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: instagramAppId ?? "",
    redirect_uri: instagramRedirectUri(),
    scope: SCOPE,
    response_type: "code",
    state,
  })
  return `https://www.instagram.com/oauth/authorize?${params}`
}

function saveRequest(request: InstagramRequest) {
  safeLocalStorage.setItem(REQUEST_KEY, JSON.stringify(request))
}

export function readInstagramRequest(): InstagramRequest | null {
  return readJson<InstagramRequest>(REQUEST_KEY)
}

function newState(): string {
  return crypto.randomUUID()
}

function isFresh(result: InstagramResult | null): result is InstagramResult {
  return result !== null && Date.now() - result.at < RESULT_TTL_MS
}

export class InstagramLoginError extends Error {
  readonly reason: "closed" | "refused"
  readonly detail?: string

  constructor(reason: "closed" | "refused", detail?: string) {
    super(detail ?? reason)
    this.name = "InstagramLoginError"
    this.reason = reason
    this.detail = detail
  }
}

function settleResult(result: InstagramResult): { code: string; redirectUri: string } {
  clearInstagramLogin()
  if (result.code) return { code: result.code, redirectUri: instagramRedirectUri() }
  throw new InstagramLoginError("refused", result.errorDescription ?? result.error)
}

export function clearInstagramLogin() {
  safeLocalStorage.removeItem(REQUEST_KEY)
  safeLocalStorage.removeItem(RESULT_KEY)
}

/**
 * Abre o login do Instagram e espera a volta. Precisa rodar dentro do clique: fora dele, o
 * navegador bloqueia a janela. Sem janela, leva a aba inteira, e a resolução nunca chega:
 * quem termina o trabalho é `takeInstagramResume`, na volta.
 */
export function startInstagramLogin(connectorId?: string): Promise<{
  code: string
  redirectUri: string
}> {
  const state = newState()
  const url = authorizeUrl(state)

  safeLocalStorage.removeItem(RESULT_KEY)
  saveRequest({ state, connectorId })

  const width = 600
  const height = 700
  const left = window.screenX + (window.outerWidth - width) / 2
  const top = window.screenY + (window.outerHeight - height) / 2
  const popup = window.open(
    url,
    "instagram_login",
    `width=${width},height=${height},left=${left},top=${top},scrollbars=yes`
  )

  if (!popup) {
    saveRequest({ state, connectorId, sameWindow: true })
    window.location.assign(url)
    return new Promise(() => {})
  }

  return new Promise((resolve, reject) => {
    const channel = "BroadcastChannel" in window ? new BroadcastChannel(CHANNEL_NAME) : null
    let closedTimer: ReturnType<typeof setTimeout> | undefined

    function cleanup() {
      window.removeEventListener("message", onMessage)
      window.removeEventListener("storage", onStorage)
      clearInterval(watchClosed)
      clearTimeout(closedTimer)
      channel?.close()
    }

    function accept(result: InstagramResult) {
      if (result.state !== state) return
      cleanup()
      try {
        resolve(settleResult(result))
      } catch (error) {
        reject(error)
      }
    }

    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return
      const data = event.data as { type?: string; result?: InstagramResult } | null
      if (data?.type === MESSAGE_TYPE && data.result) accept(data.result)
    }

    function onStorage(event: StorageEvent) {
      if (event.key !== RESULT_KEY || !event.newValue) return
      accept(JSON.parse(event.newValue) as InstagramResult)
    }

    if (channel) {
      channel.onmessage = (event: MessageEvent<InstagramResult>) => accept(event.data)
    }
    window.addEventListener("message", onMessage)
    window.addEventListener("storage", onStorage)

    // Sob `Cross-Origin-Opener-Policy`, `closed` pode dizer `true` com a janela aberta.
    // Por isso a folga, e por isso a resposta pode chegar depois daqui.
    const watchClosed = setInterval(() => {
      if (!popup.closed) return
      clearInterval(watchClosed)
      closedTimer = setTimeout(() => {
        const stored = readJson<InstagramResult>(RESULT_KEY)
        if (isFresh(stored) && stored.state === state) {
          accept(stored)
          return
        }
        cleanup()
        reject(new InstagramLoginError("closed"))
      }, CLOSED_GRACE_MS)
    }, 500)
  })
}

/** Para a página de volta: entrega o resultado por todos os caminhos. */
export function publishInstagramResult(params: URLSearchParams): InstagramResult {
  const result: InstagramResult = {
    state: params.get("state"),
    code: params.get("code") ?? undefined,
    error: params.get("error") ?? params.get("error_reason") ?? undefined,
    errorDescription: params.get("error_description") ?? undefined,
    at: Date.now(),
  }

  safeLocalStorage.setItem(RESULT_KEY, JSON.stringify(result))

  if ("BroadcastChannel" in window) {
    const channel = new BroadcastChannel(CHANNEL_NAME)
    channel.postMessage(result)
    channel.close()
  }

  // Origem explícita: o código não vai para quem abriu esta janela de outro site.
  window.opener?.postMessage({ type: MESSAGE_TYPE, result }, window.location.origin)

  return result
}

/**
 * Ao voltar para a lista: o login que terminou fora da janela (na mesma aba, ou com
 * `opener` cortado). Devolve `null` se não há nada para retomar. Consome o pedido.
 */
export function takeInstagramResume(): {
  connectorId?: string
  login: () => { code: string; redirectUri: string }
} | null {
  const request = readInstagramRequest()
  const result = readJson<InstagramResult>(RESULT_KEY)

  if (!request || !isFresh(result) || result.state !== request.state) {
    clearInstagramLogin()
    return null
  }

  return { connectorId: request.connectorId, login: () => settleResult(result) }
}
