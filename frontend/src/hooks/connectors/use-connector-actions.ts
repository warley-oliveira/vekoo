import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { mutate } from "swr"

import { useConfirm } from "@/components/shared"
import { apiPatch, apiPost } from "@/lib/api"
import {
  connectorErrorMessage,
  connectorTypeKey,
  hasRealName,
  pauseDiscardsMessages,
} from "@/lib/connectors/channels"
import type { Connector, WidgetConfig } from "@/lib/connectors/types"
import { refreshConnectorAlerts } from "./use-connector-alerts"
import { connectorWidgetKey, storeConnector } from "./use-connectors"

type ConnectorResult = { connector: Connector }

/**
 * As ações que não pedem nada além de um clique: retomar, pausar, recarregar, desligar e
 * desconectar. Toda resposta passa por aqui, porque um `200` não quer dizer que deu certo:
 * o provedor pode recusar e o canal voltar `failed`, e é o `status` que manda.
 */
export function useConnectorActions() {
  const { t } = useTranslation()
  const confirm = useConfirm()

  function nameOf(connector: Connector) {
    return hasRealName(connector) ? connector.name : t(`connectors.types.${connectorTypeKey(connector)}`)
  }

  async function post(connector: Connector, action: string) {
    const result = await apiPost<ConnectorResult>(`/connectors/${connector.id}/${action}`)
    storeConnector(result.connector)
    refreshConnectorAlerts()
    return result.connector
  }

  /** Tira da pausa. Reativar pode falhar no provedor, e aí responde 422. */
  async function resume(connector: Connector) {
    try {
      const updated = await post(connector, "activate")
      if (updated.status === "active") {
        toast.success(t("connectors.resume.done", { name: nameOf(updated) }))
      } else {
        toast.error(t("connectors.resume.failed"), {
          description: updated.errorMessage ?? undefined,
        })
      }
    } catch (error) {
      toast.error(t("connectors.resume.failed"), {
        description: connectorErrorMessage(error, t),
      })
    }
  }

  async function pause(connector: Connector) {
    const discards = pauseDiscardsMessages(connector)
    const confirmed = await confirm({
      title: t("connectors.pause.title", { name: nameOf(connector) }),
      description: t(discards ? "connectors.pause.discards" : "connectors.pause.keeps"),
      confirmLabel: t(discards ? "connectors.pause.confirmDiscards" : "connectors.pause.confirm"),
      destructive: discards,
      onConfirm: () => post(connector, "pause"),
    })
    if (confirmed) toast.success(t("connectors.pause.done", { name: nameOf(connector) }))
  }

  async function reload(connector: Connector) {
    const confirmed = await confirm({
      title: t("connectors.reload.title", { name: nameOf(connector) }),
      description: t("connectors.reload.description"),
      confirmLabel: t("connectors.reload.confirm"),
      onConfirm: () => post(connector, "reload"),
    })
    if (confirmed) toast.success(t("connectors.reload.done"))
  }

  async function shutdown(connector: Connector) {
    const confirmed = await confirm({
      title: t("connectors.shutdown.title", { name: nameOf(connector) }),
      description: t("connectors.shutdown.description"),
      confirmLabel: t("connectors.shutdown.confirm"),
      destructive: true,
      onConfirm: () => post(connector, "shutdown"),
    })
    if (confirmed) toast.success(t("connectors.shutdown.done", { name: nameOf(connector) }))
  }

  async function disconnect(connector: Connector) {
    const instagram = connector.type === "instagram_direct"
    const confirmed = await confirm({
      title: t("connectors.disconnect.title", { name: nameOf(connector) }),
      description: t(
        instagram ? "connectors.disconnect.instagram" : "connectors.disconnect.description"
      ),
      confirmLabel: t("connectors.disconnect.confirm"),
      destructive: true,
      onConfirm: () => post(connector, "disconnect"),
    })
    if (confirmed) toast.success(t("connectors.disconnect.done", { name: nameOf(connector) }))
  }

  /** LeadChat não tem o que ler nem autorizar: é só ligar. */
  async function activateDirect(connector: Connector) {
    try {
      const updated = await post(connector, "activate")
      if (updated.status === "failed") {
        toast.error(t("connectors.connect.failed"), {
          description: updated.errorMessage ?? undefined,
        })
      } else {
        toast.success(t("connectors.connect.done", { name: nameOf(updated) }))
      }
    } catch (error) {
      toast.error(t("connectors.connect.failed"), {
        description: connectorErrorMessage(error, t),
      })
    }
  }

  /**
   * O widget liga e desliga pela própria configuração, que devolve `{ widget }`, e não
   * o conector. Devolve se mudou, para o interruptor saber.
   */
  async function setWidgetActive(connector: Connector, active: boolean) {
    async function send() {
      const { widget } = await apiPatch<{ widget: WidgetConfig }>(
        `/connectors/${connector.id}/widget`,
        { active }
      )
      storeConnector({ ...connector, status: widget.status, active: widget.active })
      void mutate(connectorWidgetKey(connector.id), { widget }, { revalidate: false })
    }

    if (active) {
      try {
        await send()
        toast.success(t("connectors.widget.turnedOn"))
        return true
      } catch (error) {
        toast.error(t("connectors.widget.turnOnFailed"), {
          description: connectorErrorMessage(error, t),
        })
        return false
      }
    }

    const confirmed = await confirm({
      title: t("connectors.widget.turnOffTitle"),
      description: t("connectors.widget.turnOffDescription"),
      confirmLabel: t("connectors.widget.turnOffConfirm"),
      destructive: true,
      onConfirm: send,
    })
    if (confirmed) toast.success(t("connectors.widget.turnedOff"))
    return confirmed
  }

  return { resume, pause, reload, shutdown, disconnect, activateDirect, setWidgetActive }
}
