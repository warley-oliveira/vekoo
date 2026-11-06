import { useTranslation } from "react-i18next"

import { connectorTypeKey, hasRealName, pauseDiscardsMessages } from "@/lib/connectors/channels"
import type { Connector } from "@/lib/connectors/types"

/**
 * Os textos que dependem do canal. Enquanto não há perfil, o `name` é interno da instância
 * (`IWA-6aee...`): a pessoa vê o tipo, e o que está faltando vem no estado, nunca o id.
 */
export function useConnectorTexts() {
  const { t } = useTranslation()

  function typeLabel(connector: Connector) {
    return t(`connectors.types.${connectorTypeKey(connector)}`)
  }

  function title(connector: Connector) {
    return hasRealName(connector) ? connector.name : typeLabel(connector)
  }

  function statusLabel(connector: Connector) {
    return t(`connectors.status.${connector.status}.label`)
  }

  /** O que este estado quer dizer para quem atende, nesta linguagem. */
  function statusHint(connector: Connector) {
    if (connector.status === "active") return null
    if (connector.status === "paused" && pauseDiscardsMessages(connector)) {
      return t("connectors.status.paused.hintDiscards")
    }
    return t(`connectors.status.${connector.status}.hint`)
  }

  return { typeLabel, title, statusLabel, statusHint }
}
