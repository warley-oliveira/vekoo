import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useNavigate } from "react-router"
import { useSWRConfig } from "swr"

import {
  ApiError,
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  setUnauthorizedHandler,
} from "@/lib/api"
import { clearToken, getToken, setToken } from "@/lib/token"

// A sessão de quem está usando, servida pelo Rails.
//
// O token viaja em `Authorization: Bearer` e mora em `lib/token.ts` — o
// backend documenta a troca futura por cookie httpOnly, que custa aquele
// arquivo e nenhuma tela.
//
// Módulo sem idioma: os erros são **códigos** (`auth.errors.<code>` na tela).
// A única exceção é `serverMessage`, que já vem traduzido pelo Rails e serve de
// rede de segurança para validação que a tela não enumerou.

export type PlanCode = "free"

export type Organization = {
  id: string
  /** Nome da organização — criado no cadastro, amanhã editável. */
  name: string
  /** Código do plano; o rótulo visível vem de `plans.<plan>`. */
  plan: PlanCode
  createdAt: number
}

/** Papel dentro da organização. Existe já pensando em convidar pessoas. */
export type MemberRole = "owner" | "member"

export type Account = {
  id: string
  name: string
  email: string
  organizationId: string
  role: MemberRole
  createdAt: number
}

export type Credits = { total: number; used: number; left: number }

export type Session = {
  account: Account
  organization: Organization
  /**
   * Saldo no momento em que a sessão foi lida. É **semente** do
   * `useCredits()` — a fonte viva é a chave `/credits`, que muda a cada
   * geração.
   */
  credits: Credits
  expiresAt: number
}

/** O que `POST /login`, `POST /signup` e `GET /me` devolvem. */
type SessionPayload = Session & { token?: string }

/**
 * Erro de autenticação. Carrega o campo alvo e um **código** — a mensagem é
 * traduzida na tela (`auth.errors.<code>`), nunca aqui.
 */
export type AuthErrorCode =
  | "emailNotFound"
  | "wrongPassword"
  | "emailTaken"
  | "signInFailed"
  | "signUpFailed"
  | "network"

export class AuthError extends Error {
  field: "name" | "email" | "password" | "organizationName" | "form"
  code: AuthErrorCode
  /** Mensagem do Rails, já no idioma da requisição. A tela prefere a sua. */
  serverMessage?: string

  constructor(
    field: AuthError["field"],
    code: AuthErrorCode,
    serverMessage?: string
  ) {
    super(serverMessage || code)
    this.name = "AuthError"
    this.field = field
    this.code = code
    this.serverMessage = serverMessage
  }
}

/* ---------- conta de demonstração ---------- */

// Existe de verdade: `backend/db/seeds.rb` cria esta conta com esta senha.
export const DEMO_CREDENTIALS = {
  email: "marina.duarte@exemplo.com.br",
  password: "carrossel123",
}

/* ---------- tradução dos erros da API ---------- */

const FORM_FIELDS = new Set(["name", "email", "password", "organizationName"])

function fieldOf(error: ApiError): AuthError["field"] {
  const field = error.field
  if (field && FORM_FIELDS.has(field)) return field as AuthError["field"]
  return "form"
}

/** Primeira mensagem do 422 para o campo em destaque. */
function detailFor(error: ApiError, field: string): string | undefined {
  return error.details?.[field]?.[0]
}

function toAuthError(error: unknown, fallback: AuthErrorCode): AuthError {
  if (!(error instanceof ApiError)) return new AuthError("form", fallback)
  if (error.code === "network") return new AuthError("form", "network")

  // Códigos que a tela conhece pelo nome e trata no campo certo.
  if (error.code === "emailNotFound") return new AuthError("email", "emailNotFound")
  if (error.code === "wrongPassword") return new AuthError("password", "wrongPassword")
  if (error.code === "emailTaken") return new AuthError("email", "emailTaken")

  // Validação: o Rails já manda os campos em camelCase, iguais aos do
  // formulário, então a mensagem dele é melhor do que um genérico nosso.
  if (error.code === "unprocessable" || error.code === "parameterMissing") {
    const field = fieldOf(error)
    return new AuthError(
      field,
      fallback,
      field === "form" ? error.serverMessage : detailFor(error, field) ?? error.serverMessage
    )
  }

  return new AuthError("form", fallback)
}

/* ---------- contexto ---------- */

type SignUpInput = {
  name: string
  email: string
  password: string
  organizationName: string
}

