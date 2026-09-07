import { useTranslation } from "react-i18next"
import { RefreshCw, Unplug } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ApiError } from "@/lib/api"

type ErrorStateProps = {
  /** O erro que veio do SWR — decide a mensagem. */
  error?: unknown
  title?: string
  description?: string
  onRetry?: () => void
  className?: string
}

/**
 * Irmão do `EmptyState`, para quando o dado **existe** mas não chegou.
 *
 * Erro de leitura é tela, não toast: o toast some sozinho e deixa a pessoa
 * olhando uma lista vazia sem saber que a lista não é vazia, é ilegível. Aqui
 * ela lê o que houve e tem um botão para insistir.
 */
export function ErrorState({
  error,
  title,
  description,
  onRetry,
  className,
}: ErrorStateProps) {
  const { t } = useTranslation()

  // Sem rede é o caso comum e tem recado próprio; o resto cai no genérico.
  const detail =
    error instanceof ApiError && error.code === "network"
      ? t("errors.network")
      : description ?? t("errors.loadFailedDescription")

  return (
    <div
      role="alert"
      className={
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-10 text-center " +
        (className ?? "")
      }
    >
      <Unplug className="size-5 text-muted-foreground" />
      <div className="space-y-1">
        <h3 className="text-sm font-medium">{title ?? t("errors.loadFailedTitle")}</h3>
        <p className="max-w-sm text-sm text-muted-foreground">{detail}</p>
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw />
          {t("errors.retry")}
        </Button>
      ) : null}
    </div>
  )
}

/** Versão de uma linha, para cantos apertados (sidebar, menu de avisos). */
export function InlineError({ onRetry }: { onRetry?: () => void }) {
  const { t } = useTranslation()

  return (
    <div className="flex items-center justify-between gap-2 px-2 py-1.5 text-xs text-muted-foreground">
      <span>{t("errors.loadFailedTitle")}</span>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="rounded font-medium text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {t("errors.retry")}
        </button>
      ) : null}
    </div>
  )
}
