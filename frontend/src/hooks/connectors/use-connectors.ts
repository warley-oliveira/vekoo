import { mutate } from "swr"
import type { SWRConfiguration } from "swr"

import { useApi } from "@/hooks/use-api"
import type {
  Connector,
  ConnectorResponse,
  ConnectorsResponse,
} from "@/lib/connectors/types"

export const CONNECTORS_KEY = "/connectors"

export function connectorKey(id: string) {
  return `/connectors/${id}`
}

export function connectorWidgetKey(id: string) {
  return `/connectors/${id}/widget`
}

export function useConnectors(config?: SWRConfiguration<ConnectorsResponse>) {
  return useApi<ConnectorsResponse>(CONNECTORS_KEY, config)
}

export function useConnector(
  id: string | null | undefined,
  config?: SWRConfiguration<ConnectorResponse>
) {
  return useApi<ConnectorResponse>(id ? connectorKey(id) : null, config)
}

/**
 * Guarda o conector que a API devolveu na lista e no detalhe, sem perguntar de novo. O
 * `mutate` também descarta leitura que ainda estava no ar, então uma resposta atrasada
 * não traz de volta o estado anterior à ação.
 */
export function storeConnector(connector: Connector) {
  void mutate<ConnectorsResponse>(
    CONNECTORS_KEY,
    (current) => {
      if (!current) return current
      const exists = current.connectors.some((item) => item.id === connector.id)
      return {
        ...current,
        connectors: exists
          ? current.connectors.map((item) => (item.id === connector.id ? connector : item))
          : [...current.connectors, connector],
      }
    },
    { revalidate: false }
  )

  void mutate<ConnectorResponse>(
    connectorKey(connector.id),
    (current) => ({ extras: current?.extras ?? {}, connector }),
    { revalidate: false }
  )
}

/** Depois de criar: a lista precisa conhecer o canal novo, venha ele como vier. */
export function reloadConnectors() {
  return mutate(CONNECTORS_KEY)
}
