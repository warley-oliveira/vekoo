import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

// Autenticação fictícia da etapa 1 — front-only, tudo em localStorage.
// A forma dos dados é a que o Rails vai expor depois (conta pertence a uma
// organização; quem cria a conta entra como dono), então trocar este módulo
// por chamadas reais não deve mexer nas telas.
//
// ⚠️ A senha fica em texto puro no navegador de propósito: é dado de mentira
// de um protótipo. No backend real nada disso existe — hash no servidor,
// sessão em cookie httpOnly.

const STORAGE_KEY = "vekoo.auth.v1"

export type PlanCode = "free"

export type Organization = {
  id: string
  /** Nome da organização — hoje sempre criado no cadastro, amanhã editável. */
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
  password: string
  organizationId: string
  role: MemberRole
  createdAt: number
}

export type Session = {
  account: Account
  organization: Organization
}

type AuthData = {
  organizations: Organization[]
  accounts: Account[]
  currentAccountId: string | null
}

/**
 * Erro de autenticação. Carrega o campo alvo e um **código** — a mensagem é
 * traduzida na tela (`auth.errors.<code>`), nunca aqui: este módulo não tem
 * (nem deve ter) idioma.
 */
export type AuthErrorCode =
  | "emailNotFound"
  | "wrongPassword"
  | "emailTaken"
  | "signInFailed"
  | "signUpFailed"

export class AuthError extends Error {
  field: "name" | "email" | "password" | "organizationName" | "form"
  code: AuthErrorCode

  constructor(field: AuthError["field"], code: AuthErrorCode) {
    super(code)
    this.field = field
    this.code = code
  }
}

/* ---------- conta de demonstração ---------- */

export const DEMO_CREDENTIALS = {
  email: "marina.duarte@exemplo.com.br",
  password: "carrossel123",
}

function buildSeed(now: number): AuthData {
  const organization: Organization = {
    id: "org-marina",
    name: "Marina Duarte Conteúdo",
    plan: "free",
    createdAt: now - 30 * 24 * 3_600_000,
  }
  const account: Account = {
    id: "conta-marina",
    name: "Marina Duarte",
    email: DEMO_CREDENTIALS.email,
    password: DEMO_CREDENTIALS.password,
    organizationId: organization.id,
    role: "owner",
    createdAt: organization.createdAt,
  }
  return {
    organizations: [organization],
    accounts: [account],
    // Ninguém entra automaticamente: a tela de entrada é o começo do fluxo.
    currentAccountId: null,
  }
}

function load(): AuthData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as AuthData
  } catch {
    /* estado corrompido → re-semeia */
  }
  return buildSeed(Date.now())
}

function save(data: AuthData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    /* armazenamento indisponível: segue só em memória */
  }
}

/** Espera fingida para as telas exercitarem estado de carregando de verdade. */
function delay(ms = 650): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

let idCounter = 0
function newId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`
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
  /** false só durante a leitura inicial do localStorage. */
  ready: boolean
  signIn: (email: string, password: string) => Promise<Session>
  signUp: (input: SignUpInput) => Promise<Session>
  signOut: () => void
  requestPasswordReset: (email: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AuthData | null>(null)

  useEffect(() => {
    setData(load())
  }, [])

  const update = useCallback((next: AuthData) => {
    save(next)
    setData(next)
  }, [])

  const session = useMemo<Session | null>(() => {
    if (!data?.currentAccountId) return null
    const account = data.accounts.find((a) => a.id === data.currentAccountId)
    const organization = account
      ? data.organizations.find((o) => o.id === account.organizationId)
      : undefined
    if (!account || !organization) return null
    return { account, organization }
  }, [data])

  const signIn = useCallback(
    async (email: string, password: string): Promise<Session> => {
      await delay()
      const current = data ?? load()
      const account = current.accounts.find(
        (a) => a.email === normalizeEmail(email)
      )
      if (!account) {
        throw new AuthError("email", "emailNotFound")
      }
      if (account.password !== password) {
        throw new AuthError("password", "wrongPassword")
      }
      const organization = current.organizations.find(
        (o) => o.id === account.organizationId
      )!
      update({ ...current, currentAccountId: account.id })
      return { account, organization }
    },
    [data, update]
  )

  const signUp = useCallback(
    async (input: SignUpInput): Promise<Session> => {
      await delay(850)
      const current = data ?? load()
      const email = normalizeEmail(input.email)
      if (current.accounts.some((a) => a.email === email)) {
        throw new AuthError("email", "emailTaken")
      }
      const now = Date.now()
      // Criar conta cria a organização — é ela que vai receber as pessoas
      // convidadas mais adiante, e todo carrossel nasce dentro dela.
      const organization: Organization = {
        id: newId("org"),
        name: input.organizationName.trim(),
        plan: "free",
        createdAt: now,
      }
      const account: Account = {
        id: newId("account"),
        name: input.name.trim(),
        email,
        password: input.password,
        organizationId: organization.id,
        role: "owner",
        createdAt: now,
      }
      update({
        organizations: [...current.organizations, organization],
        accounts: [...current.accounts, account],
        currentAccountId: account.id,
      })
      return { account, organization }
    },
    [data, update]
  )

  const signOut = useCallback(() => {
    const current = data ?? load()
    update({ ...current, currentAccountId: null })
  }, [data, update])

  const requestPasswordReset = useCallback(async (email: string) => {
    await delay()
    // De propósito não dizemos se o e-mail existe (não vazamos cadastro).
    void email
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      ready: data !== null,
      signIn,
      signUp,
      signOut,
      requestPasswordReset,
    }),
    [session, data, signIn, signUp, signOut, requestPasswordReset]
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
