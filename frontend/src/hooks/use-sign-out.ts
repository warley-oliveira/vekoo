import { useCallback } from "react"
import { useNavigate } from "@/lib/router"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { useAuth } from "@/lib/auth"

/** Sair: navega já, porque o `DELETE /logout` é melhor esforço e não deve segurar. */
export function useSignOut() {
  const { t } = useTranslation()
  const { signOut } = useAuth()
  const navigate = useNavigate()

  return useCallback(() => {
    void signOut()
    navigate("/login", { replace: true })
    toast(t("account.signOutToast"))
  }, [navigate, signOut, t])
}
