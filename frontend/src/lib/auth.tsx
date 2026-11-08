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
import { useNavigate } from "@/lib/router"
import { useSWRConfig } from "swr"

import {
  forgetAccount,
  forgetAllAccounts,
  setCurrentAccountHashid,
} from "@/lib/account-scope"
import {
  ApiError,
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  setAccountLostHandler,
  setUnauthorizedHandler,
  type ApiErrorCode,
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
// Duas camadas:
//   - a **pessoa** (`identity`: `user` e as organizações dela, `accounts`), que vale em todas as
//     abas — o token é um só;
//   - a **organização desta aba** (`session`: o vínculo, a organização e o saldo), que mora na URL
//     (`/a/<hashid>/...`) e entra por `enterAccount`. Fora de uma organização, `session` é `null`.
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

/** A pessoa: identidade e login, iguais em todas as organizações dela. */
export type User = {
  id: string
  name: string
  email: string
  phone: string | null
  locale: string | null
  /** Caminho relativo à API: use `apiAssetUrl`. */
  avatarUrl: string | null
  /** Suporte do Vekoo: entra em qualquer organização. Só leitura. */
  master: boolean
  createdAt: number
}

/** Uma organização da pessoa, para escolher e trocar: o vínculo e o mínimo da organização. */
export type AccountSummary = {
  id: string
  /** O identificador da URL (`/a/<hashid>`) e do cabeçalho `X-Account`. */
  hashid: string
  role: MemberRole
  support: boolean
  lastSeenAt: number | null
  organization: OrganizationSummary
}

/** O que o seletor mostra de cada organização. */
export type OrganizationSummary = {
  id: string
  name: string
  /** Caminho relativo à API: use `apiAssetUrl`. */
  logoUrl: string | null
  plan: string
  /** Pessoas ativas; o suporte do Vekoo não conta. */
  membersCount: number
  creditsLeft: number
}

/**
 * O vínculo da pessoa com a organização desta aba. Nome, e-mail, telefone, idioma e foto são da
 * pessoa (valem em todas as organizações); papel, grupo e permissões são deste vínculo.
 */
export type Account = {
  id: string
  hashid: string
  userId: string
  /** O vínculo de suporte do Vekoo: aparece para o cliente como "Suporte Vekoo". */
  support: boolean
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

/** A pessoa da sessão, fora de qualquer organização. */
export type Identity = {
  user: User
  /** Os vínculos ativos, um por organização. O de suporte não entra. */
  accounts: AccountSummary[]
  expiresAt: number
}

/** A sessão dentro da organização desta aba. */
export type Session = Identity & {
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
type SessionPayload = Identity & {
  account: Account | null
  organization: Organization | null
  credits: Credits | null
  token?: string
}

/** Por que a aba saiu da organização sem a pessoa pedir. A escolha de organização explica. */
export type AccountLostReason = { code: ApiErrorCode; hashid: string | null }

function identityOf(payload: SessionPayload): Identity {
  return { user: payload.user, accounts: payload.accounts, expiresAt: payload.expiresAt }
}

function scopedOf(payload: SessionPayload): Session | null {
  if (!payload.account || !payload.organization || !payload.credits) return null
  return {
    ...identityOf(payload),
    account: payload.account,
    organization: payload.organization,
    credits: payload.credits,
  }
}

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
  /** A pessoa da sessão. `null` fora da sessão. */
  identity: Identity | null
  /** A sessão na organização desta aba. `null` fora de uma organização. */
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
  /** A aba perdeu a organização (vínculo revogado ou removido), e qual era. */
  accountLost: AccountLostReason | null
  /** Abre a organização `hashid` nesta aba: lê `/me` com ela e troca o cache. */
  enterAccount: (hashid: string) => Promise<void>
  /** A aba sai da organização (tela de escolha). A sessão continua. */
  leaveAccount: () => void
  /** Relê as organizações da pessoa (`GET /accounts`), depois de criar ou entrar numa. */
  refreshAccounts: () => Promise<AccountSummary[]>
  /**
   * Troca a conta ou a organização da sessão pelo que a API acabou de devolver: `/profile`
   * e `/organization` respondem no mesmo formato de `/me`. Sem nova requisição.
   */
  updateSession: (changes: Partial<Pick<Session, "account" | "organization">>) => void
  /** Lê `/me` de novo: as permissões da pessoa podem ter mudado. */
  refreshSession: () => Promise<void>
  signIn: (email: string, password: string) => Promise<Identity>
  /** Cria a pessoa, a organização e o vínculo de dono: devolve a organização nova. */
  signUp: (input: SignUpInput) => Promise<AccountSummary | null>
  signOut: () => Promise<void>
  /** Devolve o token de redefinição fora de produção — não há e-mail ainda. */
  requestPasswordReset: (email: string) => Promise<{ token?: string }>
  resetPassword: (token: string, password: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [accountLost, setAccountLost] = useState<AccountLostReason | null>(null)
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
  // A pessoa de agora, para quem ouve a troca de idioma, que acontece fora do React.
  const userRef = useRef<User | null>(null)
  // A organização que esta aba está abrindo ou abriu: a resposta de uma troca anterior não vale.
  const enteringRef = useRef<string | null>(null)

  /** Apaga tudo que era da conta anterior — cache do SWR inclusive. */
  const dropSession = useCallback(() => {
    clearToken()
    userRef.current = null
    enteringRef.current = null
    setCurrentAccountHashid(null)
    setIdentity(null)
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

  // A organização da aba sumiu para esta pessoa (revogada, removida, ou o link era de outra
  // pessoa): a aba sai dela e vai para a escolha. A sessão continua.
  useEffect(() => {
    setAccountLostHandler((code, hashid) => {
      if (hashid) forgetAccount(hashid)
      setAccountLost({ code, hashid })
      enteringRef.current = null
      setCurrentAccountHashid(null)
      setSession(null)
      void mutate(() => true, undefined, { revalidate: false })
      navigate("/organizations", { replace: true })
    })
    return () => setAccountLostHandler(null)
  }, [mutate, navigate])

  // O WebSocket acompanha a organização da aba: abre ao entrar nela, troca de conexão ao trocar
  // de organização ou de conta, e fecha fora de uma organização. É o único ponto que liga as duas.
  const cableToken = session ? getToken() : null
  const cableAccount = session?.account.hashid ?? null
  useEffect(() => {
    if (cableToken) openCable(cableToken, cableAccount)
    else closeCable()
  }, [cableToken, cableAccount])

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

  // O idioma é da pessoa: `PATCH /profile` grava no `User`, e vale em todas as organizações. A
  // gravação precisa de uma organização (a rota responde o vínculo); fora de uma, fica pendente
  // e vai na próxima vez que a pessoa abrir uma.
  const saveLanguage = useCallback((userId: string, language: string) => {
    apiPatch<Account>("/profile", { profile: { locale: language } })
      .then((account) => {
        forgetPendingLanguage()
        setSession((current) =>
          current?.account.id === account.id ? { ...current, account } : current
        )
        setIdentity((current) =>
          current && current.user.id === account.userId
            ? { ...current, user: { ...current.user, locale: account.locale } }
            : current
        )
      })
      .catch(() => {
        // A escolha continua valendo neste aparelho e vai para o servidor na próxima sessão.
        rememberPendingLanguage(userId, language)
      })
  }, [])

  /** Ao começar a sessão, vale o idioma da pessoa, exceto escolha local ainda não gravada. */
  const adoptUserLanguage = useCallback((user: User) => {
    const pending = pendingLanguage(user.id)
    if (pending && pending === user.locale) forgetPendingLanguage()

    const language = pending ?? supportedLanguage(user.locale)
    // Antes de trocar o idioma, para quem ouve a troca não achar que a pessoa escolheu.
    userRef.current = language ? { ...user, locale: language } : user
    if (language && language !== currentLanguage()) void i18n.changeLanguage(language)
  }, [])

  // Escolha pendente sobe assim que houver uma organização aberta (é lá que `/profile` responde).
  const scopedAccountId = session?.account.id
  useEffect(() => {
    const user = userRef.current
    if (!scopedAccountId || !user) return
    const pending = pendingLanguage(user.id)
    if (pending && pending !== identity?.user.locale) saveLanguage(user.id, pending)
  }, [scopedAccountId, identity?.user.locale, saveLanguage])

  // Vale para os dois menus e para o perfil: todos trocam o idioma do mesmo jeito. Com a
  // sessão aberta, o idioma só muda por escolha da pessoa.
  const userId = identity?.user.id
  useEffect(() => {
    if (!userId) return

    function onLanguageChanged(language: string) {
      const user = userRef.current
      if (!user || user.locale === language) return

      userRef.current = { ...user, locale: language }
      saveLanguage(user.id, language)
    }

    i18n.on("languageChanged", onLanguageChanged)
    return () => i18n.off("languageChanged", onLanguageChanged)
  }, [userId, saveLanguage])

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
        adoptUserLanguage(payload.user)
        setIdentity(identityOf(payload))
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
  }, [bootAttempt, adoptUserLanguage])

  const retryBoot = useCallback(() => {
    setReady(false)
    setBootAttempt((n) => n + 1)
  }, [])

  const start = useCallback(
    (payload: SessionPayload): Identity => {
      if (payload.token) setToken(payload.token)
      const next = identityOf(payload)
      setSignedOutReason(null)
      setAccountLost(null)
      adoptUserLanguage(next.user)
      setIdentity(next)
      return next
    },
    [adoptUserLanguage]
  )

  const enterAccount = useCallback(
    async (hashid: string) => {
      if (enteringRef.current === hashid) return
      enteringRef.current = hashid
      // O cache do SWR é por caminho, sem saber de qual organização é o dado: ao trocar, esvazia.
      setSession(null)
      void mutate(() => true, undefined, { revalidate: false })
      setCurrentAccountHashid(hashid)
      try {
        const payload = await apiGet<SessionPayload>("/me")
        if (enteringRef.current !== hashid) return
        const scoped = scopedOf(payload)
        if (!scoped) return
        // Um idioma recém-escolhido pode estar a caminho: a escolha é mais nova que esta leitura.
        const locale = userRef.current?.locale ?? scoped.account.locale
        setIdentity(identityOf(payload))
        setAccountLost(null)
        setSession({ ...scoped, account: { ...scoped.account, locale } })
      } catch (error) {
        // O 401 e a organização perdida já foram tratados em `api.ts`; sem rede, tenta de novo.
        if (enteringRef.current === hashid) enteringRef.current = null
        throw error
      }
    },
    [mutate]
  )

  const leaveAccount = useCallback(() => {
    if (enteringRef.current === null && !session) return
    enteringRef.current = null
    setCurrentAccountHashid(null)
    setSession(null)
    void mutate(() => true, undefined, { revalidate: false })
  }, [mutate, session])

  const refreshAccounts = useCallback(async () => {
    const { accounts } = await apiGet<{ accounts: AccountSummary[] }>("/accounts")
    setIdentity((current) => (current ? { ...current, accounts } : current))
    setSession((current) => (current ? { ...current, accounts } : current))
    return accounts
  }, [])

  const updateSession = useCallback(
    (changes: Partial<Pick<Session, "account" | "organization">>) => {
      const account = changes.account
      if (account && userRef.current) {
        userRef.current = { ...userRef.current, name: account.name, locale: account.locale }
      }
      setSession((current) => (current ? { ...current, ...changes } : current))
      // A identidade é da pessoa: o que o perfil gravou vale para a lista de organizações também.
      if (account) {
        setIdentity((current) =>
          current && current.user.id === account.userId
            ? {
                ...current,
                user: {
                  ...current.user,
                  name: account.name,
                  phone: account.phone,
                  locale: account.locale,
                  avatarUrl: account.avatarUrl,
                },
              }
            : current
        )
      }
      // O nome da organização aparece no seletor e na escolha de organização.
      const organization = changes.organization
      if (organization) {
        const rename = (accounts: AccountSummary[]) =>
          accounts.map((item) =>
            item.organization.id === organization.id
              ? { ...item, organization: { ...item.organization, name: organization.name, logoUrl: organization.logoUrl } }
              : item
          )
        setIdentity((current) => (current ? { ...current, accounts: rename(current.accounts) } : current))
        setSession((current) => (current ? { ...current, accounts: rename(current.accounts) } : current))
      }
    },
    []
  )

  const refreshSession = useCallback(async () => {
    const payload = await apiGet<SessionPayload>("/me")
    // Saiu enquanto a leitura vinha: esta resposta não pode ressuscitar a sessão.
    if (!userRef.current || userRef.current.id !== payload.user.id) return
    setIdentity(identityOf(payload))
    const scoped = scopedOf(payload)
    if (!scoped) return
    // Um idioma recém-escolhido pode estar a caminho: a escolha é mais nova que esta leitura.
    const merged = { ...scoped.account, locale: userRef.current.locale }
    setSession((current) =>
      current && current.account.id === scoped.account.id ? { ...scoped, account: merged } : current
    )
  }, [])

  const signIn = useCallback(
    async (email: string, password: string): Promise<Identity> => {
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
    async (input: SignUpInput): Promise<AccountSummary | null> => {
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
        const next = start(payload)
        return next.accounts.find((item) => item.hashid === payload.account?.hashid) ?? null
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
    forgetAllAccounts()
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
      identity,
      session,
      ready,
      bootError,
      retryBoot,
      signingOut,
      signedOutReason,
      accountLost,
      enterAccount,
      leaveAccount,
      refreshAccounts,
      updateSession,
      refreshSession,
      signIn,
      signUp,
      signOut,
      requestPasswordReset,
      resetPassword,
    }),
    [
      identity,
      session,
      ready,
      bootError,
      retryBoot,
      signingOut,
      signedOutReason,
      accountLost,
      enterAccount,
      leaveAccount,
      refreshAccounts,
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

/** Sessão garantida — para telas que só existem dentro de uma organização. */
export function useSession(): Session {
  const { session } = useAuth()
  if (!session) throw new Error("useSession usado fora de uma organização")
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
