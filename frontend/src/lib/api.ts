import { currentLanguage } from "@/lib/i18n"
import { clearToken, getToken } from "@/lib/token"

// Cliente da API do Rails.
//
// O backend responde sempre no mesmo formato — sucesso em camelCase com datas
// em milissegundos, erro como `{ error: { code, field?, message, details? } }`.
// `code` é o contrato de máquina (a tela decide o que fazer por ele) e
// `message` já vem no idioma da requisição, como rede de segurança para
// códigos que a tela não enumerou.

// Sem VITE_API_URL, a API mora no mesmo host da página (na porta do Rails):
// é o que faz o app funcionar pela rede local, aberto por IP em outro
// aparelho, sem gerar um bundle por endereço.
export const BASE_URL: string =
  import.meta.env.VITE_API_URL ||
  `${window.location.protocol}//${window.location.hostname}:${import.meta.env.VITE_RAILS_PORT}`

/**
 * Códigos que a API pode devolver, mais dois sintéticos do cliente
 * (`network` e `unknown`) — para a tela ter um só vocabulário de erro.
 */
export type ApiErrorCode =
  | "unauthorized"
  | "notFound"
  | "unprocessable"
  | "parameterMissing"
  | "emailNotFound"
  | "wrongPassword"
  | "emailTaken"
  | "resetTokenInvalid"
  | "noCredits"
  | "brandIncomplete"
  | "brandNotPublished"
  | "busy"
  | "costCapReached"
  | "conflict"
  | "pieceLocked"
  | "network"
  | "unknown"

type ErrorEnvelope = {
  error?: {
    code?: string
    field?: string
    message?: string
    details?: Record<string, string[]>
  }
}

export class ApiError extends Error {
  /** 0 quando a requisição nem chegou ao servidor. */
  readonly status: number
  readonly code: ApiErrorCode
  /** Campo do formulário a destacar — já em camelCase, vem pronto do Rails. */
  readonly field?: string
  /** Mapa campo → mensagens, no 422 de validação. */
  readonly details?: Record<string, string[]>
  /** A mensagem do servidor, já traduzida. A tela prefere a sua própria. */
  readonly serverMessage?: string

  constructor(init: {
    status: number
    code: ApiErrorCode
    field?: string
    details?: Record<string, string[]>
    serverMessage?: string
  }) {
    super(init.serverMessage || init.code)
    this.name = "ApiError"
    this.status = init.status
    this.code = init.code
    this.field = init.field
    this.details = init.details
    this.serverMessage = init.serverMessage
  }
}

/* ---------- 401 global ---------- */

// `api.ts` não pode importar `auth.tsx` (o contrário é que acontece), então a
// reação ao 401 é registrada de fora.
type UnauthorizedHandler = () => void
let onUnauthorized: UnauthorizedHandler | null = null

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  onUnauthorized = handler
}

export type ApiInit = RequestInit & {
  /**
   * Não trate o 401 como sessão expirada. Vale para entrar, criar conta e para
   * o `GET /me` da inicialização: ali o 401 é resposta normal, não sinal de
   * que a sessão morreu.
   */
  skipAuthHandler?: boolean
}

function knownCode(code: string | undefined, status: number): ApiErrorCode {
  const codes: ApiErrorCode[] = [
    "unauthorized",
    "notFound",
    "unprocessable",
    "parameterMissing",
    "emailNotFound",
    "wrongPassword",
    "emailTaken",
    "resetTokenInvalid",
    "noCredits",
    "brandIncomplete",
    "brandNotPublished",
    "busy",
    "costCapReached",
    "conflict",
    "pieceLocked",
  ]
  if (code && (codes as string[]).includes(code)) return code as ApiErrorCode
  if (status === 401) return "unauthorized"
  if (status === 404) return "notFound"
  return "unknown"
}

export async function apiFetch<T>(path: string, init?: ApiInit): Promise<T> {
  const { skipAuthHandler, headers, ...rest } = init ?? {}
  const token = getToken()

  const merged = new Headers(headers)
  if (!merged.has("Content-Type") && !(rest.body instanceof FormData)) {
    merged.set("Content-Type", "application/json")
  }
  if (rest.body instanceof FormData) merged.delete("Content-Type")
  // Idioma por cabeçalho, não por `?locale=`: um parâmetro entraria na chave do
  // SWR e trocar de idioma invalidaria o cache inteiro sem necessidade.
  merged.set("Accept-Language", currentLanguage())
  if (token) merged.set("Authorization", `Bearer ${token}`)

  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, { ...rest, headers: merged })
  } catch {
    throw new ApiError({ status: 0, code: "network" })
  }

  if (!res.ok) {
    let envelope: ErrorEnvelope | undefined
    try {
      envelope = (await res.json()) as ErrorEnvelope
    } catch {
      /* corpo não-JSON (502 de proxy, por exemplo) */
    }

    const error = new ApiError({
      status: res.status,
      code: knownCode(envelope?.error?.code, res.status),
      field: envelope?.error?.field,
      details: envelope?.error?.details,
      serverMessage: envelope?.error?.message,
    })

    if (res.status === 401 && !skipAuthHandler) {
      clearToken()
      onUnauthorized?.()
    }

    throw error
  }

  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

/**
 * Baixa um arquivo da API com a sessão (o `Authorization` não vai num `<a
 * href>`): busca o blob e entrega ao navegador com o nome que o servidor deu.
 */
export async function apiDownload(path: string, fallbackName: string): Promise<void> {
  const token = getToken()
  const headers = new Headers({ "Accept-Language": currentLanguage() })
  if (token) headers.set("Authorization", `Bearer ${token}`)

  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, { headers })
  } catch {
    throw new ApiError({ status: 0, code: "network" })
  }
  if (!res.ok) throw new ApiError({ status: res.status, code: knownCode(undefined, res.status) })

  const disposition = res.headers.get("Content-Disposition") ?? ""
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallbackName
  const url = URL.createObjectURL(await res.blob())
  const link = document.createElement("a")
  link.href = url
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

/**
 * Um binário da API com a sessão — para imagem que não pode ir num `<img
 * src>` aberto (a miniatura privada da curadoria, por exemplo).
 */
export async function apiBlob(path: string): Promise<Blob> {
  const token = getToken()
  const headers = new Headers({ "Accept-Language": currentLanguage() })
  if (token) headers.set("Authorization", `Bearer ${token}`)

  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, { headers })
  } catch {
    throw new ApiError({ status: 0, code: "network" })
  }
  if (!res.ok) throw new ApiError({ status: res.status, code: knownCode(undefined, res.status) })
  return res.blob()
}

/* ---------- atalhos ---------- */

export function apiGet<T>(path: string, init?: ApiInit): Promise<T> {
  return apiFetch<T>(path, { ...init, method: "GET" })
}

export function apiPost<T>(path: string, body?: unknown, init?: ApiInit): Promise<T> {
  return apiFetch<T>(path, {
    ...init,
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export function apiPatch<T>(path: string, body?: unknown, init?: ApiInit): Promise<T> {
  return apiFetch<T>(path, {
    ...init,
    method: "PATCH",
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export function apiDelete<T>(path: string, init?: ApiInit): Promise<T> {
  return apiFetch<T>(path, { ...init, method: "DELETE" })
}
