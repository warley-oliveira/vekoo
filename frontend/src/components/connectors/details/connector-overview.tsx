import { useTranslation } from "react-i18next"

import { RelativeTime, StatusBadge } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useConnectorActions } from "@/hooks/connectors/use-connector-actions"
import {
  connectorHandle,
  hasRealName,
  mainAction,
  statusTone,
  type MainAction,
} from "@/lib/connectors/channels"
import type { Connector, ConnectorAlert } from "@/lib/connectors/types"
import { ConnectorMark } from "../channel-mark"
import { ConnectorAlertNotice } from "../connector-alert"
import { useConnectorTexts } from "../connector-texts"

export type ConnectorOverviewProps = {
  connector: Connector
  alerts?: ConnectorAlert[]
  onConnect: (connector: Connector) => void
}

/**
 * O topo do detalhe: em que estado o canal está, o que isso quer dizer e o que fazer. O
 * título já está na barra superior: aqui entra só o que explica.
 */
export function ConnectorOverview({ connector, alerts = [], onConnect }: ConnectorOverviewProps) {
  const { t } = useTranslation()
  const texts = useConnectorTexts()
  const actions = useConnectorActions()
  // No widget quem liga e desliga é o interruptor logo abaixo: dois controles para a
  // mesma coisa só confundiriam.
  const main = connector.type === "web_widget" ? null : mainAction(connector)
  const hint = texts.statusHint(connector)
  const handle = connectorHandle(connector)

  function runMain(action: MainAction) {
    if (action === "resume") return void actions.resume(connector)
    if (action === "turnOn") return void actions.setWidgetActive(connector, true)
    if (connector.type === "lead_chat") return void actions.activateDirect(connector)
    onConnect(connector)
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <ConnectorMark connector={connector} size="lg" />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <StatusBadge tone={statusTone(connector.status)}>
                {texts.statusLabel(connector)}
              </StatusBadge>
              {hasRealName(connector) ? (
                <span className="text-sm text-muted-foreground">{texts.typeLabel(connector)}</span>
              ) : null}
              {handle ? <span className="text-sm tabular-nums">{handle}</span> : null}
            </div>
            <p className="text-sm text-pretty text-muted-foreground">
              {hint ?? t("connectors.status.active.hint")}
            </p>
            {connector.status === "failed" && connector.errorMessage ? (
              <p className="text-xs break-words text-status-danger">
                {t("connectors.connect.detail")} {connector.errorMessage}
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {t("connectors.row.created")} <RelativeTime value={connector.createdAt} />
            </p>
          </div>
        </div>

        {main ? (
          <Button
            className="pointer-coarse:h-10 max-sm:w-full"
            onClick={() => runMain(main)}
          >
            {t(`connectors.main.${main}`)}
          </Button>
        ) : null}
      </div>

      {alerts.map((alert) => (
        <ConnectorAlertNotice key={alert.id} alert={alert} />
      ))}
    </section>
  )
}
