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
import { closeCable, openCable, setClosedByServerHandler } from "@/lib/cable"
import i18n, { currentLanguage } from "@/lib/i18n"
import {
  forgetPendingLanguage,
  pendingLanguage,
  rememberPendingLanguage,
  supportedLanguage,
} from "@/lib/people/account-language"
import { unsubscribeDevice } from "@/lib/push"
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
  /** Fuso IANA da organização (`America/Sao_Paulo`). */
  timezone: string
  /** Liberações por organização: mapa livre, vem como está do servidor. */
  features: Record<string, unknown>
  /** Dados da empresa e preferências: mapa livre (`companyInfo`, `chatSettings`). */
  settings: Record<string, unknown>
  /** Caminho relativo à API: use `apiAssetUrl`. */
  logoUrl: string | null
  createdAt: number
}

/** Papel dentro da organização. Existe já pensando em convidar pessoas. */
export type MemberRole = "owner" | "member"

/** As mesmas chaves de `AccessRole::KEYS`, no Rails. */
export type PermissionKey =
  | "dashboard"
  | "custom_dashboards"
  | "flows"
  | "calendar"
  | "pipelines"
  | "chat"
  | "chat_list_to"
  | "contacts"
  | "catalog"
  | "funnel"
  | "campaigns"
  | "core_settings"

/** `none` nega; qualquer outro nível dá acesso. Para decidir, use `useCan`. */
export type PermissionLevel = "none" | "all" | (string & {})

