// A organização desta aba.
//
// A sessão (o token) é da pessoa e vale em todas as abas. A organização é de cada aba: mora na
// URL (`/a/<hashid>/...`, o hashid do vínculo da pessoa com a organização) e é mandada em toda
// requisição (`X-Account`) e no WebSocket (`account=`). Duas abas em organizações diferentes
// funcionam ao mesmo tempo, porque cada uma tem o seu módulo, o seu cache e a sua conexão.
//
// Além da URL, guardamos:
//   - por aba (`sessionStorage`): a última organização desta aba, para `/` voltar para ela;
//   - no navegador (`localStorage`): a última usada em qualquer aba, para a aba nova e o login.
//
// Módulo sem React: `api.ts` e `cable.ts` leem daqui.

const TAB_KEY = "vekoo.account.tab"
const LAST_KEY = "vekoo.account.last"

/** O prefixo de toda tela da plataforma. */
export const ACCOUNT_PATH_PREFIX = "/a/"

let current: string | null = null
const listeners = new Set<(hashid: string | null) => void>()

/** O hashid da organização desta aba, ou `null` fora de uma organização. */
export function currentAccountHashid(): string | null {
  return current
}

export function setCurrentAccountHashid(hashid: string | null): void {
  if (hashid === current) return
  current = hashid
  if (hashid) rememberAccount(hashid)
  for (const listener of listeners) listener(hashid)
}

/** Avisa quando a aba troca de organização (o WebSocket troca de conexão). */
export function onAccountChange(listener: (hashid: string | null) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function read(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key)
  } catch {
    return null
  }
}

function write(storage: () => Storage, key: string, value: string | null): void {
  try {
    if (value) storage().setItem(key, value)
    else storage().removeItem(key)
  } catch {
    /* armazenamento indisponível: vale só a URL */
  }
}

function rememberAccount(hashid: string): void {
  write(() => sessionStorage, TAB_KEY, hashid)
  write(() => localStorage, LAST_KEY, hashid)
}

/** A última organização desta aba e, sem ela, a última do navegador. */
export function rememberedAccount(): { tab: string | null; last: string | null } {
  return { tab: read(() => sessionStorage, TAB_KEY), last: read(() => localStorage, LAST_KEY) }
}

/** A organização revogada ou removida não volta sozinha pela memória. */
export function forgetAccount(hashid: string): void {
  if (read(() => sessionStorage, TAB_KEY) === hashid) write(() => sessionStorage, TAB_KEY, null)
  if (read(() => localStorage, LAST_KEY) === hashid) write(() => localStorage, LAST_KEY, null)
}

/** Ao sair da sessão: a próxima pessoa neste navegador não herda a escolha. */
export function forgetAllAccounts(): void {
  write(() => sessionStorage, TAB_KEY, null)
  write(() => localStorage, LAST_KEY, null)
}

/** `/a/k3m9x2qp/chat/1` → `k3m9x2qp`. */
export function accountFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/a\/([^/]+)(?:\/|$)/)
  return match ? match[1] : null
}

/** `/a/k3m9x2qp/chat/1` → `/chat/1`. Caminho fora de organização volta como veio. */
export function stripAccountPath(pathname: string): string {
  const match = pathname.match(/^\/a\/[^/]+(\/.*)?$/)
  if (!match) return pathname
  return match[1] || "/"
}

/** Caminhos que não são de uma organização: entrada, conta e a escolha de organização. */
const ACCOUNT_FREE = [
  /^\/a\//,
  /^\/login(\/|$|\?)/,
  /^\/signup(\/|$|\?)/,
  /^\/forgot-password(\/|$|\?)/,
  /^\/reset-password(\/|$|\?)/,
  /^\/organizations(\/|$|\?)/,
  /^\/auth\//,
]

export function isAccountFreePath(path: string): boolean {
  return ACCOUNT_FREE.some((pattern) => pattern.test(path))
}

/** `/chat?x=1` na organização `k3m9x2qp` → `/a/k3m9x2qp/chat?x=1`. */
export function accountPath(hashid: string, path: string): string {
  if (!path.startsWith("/") || path.startsWith("//") || isAccountFreePath(path)) return path
  return `${ACCOUNT_PATH_PREFIX}${hashid}${path === "/" ? "" : path}`
}

/** Parece o id de um registro (`/chat/123`, `/folders/0b6f…`), e não o nome de uma área. */
const RECORD_SEGMENT = /\d/

/**
 * Para onde a troca de organização leva, dentro da outra: a mesma área (`/chat/123` → `/chat`,
 * `/settings/users/9` → `/settings/users`). O registro aberto é desta organização e não existe lá.
 */
export function switchTargetPath(pathname: string): string {
  const [first, second] = pathname.split("/").filter(Boolean)
  if (!first) return "/"
  if (first === "settings" && second && !RECORD_SEGMENT.test(second)) return `/${first}/${second}`
  return `/${first}`
}

/**
 * A organização para abrir sem a pessoa escolher: a última desta aba, a última do navegador ou a
 * única. Com mais de uma e nenhuma lembrada, `null`: a pessoa escolhe.
 */
export function pickAccount(accounts: { hashid: string }[]): string | null {
  const { tab, last } = rememberedAccount()
  for (const hashid of [tab, last]) {
    if (hashid && accounts.some((account) => account.hashid === hashid)) return hashid
  }
  return accounts.length === 1 ? accounts[0].hashid : null
}
