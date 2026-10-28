import { useTranslation } from "react-i18next"
import { AlertTriangle } from "lucide-react"

import { useInstagramStatus, type InstagramStatus } from "@/admin/api"
import { formatDate } from "@/lib/format"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/** O primeiro prazo que vence: o do token ou o do acesso aos dados. */
function nextExpiry(status: InstagramStatus): number | null {
  const dates = [status.expiresAt, status.dataAccessExpiresAt].filter((value): value is number => Boolean(value))
  return dates.length ? Math.min(...dates) : null
}

/**
 * O aviso do token do Meta. Vence logo ou venceu: aparece em toda a curadoria
 * (a importação para quando ele vence). Não configurado: só nas telas de
 * importação (`showUnconfigured`) — o resto da curadoria não depende dele.
 */
export function InstagramTokenBanner({ showUnconfigured = false }: { showUnconfigured?: boolean }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const { data } = useInstagramStatus()

  if (!data) return null
  const visible = data.state === "expiring" || data.state === "invalid" || (showUnconfigured && data.state === "notConfigured")
  if (!visible) return null

  const expiry = nextExpiry(data)
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm",
        data.state === "invalid" ? "border-destructive/30 bg-destructive/5" : "bg-muted/40"
      )}
    >
      <AlertTriangle className={cn("size-4 shrink-0", data.state === "invalid" && "text-destructive")} aria-hidden />
      <div>
        <p className="font-medium">{t(`admin.instagram.token.${data.state}.title`)}</p>
        <p className="text-muted-foreground">
          {t(`admin.instagram.token.${data.state}.description`, { date: expiry ? formatDate(expiry, language) : "" })}
        </p>
        {data.missingScopes && data.missingScopes.length > 0 && (
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {t("admin.instagram.token.missingScopes", { scopes: data.missingScopes.join(", ") })}
          </p>
        )}
      </div>
    </div>
  )
}