export type Account = {
  id: string
  name: string
  email: string
  organizationId: string
  role: MemberRole
  phone: string | null
  /** `pt-BR`, `en` ou nulo. */
  locale: string | null
  /** Caminho relativo à API: use `apiAssetUrl`. */
  avatarUrl: string | null
  accessRoleId: string | null
  /** Sempre vem em `GET /me`. Chave ausente é tratada como `none`. */
  permissions: Partial<Record<PermissionKey, PermissionLevel>>
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
  | "accessRevoked"
  | "emailTaken"
  | "signInFailed"
  | "signUpFailed"
  | "network"

/** Por que a sessão acabou sem a pessoa pedir. A tela de entrada explica. */
export type SignedOutReason = "accessRevoked" | "sessionExpired"

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
  if (error.code === "accessRevoked") return new AuthError("form", "accessRevoked")
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
  /**
   * A saída começou: a tela já foi para o login, mas o token ainda vale até as chamadas
   * de saída terminarem. Quem decide por "tem sessão?" ignora esta sessão nesse meio-tempo.
   */
  signingOut: boolean
  /** A sessão acabou sem a pessoa pedir (acesso revogado, por exemplo), e por quê. */
  signedOutReason: SignedOutReason | null
  /**
   * Troca a conta ou a organização da sessão pelo que a API acabou de devolver: `/profile`
   * e `/organization` respondem no mesmo formato de `/me`. Sem nova requisição.
   */
  updateSession: (changes: Partial<Pick<Session, "account" | "organization">>) => void
  /** Lê `/me` de novo: as permissões da pessoa podem ter mudado. */
  refreshSession: () => Promise<void>
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
  const [signingOut, setSigningOut] = useState(false)
  const [signedOutReason, setSignedOutReason] = useState<SignedOutReason | null>(null)
  const navigate = useNavigate()
  const { mutate } = useSWRConfig()

  // Cinco requisições paralelas tomando 401 não podem virar cinco navegações.
  const expiring = useRef(false)
  // Sair de propósito não é sessão que acabou, mesmo que o `/logout` responda 401.
  const leaving = useRef(false)
  // A conta de agora, para quem ouve a troca de idioma, que acontece fora do React.
  const accountRef = useRef<Account | null>(null)

  /** Apaga tudo que era da conta anterior — cache do SWR inclusive. */
  const dropSession = useCallback(() => {
    clearToken()
    accountRef.current = null
    setSession(null)
    // Sem isto, quem entrar em seguida vê por um instante os carrosséis de quem
    // saiu: as chaves do SWR são globais e não sabem de quem é o dado.
    void mutate(() => true, undefined, { revalidate: false })
  }, [mutate])

  // Reação ao 401 vindo de qualquer requisição. Registrada de fora porque
  // `api.ts` não pode importar este módulo.
  useEffect(() => {
    setUnauthorizedHandler((code) => {
      if (expiring.current) return
      expiring.current = true
      if (!leaving.current) {
        setSignedOutReason(code === "accessRevoked" ? "accessRevoked" : "sessionExpired")
      }
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

  // O WebSocket acompanha a sessão: abre ao entrar, troca de token ao trocar de
  // conta e fecha ao sair. É o único ponto que liga as duas coisas.
  const cableToken = session ? getToken() : null
  useEffect(() => {
    if (cableToken) openCable(cableToken)
    else closeCable()
  }, [cableToken])

  // O servidor derrubou o WebSocket de propósito: a sessão acabou. Sem isto, quem está
  // parado numa tela só descobriria no próximo clique. Quem diz o motivo é a API: o 401
  // desta leitura cai no tratamento de sempre, acima.
  useEffect(() => {
    setClosedByServerHandler(() => {
      apiGet("/me").catch(() => {
        /* o 401 já foi tratado; sem rede, a próxima requisição resolve */
      })
    })
    return () => setClosedByServerHandler(null)
  }, [])

  /* ---------- idioma da pessoa ---------- */

  const saveLanguage = useCallback((accountId: string, language: string) => {
    apiPatch<Account>("/profile", { profile: { locale: language } })
      .then((account) => {
        forgetPendingLanguage()
        setSession((current) =>
          current?.account.id === account.id ? { ...current, account } : current
        )
      })
      .catch(() => {
        // A escolha continua valendo neste aparelho e vai para o servidor na próxima sessão.
        rememberPendingLanguage(accountId, language)
      })
  }, [])

  /** Ao começar a sessão, vale o idioma da conta, exceto escolha local ainda não gravada. */
  const adoptAccountLanguage = useCallback(
    (account: Account) => {
      const pending = pendingLanguage(account.id)
      if (pending && pending !== account.locale) saveLanguage(account.id, pending)
      if (pending && pending === account.locale) forgetPendingLanguage()

      const language = pending ?? supportedLanguage(account.locale)
      // Antes de trocar o idioma, para quem ouve a troca não achar que a pessoa escolheu.
      accountRef.current = language ? { ...account, locale: language } : account
      if (language && language !== currentLanguage()) void i18n.changeLanguage(language)
    },
    [saveLanguage]
  )

  // Vale para os dois menus e para o perfil: todos trocam o idioma do mesmo jeito. Com a
  // sessão aberta, o idioma só muda por escolha da pessoa.
  const accountId = session?.account.id
  useEffect(() => {
    if (!accountId) return

    function onLanguageChanged(language: string) {
      const account = accountRef.current
      if (!account || account.locale === language) return

      accountRef.current = { ...account, locale: language }
      saveLanguage(account.id, language)
    }

    i18n.on("languageChanged", onLanguageChanged)
    return () => i18n.off("languageChanged", onLanguageChanged)
  }, [accountId, saveLanguage])

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
        if (cancelled) return
        adoptAccountLanguage(payload.account)
        setSession(payload)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        if (error instanceof ApiError && error.code === "network") {
          setBootError(true)
        } else {
          if (error instanceof ApiError && error.code === "accessRevoked") {
            setSignedOutReason("accessRevoked")
          }
          clearToken()
        }
      })
      .finally(() => {
        if (!cancelled) setReady(true)
      })

    return () => {
      cancelled = true
    }
  }, [bootAttempt, adoptAccountLanguage])

  const retryBoot = useCallback(() => {
    setReady(false)
    setBootAttempt((n) => n + 1)
  }, [])

  const start = useCallback(
    (payload: SessionPayload): Session => {
      if (payload.token) setToken(payload.token)
      const next: Session = {
        account: payload.account,
        organization: payload.organization,
        credits: payload.credits,
        expiresAt: payload.expiresAt,
      }
      setSignedOutReason(null)
      adoptAccountLanguage(next.account)
      setSession(next)
      return next
    },
    [adoptAccountLanguage]
  )

  const updateSession = useCallback(
    (changes: Partial<Pick<Session, "account" | "organization">>) => {
      if (changes.account) accountRef.current = changes.account
      setSession((current) => (current ? { ...current, ...changes } : current))
    },
    []
  )

  const refreshSession = useCallback(async () => {
    const { account, organization, credits, expiresAt } =
      await apiGet<SessionPayload>("/me")
    // Saiu enquanto a leitura vinha: esta resposta não pode ressuscitar a sessão.
    if (accountRef.current?.id !== account.id) return
    // Um idioma recém-escolhido pode estar a caminho: a escolha é mais nova que esta leitura.
    const merged = { ...account, locale: accountRef.current.locale }
    accountRef.current = merged
    setSession({ account: merged, organization, credits, expiresAt })
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
    leaving.current = true
    setSignedOutReason(null)
    setSigningOut(true)
    // Melhor esforço: o token já vai ser jogado fora de qualquer jeito, e
    // travar a saída porque a rede caiu seria pior do que uma sessão órfã que
    // vence em 30 dias.
    try {
      // Antes do logout, enquanto o token vale: aparelho desvinculado é o que impede
      // a próxima pessoa neste navegador de receber os avisos desta conta.
      await unsubscribeDevice()
    } catch {
      /* segue */
    }
    try {
      await apiDelete("/logout")
    } catch {
      /* segue */
    }
    dropSession()
    setSigningOut(false)
    leaving.current = false
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
      signingOut,
      signedOutReason,
      updateSession,
      refreshSession,
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
      signingOut,
      signedOutReason,
      updateSession,
      refreshSession,
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
