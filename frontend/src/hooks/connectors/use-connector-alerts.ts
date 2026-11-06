import { useEffect, useMemo, useRef } from "react"
import { mutate } from "swr"

import { useApi } from "@/hooks/use-api"
import { useAlerts, type AlertBadges } from "@/hooks/use-alerts"
import { apiPost } from "@/lib/api"
import type { ConnectorAlert } from "@/lib/connectors/types"

export const CONNECTOR_ALERTS_KEY = "/alerts/details?category=connectors"
const BADGES_KEY = "/alerts"

type AlertsResponse = { alerts: ConnectorAlert[] }

const NO_ALERTS: ConnectorAlert[] = []

/** Ligar, desligar e reconectar abrem e fecham avisos: o menu e a lista precisam saber. */
export function refreshConnectorAlerts() {
  void mutate(BADGES_KEY)
  void mutate(CONNECTOR_ALERTS_KEY)
}

/**
 * Os avisos que o número do menu conta. Vêm de `GET /alerts/details`, e o menu de
 * `GET /alerts`, que se atualiza por canal: quando o número muda, a lista acompanha.
 */
export function useConnectorAlerts() {
  const { badges } = useAlerts()
  const { data, error, isLoading, mutate: reload } = useApi<AlertsResponse>(CONNECTOR_ALERTS_KEY)

  const count = badges.connectors ?? 0
  const previous = useRef(count)
  useEffect(() => {
    if (previous.current === count) return
    previous.current = count
    void reload()
  }, [count, reload])

  const alerts = data?.alerts ?? NO_ALERTS

  const byConnector = useMemo(() => {
    const map = new Map<string, ConnectorAlert[]>()
    for (const alert of alerts) {
      map.set(alert.originId, [...(map.get(alert.originId) ?? []), alert])
    }
    return map
  }, [alerts])

  return { alerts, byConnector, count, error, isLoading, reload }
}

/**
 * Dispensa um aviso só, pelo `code`. A resposta traz os números novos, e o menu já
 * muda sem esperar o canal.
 */
export async function dismissConnectorAlert(alert: ConnectorAlert) {
  const { badges } = await apiPost<{ resolved: number; badges: AlertBadges }>("/alerts/resolve", {
    originType: alert.originType,
    originId: alert.originId,
    code: alert.code,
  })

  void mutate(BADGES_KEY, { badges }, { revalidate: false })
  void mutate<AlertsResponse>(
    CONNECTOR_ALERTS_KEY,
    (current) =>
      current && { ...current, alerts: current.alerts.filter((item) => item.id !== alert.id) },
    { revalidate: false }
  )
}
