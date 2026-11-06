import { useOptionalApi } from "@/hooks/use-api"
import { useChannel } from "@/hooks/use-channel"

/** Contagem de alertas ativos por área: `{ integrations: 2, webhooks: 1 }`. */
export type AlertBadges = Record<string, number>

type AlertsResponse = { badges: AlertBadges }

const KEY = "/alerts"
const EMPTY_RESPONSE: AlertsResponse = { badges: {} }
const NO_BADGES: AlertBadges = {}

/**
 * Os números do menu. Vêm de `GET /alerts` e se atualizam por
 * `OrganizationAlertsChannel`, que transmite o mesmo `{ badges }` a cada mudança.
 * Enquanto a API não existir, o 404 vale como "sem alertas".
 */
export function useAlerts() {
  const { data, mutate } = useOptionalApi<AlertsResponse>(KEY, EMPTY_RESPONSE, {
    // O canal já avisa quando muda: voltar à aba não precisa perguntar de novo.
    revalidateOnFocus: false,
  })

  useChannel<Partial<AlertsResponse>>(
    "OrganizationAlertsChannel",
    undefined,
    (message) => {
      if (message?.badges) {
        void mutate({ badges: message.badges }, { revalidate: false })
      }
    }
  )

  return { badges: data?.badges ?? NO_BADGES, reload: () => mutate() }
}
