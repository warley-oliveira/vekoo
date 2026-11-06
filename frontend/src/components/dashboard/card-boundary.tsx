import { Component, type ErrorInfo, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { InlineError, SectionCard } from "@/components/shared"

type BoundaryProps = {
  /** Mudou de valor (outro período, dado novo): o erro é esquecido e o card tenta de novo. */
  resetKey: unknown
  fallback: (retry: () => void) => ReactNode
  children: ReactNode
}

type BoundaryState = { failed: boolean; resetKey: unknown }

class Boundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false, resetKey: this.props.resetKey }

  static getDerivedStateFromError(): Partial<BoundaryState> {
    return { failed: true }
  }

  static getDerivedStateFromProps(
    props: BoundaryProps,
    state: BoundaryState
  ): Partial<BoundaryState> | null {
    if (props.resetKey === state.resetKey) return null
    return { failed: false, resetKey: props.resetKey }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    if (import.meta.env.DEV) console.error("[dashboard]", error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return this.props.fallback(() => this.setState({ failed: false }))
  }
}

type CardBoundaryProps = {
  /** O nome do card, para a pessoa saber o que faltou. */
  title: string
  resetKey?: unknown
  className?: string
  children: ReactNode
}

/** Um card que quebra fica no lugar dele, com "tentar de novo", e o resto do Dashboard segue. */
export function CardBoundary({ title, resetKey, className, children }: CardBoundaryProps) {
  const { t } = useTranslation()

  return (
    <Boundary
      resetKey={resetKey}
      fallback={(retry) => (
        <SectionCard title={title} className={className}>
          <p className="sr-only">{t("dashboard.card.failed")}</p>
          <InlineError onRetry={retry} />
        </SectionCard>
      )}
    >
      {children}
    </Boundary>
  )
}
