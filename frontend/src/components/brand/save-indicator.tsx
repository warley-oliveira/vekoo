import { useTranslation } from "react-i18next"
import { AlertCircle, Check, Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

export type SaveStatus = "idle" | "saving" | "saved" | "error"

type SaveIndicatorProps = { status: SaveStatus; onRetry?: () => void; className?: string }

/** "Salvando… / Rascunho salvo / Não foi possível salvar" — sempre visível. */
export function SaveIndicator({ status, onRetry, className }: SaveIndicatorProps) {
  const { t } = useTranslation()

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", className)}
    >
      {status === "saving" && (
        <>
          <Loader2 className="size-3.5 animate-spin" /> {t("brand.save.saving")}
        </>
      )}
      {status === "saved" && (
        <>
          <Check className="size-3.5" /> {t("brand.save.saved")}
        </>
      )}
      {status === "idle" && t("brand.save.idle")}
      {status === "error" && (
        <>
          <AlertCircle className="size-3.5 text-destructive" />
          <span className="text-destructive">{t("brand.save.error")}</span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded font-medium text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {t("brand.save.retry")}
            </button>
          )}
        </>
      )}
    </div>
  )
}
