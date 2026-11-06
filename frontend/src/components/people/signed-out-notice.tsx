import { useTranslation } from "react-i18next"

import { useAuth } from "@/lib/auth"
import { Callout } from "./callout"

/**
 * Na tela de entrada, diz por que a pessoa foi parar ali quando não foi ela quem saiu.
 * Sem isto, ter o acesso revogado no meio do trabalho parece só um defeito.
 */
export function SignedOutNotice() {
  const { t } = useTranslation()
  const { signedOutReason } = useAuth()

  if (!signedOutReason) return null

  return (
    <Callout tone={signedOutReason === "accessRevoked" ? "warning" : "neutral"} role="status">
      {t(`auth.errors.${signedOutReason}`)}
    </Callout>
  )
}
