import { Navigate, Outlet, useLocation } from "react-router"

import { VekooMark } from "@/components/app-sidebar"
import { useAuth } from "@/lib/auth"

// Guardas de rota. Enquanto a sessão é lida do localStorage não decidimos nada
// — redirecionar antes disso jogaria quem já está logado para a tela de entrada
// a cada recarregamento.

export function RequireAuth() {
  const { session, ready } = useAuth()
  const location = useLocation()

  if (!ready) return <AuthSplash />
  if (!session) {
    // Guarda para onde a pessoa queria ir, para voltar depois de entrar.
    const target = `${location.pathname}${location.search}`
    const next = target === "/" ? "" : `?next=${encodeURIComponent(target)}`
    return <Navigate to={`/login${next}`} replace />
  }
  return <Outlet />
}

/** Quem já entrou não precisa ver login/cadastro de novo. */
export function RedirectIfAuthenticated() {
  const { session, ready } = useAuth()

  if (!ready) return <AuthSplash />
  if (session) return <Navigate to="/" replace />
  return <Outlet />
}

function AuthSplash() {
  return (
    <div className="flex h-dvh items-center justify-center">
      <VekooMark className="animate-pulse text-xl" />
    </div>
  )
}
