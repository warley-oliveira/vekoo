import { currentAccountHashid } from "@/lib/account-scope"
import { currentLanguage } from "@/lib/i18n"
import { clearToken, getToken } from "@/lib/token"
// Pelo efeito colateral: precisa rodar antes do primeiro render, para ouvir o `popstate`
// antes do roteador. Este módulo é carregado por `auth.tsx`, antes de `main.tsx` montar.
import "@/lib/navigation-guard"

// Cliente da API do Rails.
//
// O backend responde sempre no mesmo formato — sucesso em camelCase com datas
// em milissegundos, erro como `{ error: { code, field?, message, details? } }`.
// `code` é o contrato de máquina (a tela decide o que fazer por ele) e
// `message` já vem no idioma da requisição, como rede de segurança para
// códigos que a tela não enumerou.

/** Origem da API. O WebSocket parte dela também (ver `lib/cable.ts`). */
export const API_URL: string =
  import.meta.env.VITE_API_URL ?? "http://localhost:3040"

/** Imagem servida pela API (`avatarUrl`, `logoUrl`): o caminho vem relativo a ela. */
export function apiAssetUrl(path: string): string {
  return /^https?:/.test(path) ? path : `${API_URL}${path}`
}

/**
 * Códigos que a API pode devolver, mais dois sintéticos do cliente
 * (`network` e `unknown`) — para a tela ter um só vocabulário de erro.
 *
 * A lista é só a dos comuns: o código de cada domínio passa direto, e a tela compara
 * com o que estiver em `docs/migration/api/<dominio>.md` (`error.code === "lastOwner"`).
 */
export type ApiErrorCode =
  | "unauthorized"
  | "accessRevoked"
  | "forbidden"
  | "notFound"
  | "unprocessable"
  | "parameterMissing"
  | "emailNotFound"
  | "wrongPassword"
  | "emailTaken"
  | "resetTokenInvalid"
  | "noCredits"
  | "tooManyRequests"
  | "accountNotFound"
  | "accountRevoked"
  | "accountRequired"
  | "network"
  | "unknown"
  | (string & {})

type ErrorEnvelope = {
  error?: {
    code?: string
    field?: string
    message?: string
    details?: Record<string, string[]>
  }
}

/** O `meta` das listagens paginadas: `{ <recurso>: [...], meta }`. */
export type PaginationMeta = {
  page: number
  perPage: number
  total: number
  totalPages: number
  hasMore: boolean
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
// reação ao 401 é registrada de fora. O código diz por que a sessão acabou: acesso
// revogado e sessão vencida pedem recados diferentes.
type UnauthorizedHandler = (code: ApiErrorCode) => void
let onUnauthorized: UnauthorizedHandler | null = null

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  onUnauthorized = handler
}

/* ---------- organização perdida ---------- */

// A sessão vale, mas a organização desta aba não: o vínculo foi revogado ou removido (ou o hashid
// da URL nunca foi desta pessoa). A aba sai da organização e cai na escolha. Mesmo desenho do 401.
const ACCOUNT_LOST = new Set<ApiErrorCode>(["accountNotFound", "accountRevoked", "accountRequired"])
type AccountLostHandler = (code: ApiErrorCode, hashid: string | null) => void
let onAccountLost: AccountLostHandler | null = null

export function setAccountLostHandler(handler: AccountLostHandler | null) {
  onAccountLost = handler
}

function reactToFailure(error: ApiError, skipAuthHandler: boolean | undefined, hashid: string | null) {
  if (skipAuthHandler) return
  if (error.status === 401) {
    clearToken()
    onUnauthorized?.(error.code)
  } else if (ACCOUNT_LOST.has(error.code) && hashid === currentAccountHashid()) {
    // Só se a aba ainda está naquela organização: a resposta atrasada de antes da troca não conta.
    onAccountLost?.(error.code, hashid)
  }
}

/** Os cabeçalhos de toda requisição: idioma, sessão e a organização da aba. */
function sessionHeaders(set: (name: string, value: string) => void): string | null {
  // Idioma por cabeçalho, não por `?locale=`: um parâmetro entraria na chave do
  // SWR e trocar de idioma invalidaria o cache inteiro sem necessidade.
  set("Accept-Language", currentLanguage())
  const token = getToken()
  if (token) set("Authorization", `Bearer ${token}`)
  const hashid = currentAccountHashid()
  if (hashid) set("X-Account", hashid)
  return hashid
}

