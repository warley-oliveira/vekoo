import { Component, type ErrorInfo, type ReactNode } from "react"
import { useLocation } from "@/lib/router"
import { useTranslation } from "react-i18next"

import { ErrorState } from "@/components/error-state"
import { isChunkLoadError } from "@/lib/chunk-error"

// `<BrowserRouter>` não tem `errorElement`: o limite de erro é nosso. Fica por rota, para
// uma tela quebrada não levar o menu junto.

type BoundaryProps = {
  /** Mudou de valor: o erro é esquecido, para a próxima rota não abrir quebrada. */
  resetKey: string
  children: ReactNode
}

type BoundaryState = { hasError: boolean; error: unknown; resetKey: string }

class Boundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = {
    hasError: false,
    error: null,
    resetKey: this.props.resetKey,
  }

  static getDerivedStateFromError(error: unknown): Partial<BoundaryState> {
    return { hasError: true, error }
  }

  static getDerivedStateFromProps(
    props: BoundaryProps,
    state: BoundaryState
  ): Partial<BoundaryState> | null {
    if (props.resetKey === state.resetKey) return null
    return { hasError: false, error: null, resetKey: props.resetKey }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    if (import.meta.env.DEV) console.error("[rota]", error, info.componentStack)
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <RouteError
        error={this.state.error}
        onRetry={() => this.setState({ hasError: false, error: null })}
      />
    )
  }
}

function RouteError({
  error,
  onRetry,
}: {
  error: unknown
  onRetry: () => void
}) {
  const { t } = useTranslation()
  const stale = isChunkLoadError(error)

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-6">
      <ErrorState
        error={error}
        title={t(stale ? "navigation.error.staleTitle" : "navigation.error.title")}
        description={t(
          stale
            ? "navigation.error.staleDescription"
            : "navigation.error.description"
        )}
        onRetry={stale ? () => window.location.reload() : onRetry}
      />
    </div>
  )
}

/** Limite de erro que se recompõe sozinho ao trocar de caminho. */
export function RouteBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  return <Boundary resetKey={pathname}>{children}</Boundary>
}
