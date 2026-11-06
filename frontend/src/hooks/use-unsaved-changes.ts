import { useCallback, useContext, useEffect, useState, type ContextType } from "react"
import {
  UNSAFE_DataRouterContext as DataRouterContext,
  UNSAFE_NavigationContext as NavigationContext,
} from "react-router"

import { guardBrowserNavigation, type PendingNavigation } from "@/lib/navigation-guard"

export type UnsavedChanges = {
  /** Uma navegação foi segurada e espera a decisão da pessoa. */
  blocked: boolean
  /** Sair mesmo assim. */
  proceed: () => void
  /** Ficar na página. */
  reset: () => void
}

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
  const [pending, setPending] = useState<PendingNavigation | null>(null)

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
      : guardBrowserNavigation(navigator, setPending)
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

function guardDataRouter(router: DataRouter, ask: (pending: PendingNavigation) => void) {
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