export type ApiInit = RequestInit & {
  /**
   * Não trate o 401 como sessão expirada. Vale para entrar, criar conta e para
   * o `GET /me` da inicialização: ali o 401 é resposta normal, não sinal de
   * que a sessão morreu.
   */
  skipAuthHandler?: boolean
}

/** O código que veio do servidor; sem ele (502 de proxy, por exemplo), pelo status. */
function codeOf(code: string | undefined, status: number): ApiErrorCode {
  if (code) return code
  if (status === 401) return "unauthorized"
  if (status === 403) return "forbidden"
  if (status === 404) return "notFound"
  if (status === 429) return "tooManyRequests"
  return "unknown"
}

function toApiError(status: number, envelope: ErrorEnvelope | undefined) {
  return new ApiError({
    status,
    code: codeOf(envelope?.error?.code, status),
    field: envelope?.error?.field,
    details: envelope?.error?.details,
    serverMessage: envelope?.error?.message,
  })
}

export async function apiFetch<T>(path: string, init?: ApiInit): Promise<T> {
  const { skipAuthHandler, headers, ...rest } = init ?? {}

  const merged = new Headers(headers)
  if (!merged.has("Content-Type") && !(rest.body instanceof FormData)) {
    merged.set("Content-Type", "application/json")
  }
  if (rest.body instanceof FormData) merged.delete("Content-Type")
  const explicit = merged.get("X-Account")
  const hashid = sessionHeaders((name, value) => merged.set(name, value))
  // Quem chama pode escolher a organização (a tela de escolha lendo `/me` de outra).
  if (explicit) merged.set("X-Account", explicit)

  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, { ...rest, headers: merged })
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

    const error = toApiError(res.status, envelope)
    reactToFailure(error, skipAuthHandler, explicit ?? hashid)
    throw error
  }

  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

/**
 * Para quem faz `fetch` ou `XMLHttpRequest` próprio (SSE, download, upload do editor): os mesmos
 * cabeçalhos de sessão e de organização que o cliente manda.
 */
export function sessionRequestHeaders(): Record<string, string> {
  const headers: Record<string, string> = {}
  sessionHeaders((name, value) => {
    headers[name] = value
  })
  return headers
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

export function apiPut<T>(path: string, body?: unknown, init?: ApiInit): Promise<T> {
  return apiFetch<T>(path, {
    ...init,
    method: "PUT",
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export function apiDelete<T>(path: string, init?: ApiInit): Promise<T> {
  return apiFetch<T>(path, { ...init, method: "DELETE" })
}

/* ---------- envio de arquivo ---------- */

export type ApiUploadOptions = {
  /** Fração já enviada, de 0 a 1. */
  onProgress?: (fraction: number) => void
  /** Cancela o envio; a promessa rejeita com `AbortError`. */
  signal?: AbortSignal
  method?: "POST" | "PUT" | "PATCH"
  skipAuthHandler?: boolean
}

/**
 * Envio com progresso. Por `XMLHttpRequest` porque `fetch` não informa quanto do
 * corpo já subiu. Mesmo contrato de `apiFetch`: resolve com o JSON e rejeita com
 * `ApiError`.
 */
export function apiUpload<T>(
  path: string,
  formData: FormData,
  { onProgress, signal, method = "POST", skipAuthHandler }: ApiUploadOptions = {}
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"))
      return
    }

    const xhr = new XMLHttpRequest()
    const abort = () => xhr.abort()
    signal?.addEventListener("abort", abort, { once: true })
    const settle = () => signal?.removeEventListener("abort", abort)

    xhr.open(method, `${API_URL}${path}`)
    // Sem Content-Type: é o navegador quem escreve o `boundary` do multipart.
    const hashid = sessionHeaders((name, value) => xhr.setRequestHeader(name, value))

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress?.(event.loaded / event.total)
      }
    }

    xhr.onload = () => {
      settle()
      let body: unknown
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : undefined
      } catch {
        /* corpo não-JSON (502 de proxy, por exemplo) */
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as T)
        return
      }

      const error = toApiError(xhr.status, body as ErrorEnvelope | undefined)
      reactToFailure(error, skipAuthHandler, hashid)
      reject(error)
    }
    xhr.onerror = () => {
      settle()
      reject(new ApiError({ status: 0, code: "network" }))
    }
    xhr.onabort = () => {
      settle()
      reject(new DOMException("Aborted", "AbortError"))
    }

    xhr.send(formData)
  })
}
