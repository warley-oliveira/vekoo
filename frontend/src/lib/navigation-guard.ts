import type { Navigator, To } from "react-router"

// Segura a navegação sob o `BrowserRouter`, que não tem `useBlocker`. Quem usa é
// `useUnsavedChanges`; as telas nunca falam com este módulo.
//
// `Link` e `useNavigate` passam por `navigator.push` e `replace`, então basta trocá-los.
// O voltar do navegador não: chega como `popstate`, com a URL já mudada, e precisa ser
// desfeito antes que o roteador o veja. Só que no `window` os ouvintes de `popstate`
// disparam na ordem de registro, com ou sem `capture`: quem chega depois do roteador só
// roda com a tela já desmontada. Por isso o ouvinte abaixo nasce no carregamento deste
// módulo, que `lib/api.ts` importa justamente para vir antes do primeiro render.

export type PendingNavigation = {
  proceed: () => void
  reset: () => void
}

type Asker = (pending: PendingNavigation) => void

type Guard = {
  navigator: Navigator
  push: Navigator["push"]
  replace: Navigator["replace"]
  /** Caminho protegido. Mudar só a query (`?tab=`) não é sair dele. */
  path: string
  index: number
  /** Duas telas podem guardar ao mesmo tempo (a página e um painel). Responde a mais recente. */
  askers: Asker[]
}

let guard: Guard | null = null
let undoing = false

function currentIndex(): number {
  return window.history.state?.idx ?? 0
}

function ask(pending: PendingNavigation) {
  guard?.askers.at(-1)?.(pending)
}

function uninstall() {
  if (!guard) return

  guard.navigator.push = guard.push
  guard.navigator.replace = guard.replace
  guard = null
}

function pathnameOf(navigator: Navigator, to: To, currentPath: string) {
  // Sem `pathname` a navegação é relativa à página atual (`?tab=`, `#ancora`).
  if (typeof to !== "string" && to.pathname === undefined) return currentPath
  return new URL(navigator.createHref(to), window.location.href).pathname
}

function install(navigator: Navigator): Guard {
  const { push, replace } = navigator
  const installed: Guard = {
    navigator,
    push,
    replace,
    path: window.location.pathname,
    index: currentIndex(),
    askers: [],
  }

  navigator.push = (to, state, options) => {
    if (pathnameOf(navigator, to, installed.path) === installed.path) {
      push(to, state, options)
      installed.index = currentIndex()
      return
    }
    ask({
      proceed: () => {
        uninstall()
        push(to, state, options)
      },
      reset: () => {},
    })
  }

  navigator.replace = (to, state, options) => {
    if (pathnameOf(navigator, to, installed.path) === installed.path) {
      replace(to, state, options)
      return
    }
    ask({
      proceed: () => {
        uninstall()
        replace(to, state, options)
      },
      reset: () => {},
    })
  }

  return installed
}

/** Liga a guarda enquanto houver alteração; a função devolvida desliga. */
export function guardBrowserNavigation(navigator: Navigator, asker: Asker): () => void {
  guard ??= install(navigator)
  const owner = guard
  owner.askers.push(asker)

  return () => {
    owner.askers.splice(owner.askers.indexOf(asker), 1)
    if (guard === owner && owner.askers.length === 0) uninstall()
  }
}

window.addEventListener(
  "popstate",
  (event) => {
    if (undoing) {
      undoing = false
      event.stopImmediatePropagation()
      return
    }
    if (!guard) return

    const nextIndex = currentIndex()
    if (window.location.pathname === guard.path) {
      guard.index = nextIndex
      return
    }

    // Entrada sem índice, fora do roteador: `go(0)` recarregaria a página.
    const delta = nextIndex - guard.index
    if (delta === 0) return

    event.stopImmediatePropagation()
    undoing = true
    window.history.go(-delta)

    ask({
      proceed: () => {
        uninstall()
        window.history.go(delta)
      },
      reset: () => {},
    })
  },
  // `capture` para os navegadores que respeitam a fase no próprio `window`.
  true
)
