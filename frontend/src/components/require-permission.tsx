import { useEffect, type ReactNode } from "react"
import { Navigate } from "@/lib/router"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { useCan, useCanAccess } from "@/hooks/use-can"
import type { PermissionKey } from "@/lib/auth"
import { firstAllowedPath } from "@/lib/navigation"

type RequirePermissionProps = {
  permission: PermissionKey
  /**
   * O que mostrar para quem não tem acesso, inclusive `null` para sumir com um
   * pedaço da tela. Sem esta prop, é guarda de rota: a pessoa é levada para a
   * primeira área que pode ver e recebe um aviso.
   */
  fallback?: ReactNode
  children: ReactNode
}

/**
 * Esconde o que a pessoa não pode ver. É interface: a API continua dizendo 403, e
 * é ela quem garante.
 *
 *     <RequirePermission permission="campaigns"><CampaignsPage /></RequirePermission>
 *     <RequirePermission permission="core_settings" fallback={null}><Button /></RequirePermission>
 */
export function RequirePermission({
  permission,
  fallback,
  children,
}: RequirePermissionProps) {
  const allowed = useCan(permission)

  if (allowed) return <>{children}</>
  if (fallback !== undefined) return <>{fallback}</>
  return <ForbiddenRedirect />
}

function ForbiddenRedirect() {
  const { t } = useTranslation()
  const can = useCanAccess()

  useEffect(() => {
    // Com `id`: o efeito roda duas vezes no StrictMode e o aviso é um só.
    toast(t("navigation.forbidden"), { id: "navigation-forbidden" })
  }, [t])

  return <Navigate to={firstAllowedPath(can)} replace />
}

/** `/`: a primeira área que a pessoa pode ver. Dashboard, para quem tem acesso. */
export function RootRedirect() {
  const can = useCanAccess()
  return <Navigate to={firstAllowedPath(can)} replace />
}
