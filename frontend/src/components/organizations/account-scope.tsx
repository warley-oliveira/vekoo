import { useEffect, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { RefreshCw } from "lucide-react"

import { AuthSplash } from "@/components/auth-guard"
import { Button } from "@/components/ui/button"
import { VekooMark } from "@/components/vekoo-mark"
import { accountPath, pickAccount } from "@/lib/account-scope"
import { ApiError } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { AccountRouteScope, Navigate, useLocation, useParams } from "@/lib/router"

/**
 * `/a/:account/*`: abre a organização da URL nesta aba e põe o prefixo em todos os caminhos de
 * dentro (`lib/router`). Enquanto `/me` daquela organização não volta, mostra a abertura; se ela
 * não for desta pessoa ou tiver sido revogada, `api.ts` já leva para a escolha de organização.
 */
export function AccountScope({ children }: { children: ReactNode }) {
  const { account: hashid = "" } = useParams()
  const { session, enterAccount } = useAuth()
  const [failed, setFailed] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const entered = session?.account.hashid === hashid

  useEffect(() => {
    if (entered || !hashid) return
    let cancelled = false
    enterAccount(hashid).catch((error: unknown) => {
      // Organização perdida e sessão vencida já navegaram; aqui sobra a rede.
      if (!cancelled && error instanceof ApiError && error.code === "network") setFailed(hashid)
    })
    return () => {
      cancelled = true
    }
  }, [entered, hashid, enterAccount, attempt])

  if (failed === hashid && !entered) {
    return (
      <EnterFailed
        onRetry={() => {
          setFailed(null)
          setAttempt((n) => n + 1)
        }}
      />
    )
  }
  if (!session || !entered) return <AuthSplash />

  return (
    <AccountRouteScope hashid={hashid}>
      {children}
      {/* {session.account.support && <SupportBanner organizationName={session.organization.name} />} */}
    </AccountRouteScope>
  )
}

function EnterFailed({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <VekooMark className="text-xl" />
      <div className="space-y-1.5">
        <h1 className="font-heading text-lg">{t("auth.boot.failedTitle")}</h1>
        <p className="max-w-sm text-sm text-muted-foreground">{t("auth.boot.failedDescription")}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw />
        {t("auth.boot.retry")}
      </Button>
    </div>
  )
}

/**
 * `/` e os links de antes da organização na URL (`/chat/123`): levam para a mesma tela na
 * organização lembrada, ou para a escolha, que volta para cá depois (`?next=`).
 */
export function AccountRedirect() {
  const { identity } = useAuth()
  const location = useLocation()
  if (!identity) return null

  const target = `${location.pathname}${location.search}${location.hash}`
  const hashid = pickAccount(identity.accounts)
  if (hashid) return <Navigate to={accountPath(hashid, target)} replace />

  const next = location.pathname === "/" ? "" : `?next=${encodeURIComponent(target)}`
  return <Navigate to={`/organizations${next}`} replace />
}
