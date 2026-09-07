import { useTranslation } from "react-i18next"
import { Navigate, Outlet, useLocation, useSearchParams } from "react-router"
import { RefreshCw } from "lucide-react"

import { VekooMark } from "@/components/app-sidebar"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth"

// Guardas de rota. Enquanto a sessão não foi resolvida não decidimos nada —
// redirecionar antes disso jogaria quem já está logado para a tela de entrada a
// cada recarregamento.

export function RequireAuth() {
  const { session, ready, bootError } = useAuth()
  const location = useLocation()

  if (!ready) return <AuthSplash />
  // Servidor fora do ar não é sessão inválida: mandar para o login faria a
  // pessoa digitar a senha contra uma API que não responde.
  if (bootError) return <BootError />
  if (!session) {
    // Guarda para onde a pessoa queria ir, para voltar depois de entrar.
    const target = `${location.pathname}${location.search}`
    const next = target === "/" ? "" : `?next=${encodeURIComponent(target)}`
    return <Navigate to={`/login${next}`} replace />
  }
  return <Outlet />
}

/**
 * Destino local a voltar depois de entrar. Só caminho do próprio site: um
 * `next` absoluto (ou `//outro-site`) viraria redirecionamento aberto — quem
 * manda o link escolheria para onde a pessoa vai depois de digitar a senha.
 */
export function safeNext(raw: string | null): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return null
  return raw
}

/**
 * Quem já entrou não precisa ver login/cadastro de novo.
 *
 * O `?next=` é lido aqui **também**, e não só na tela de entrada: quando a
 * sessão nasce, esta guarda re-renderiza junto com a navegação que a tela
 * pediu, e a última a decidir vence. Com as duas apontando para o mesmo lugar,
 * quem vier de uma rota protegida volta para ela — em vez de cair na
 * biblioteca, como acontecia.
 */
export function RedirectIfAuthenticated() {
  const { session, ready } = useAuth()
  const [searchParams] = useSearchParams()

  if (!ready) return <AuthSplash />
  if (session) return <Navigate to={safeNext(searchParams.get("next")) ?? "/"} replace />
  return <Outlet />
}

function AuthSplash() {
  return (
    <div className="flex h-dvh items-center justify-center">
      <VekooMark className="animate-pulse text-xl" />
    </div>
  )
}

function BootError() {
  const { t } = useTranslation()
  const { retryBoot } = useAuth()

  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <VekooMark className="text-xl" />
      <div className="space-y-1.5">
        <h1 className="font-heading text-lg">{t("auth.boot.failedTitle")}</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          {t("auth.boot.failedDescription")}
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={retryBoot}>
        <RefreshCw />
        {t("auth.boot.retry")}
      </Button>
    </div>
  )
}
