import { useCallback, useContext, useEffect, useState, type ContextType } from "react"
import {
  UNSAFE_DataRouterContext as DataRouterContext,
  UNSAFE_NavigationContext as NavigationContext,
  type Navigator,
  type To,
} from "react-router"

export type UnsavedChanges = {
  /** Uma navegação foi segurada e espera a decisão da pessoa. */
  blocked: boolean
  /** Sair mesmo assim. */
  proceed: () => void
  /** Ficar na página. */
  reset: () => void
}

type Pending = { proceed: () => void; reset: () => void }

/**
 * Segura a saída da tela enquanto houver alteração sem salvar: fechar a aba,
 * trocar de rota e o botão voltar. Trocar só a query (`?tab=`) não conta como
 * sair, para abas e filtros não dispararem o aviso.
 *
 * Quase sempre use `<UnsavedChangesDialog when={isDirty} />`, que já faz a
 * pergunta. Este hook é para quem precisa de outra apresentação.
 *
 * O `useBlocker` do React Router só existe em data router e lança erro sob o
 * `BrowserRouter` do app; aqui os dois casos funcionam, para a troca de roteador
 * não quebrar nenhuma tela.
 */
export function useUnsavedChanges(when: boolean): UnsavedChanges {
  const router = useContext(DataRouterContext)?.router
  const { navigator } = useContext(NavigationContext)
  const [pending, setPending] = useState<Pending | null>(null)

  // Salvou com a pergunta aberta: a pergunta some junto com a guarda.
  const [guarding, setGuarding] = useState(when)
  if (guarding !== when) {
    setGuarding(when)
    if (!when) setPending(null)
  }

  useEffect(() => {
    if (!when) return

    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [when])

  useEffect(() => {
    if (!when) return
    return router
      ? guardDataRouter(router, setPending)
      : guardBrowserRouter(navigator, setPending)
  }, [navigator, router, when])

  const proceed = useCallback(() => {
    pending?.proceed()
    setPending(null)
  }, [pending])

  const reset = useCallback(() => {
    pending?.reset()
    setPending(null)
  }, [pending])

  return { blocked: pending !== null, proceed, reset }
}

/* ---------- data router (createBrowserRouter) ---------- */

type DataRouter = NonNullable<ContextType<typeof DataRouterContext>>["router"]

let blockerId = 0

function guardDataRouter(router: DataRouter, ask: (pending: Pending) => void) {
  const key = `unsaved-changes-${++blockerId}`

  router.getBlocker(
    key,
    ({ currentLocation, nextLocation }) =>
      currentLocation.pathname !== nextLocation.pathname
  )

  const unsubscribe = router.subscribe((state) => {
    const blocker = state.blockers.get(key)
    if (blocker?.state === "blocked") {
      ask({
        proceed: () => blocker.proceed?.(),
        reset: () => blocker.reset?.(),
      })
    }
  })

  return () => {
    unsubscribe()
    router.deleteBlocker(key)
  }
}

/* ---------- BrowserRouter ---------- */

type Asker = (pending: Pending) => void

// Uma instalação só por navigator, compartilhada: com duas guardas ativas (a página
// e um painel, ambos com alteração) cada uma substituindo `push` por conta própria,
// a ordem de limpeza pode deixar um bloqueio órfão, e aí nada mais navega. Quem
// responde é a guarda mais recente, que é o que está na frente da pessoa.
const browserGuards = new Map<Navigator, { askers: Asker[]; uninstall: () => void }>()

function guardBrowserRouter(navigator: Navigator, ask: Asker) {
  let guard = browserGuards.get(navigator)
  if (!guard) {
    const askers: Asker[] = []
    const uninstall = interceptNavigation(navigator, (pending) => askers.at(-1)?.(pending))
    guard = { askers, uninstall }
    browserGuards.set(navigator, guard)
  }
  const { askers, uninstall } = guard
  askers.push(ask)

  return () => {
    askers.splice(askers.indexOf(ask), 1)
    if (askers.length === 0) {
      uninstall()
      browserGuards.delete(navigator)
    }
  }
}

// `Link` e `useNavigate` passam por `navigator.push` e `replace`. O voltar do
// navegador não: chega como `popstate`, com a URL já trocada, e precisa ser desfeito
// antes que o roteador o veja (por isso a captura).
function interceptNavigation(navigator: Navigator, ask: Asker) {
  const { push, replace } = navigator
  const path = window.location.pathname
  let index: number = window.history.state?.idx ?? 0
  let undoing = false

  const uninstall = () => {
    navigator.push = push
    navigator.replace = replace
    window.removeEventListener("popstate", onPopState, true)
  }

  const onPopState = (event: PopStateEvent) => {
    if (undoing) {
      undoing = false
      event.stopImmediatePropagation()
      return
    }

    const nextIndex: number = window.history.state?.idx ?? 0
    if (window.location.pathname === path) {
      index = nextIndex
      return
    }

    event.stopImmediatePropagation()
    const delta = nextIndex - index
    undoing = true
    window.history.go(-delta)

    ask({
      proceed: () => {
        uninstall()
        window.history.go(delta)
      },
      reset: () => {},
    })
  }

  const pathnameOf = (to: To) => {
    // Sem `pathname` a navegação é relativa à página atual (`?tab=`, `#ancora`).
    if (typeof to !== "string" && to.pathname === undefined) return path
    return new URL(navigator.createHref(to), window.location.href).pathname
  }

  navigator.push = (to, state, options) => {
    if (pathnameOf(to) === path) {
      push(to, state, options)
      index = window.history.state?.idx ?? index
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
    if (pathnameOf(to) === path) {
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

  window.addEventListener("popstate", onPopState, true)

  return uninstall
}
