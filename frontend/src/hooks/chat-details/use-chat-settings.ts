import { useCallback, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { apiPatch } from "@/lib/api"
import { useAuth, type Session } from "@/lib/auth"
import type { ChatSettings } from "@/lib/chat-details/types"

/**
 * As preferências da organização, em `/organization/chat-settings`. Moram na sessão, que é de onde o
 * composer lê a regra da etiqueta de espera: é a resposta que vale, e ela atualiza os dois.
 */
export function useChatSettings() {
  const { t } = useTranslation()
  const { session, updateSession } = useAuth()
  const [pending, setPending] = useState<ChatSettings>({})

  const saved = (session?.organization.settings as { chatSettings?: ChatSettings } | undefined)
    ?.chatSettings

  const update = useCallback(
    async (changes: ChatSettings) => {
      setPending((current) => ({ ...current, ...changes }))
      try {
        const organization = await apiPatch<Session["organization"]>(
          "/organization/chat-settings",
          { chatSettings: changes }
        )
        updateSession({ organization })
        toast.success(t("chatDetails.preferences.saved"))
      } catch {
        toast.error(t("chatDetails.preferences.failed"))
      } finally {
        setPending((current) => {
          const next = { ...current }
          for (const key of Object.keys(changes)) delete next[key as keyof ChatSettings]
          return next
        })
      }
    },
    [t, updateSession]
  )

  return { settings: { ...saved, ...pending }, update }
}