type AuthContextValue = {
  session: Session | null
  /** false enquanto o `GET /me` da abertura não respondeu. */
  ready: boolean
  /**
   * A API não respondeu na abertura (servidor fora do ar, sem rede). Não é o
   * mesmo que estar deslogado: mandar a pessoa para o login aqui a faria
   * digitar a senha contra um servidor morto.
   */
  bootError: boolean
  retryBoot: () => void
  signIn: (email: string, password: string) => Promise<Session>
  signUp: (input: SignUpInput) => Promise<Session>
  signOut: () => Promise<void>
  /** Devolve o token de redefinição fora de produção — não há e-mail ainda. */
  requestPasswordReset: (email: string) => Promise<{ token?: string }>
  resetPassword: (token: string, password: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [bootError, setBootError] = useState(false)
  const [bootAttempt, setBootAttempt] = useState(0)
  const navigate = useNavigate()
  const { mutate } = useSWRConfig()

  // Cinco requisições paralelas tomando 401 não podem virar cinco navegações.
  const expiring = useRef(false)

  /** Apaga tudo que era da conta anterior — cache do SWR inclusive. */
  const dropSession = useCallback(() => {
    clearToken()
    setSession(null)
    // Sem isto, quem entrar em seguida vê por um instante os carrosséis de quem
    // saiu: as chaves do SWR são globais e não sabem de quem é o dado.
    void mutate(() => true, undefined, { revalidate: false })
  }, [mutate])

  // Reação ao 401 vindo de qualquer requisição. Registrada de fora porque
  // `api.ts` não pode importar este módulo.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (expiring.current) return
      expiring.current = true
      dropSession()
      const target = `${window.location.pathname}${window.location.search}`
      const next = target === "/" ? "" : `?next=${encodeURIComponent(target)}`
      navigate(`/login${next}`, { replace: true })
      // Solta a trava no próximo tick, quando a rajada de 401 já passou.
      setTimeout(() => {
        expiring.current = false
      }, 0)
    })
    return () => setUnauthorizedHandler(null)
  }, [dropSession, navigate])

  // Abertura: quem já tem token continua de onde parou.
  useEffect(() => {
    const token = getToken()
    if (!token) {
      setReady(true)
      return
    }

    let cancelled = false
    setBootError(false)
    // `skipAuthHandler`: aqui o 401 é resposta normal (token velho), não sessão
    // que expirou no meio do uso — não deve redirecionar nem tocar no cache.
    apiGet<SessionPayload>("/me", { skipAuthHandler: true })
      .then((payload) => {
        if (!cancelled) setSession(payload)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        if (error instanceof ApiError && error.code === "network") {
          setBootError(true)
        } else {
          clearToken()
        }
      })
      .finally(() => {
        if (!cancelled) setReady(true)
      })

    return () => {
      cancelled = true
    }
  }, [bootAttempt])

  const retryBoot = useCallback(() => {
    setReady(false)
    setBootAttempt((n) => n + 1)
  }, [])

  const start = useCallback((payload: SessionPayload): Session => {
    if (payload.token) setToken(payload.token)
    const next: Session = {
      account: payload.account,
      organization: payload.organization,
      credits: payload.credits,
      expiresAt: payload.expiresAt,
    }
    setSession(next)
    return next
  }, [])

  const signIn = useCallback(
    async (email: string, password: string): Promise<Session> => {
      try {
        const payload = await apiPost<SessionPayload>(
          "/login",
          { session: { email, password } },
          { skipAuthHandler: true }
        )
        return start(payload)
      } catch (error) {
        throw toAuthError(error, "signInFailed")
      }
    },
    [start]
  )

  const signUp = useCallback(
    async (input: SignUpInput): Promise<Session> => {
      try {
        const payload = await apiPost<SessionPayload>(
          "/signup",
          {
            account: {
              name: input.name.trim(),
              email: input.email.trim(),
              password: input.password,
              organizationName: input.organizationName.trim(),
            },
          },
          { skipAuthHandler: true }
        )
        return start(payload)
      } catch (error) {
        throw toAuthError(error, "signUpFailed")
      }
    },
    [start]
  )

  const signOut = useCallback(async () => {
    // Melhor esforço: o token já vai ser jogado fora de qualquer jeito, e
    // travar a saída porque a rede caiu seria pior do que uma sessão órfã que
    // vence em 30 dias.
    try {
      await apiDelete("/logout")
    } catch {
      /* segue */
    }
    dropSession()
  }, [dropSession])

  const requestPasswordReset = useCallback(async (email: string) => {
    // O Rails responde 202 exista o e-mail ou não — não vazamos cadastro.
    return apiPost<{ status: string; token?: string }>("/password-resets", {
      passwordReset: { email: email.trim() },
    })
  }, [])

  const resetPassword = useCallback(async (token: string, password: string) => {
    // O Rails derruba todas as sessões da conta ao trocar a senha, então quem
    // acabou de redefinir precisa entrar de novo — de propósito.
    await apiPatch(`/password-resets/${encodeURIComponent(token)}`, {
      passwordReset: { password },
    })
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      ready,
      bootError,
      retryBoot,
      signIn,
      signUp,
      signOut,
      requestPasswordReset,
      resetPassword,
    }),
    [
      session,
      ready,
      bootError,
      retryBoot,
      signIn,
      signUp,
      signOut,
      requestPasswordReset,
      resetPassword,
    ]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth precisa estar dentro de <AuthProvider>")
  return ctx
}

/** Sessão garantida — para telas que só existem depois de entrar. */
export function useSession(): Session {
  const { session } = useAuth()
  if (!session) throw new Error("useSession usado fora de uma área autenticada")
  return session
}

/** "Marina Duarte" → "MD"; "Doma Store" → "DS". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ""
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ""
  return (first + last).toUpperCase() || "?"
}

/**
 * Sugere o nome da organização a partir do nome da pessoa. O sufixo vem
 * traduzido de fora (`auth.signup.organizationSuffix`).
 */
export function suggestOrganizationName(
  personName: string,
  suffix: string
): string {
  const name = personName.trim()
  if (!name) return ""
  return `${name.split(/\s+/).slice(0, 2).join(" ")} ${suffix}`.trim()
}
