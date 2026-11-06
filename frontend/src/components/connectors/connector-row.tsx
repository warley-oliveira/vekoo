import { useTranslation } from "react-i18next"
import { Link } from "react-router"
import { ChevronRight, Pause, Power, RefreshCw, Settings2, Unplug } from "lucide-react"

import { ActionsMenu, RelativeTime, StatusBadge } from "@/components/shared"
import type { RowAction } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useConnectorActions } from "@/hooks/connectors/use-connector-actions"
import {
  availableActions,
  connectorHandle,
  mainAction,
  statusTone,
  type MainAction,
} from "@/lib/connectors/channels"
import type { Connector, ConnectorAlert } from "@/lib/connectors/types"
import { ConnectorMark } from "./channel-mark"
import { ConnectorAlertNotice } from "./connector-alert"
import { useConnectorTexts } from "./connector-texts"

/** O caminho do detalhe. Um lugar só, para a lista, os avisos e o assistente. */
export function connectorPath(id: string) {
  return `/settings/integrations/${id}`
}

export type ConnectorRowProps = {
  connector: Connector
  alerts?: ConnectorAlert[]
  /** Quem abre a conexão é a página, que tem o diálogo. */
  onConnect: (connector: Connector) => void
}

/**
 * Uma linha de canal: quem é, em que estado está, o que isso quer dizer e o que fazer. O
 * botão principal muda com o estado, e todo o resto fica no menu.
 */
export function ConnectorRow({ connector, alerts = [], onConnect }: ConnectorRowProps) {
  const { t } = useTranslation()
  const texts = useConnectorTexts()
  const actions = useConnectorActions()
  const main = mainAction(connector)
  const available = availableActions(connector)
  const handle = connectorHandle(connector)
  const hint = texts.statusHint(connector)
  const extraNumbers =
    connector.type === "whatsapp_cloud" ? Math.max(connector.phoneNumberList.length - 1, 0) : 0
  const failedReason = connector.status === "failed" ? connector.errorMessage : null

  function runMain(action: MainAction) {
    if (action === "resume") return void actions.resume(connector)
    if (action === "turnOn") return void actions.setWidgetActive(connector, true)
    if (connector.type === "lead_chat") return void actions.activateDirect(connector)
    onConnect(connector)
  }

  const menu: RowAction[] = [
    {
      label: t("connectors.row.manage"),
      icon: <Settings2 />,
      // O menu é só para quem não quer abrir a tela: quem clica na linha vai direto.
      onSelect: () => document.getElementById(`connector-link-${connector.id}`)?.click(),
    },
    {
      label: t("connectors.pause.action"),
      icon: <Pause />,
      hidden: !available.pause,
      separatorBefore: true,
      onSelect: () => void actions.pause(connector),
    },
    {
      label: t("connectors.reload.action"),
      icon: <RefreshCw />,
      hidden: !available.reload,
      onSelect: () => void actions.reload(connector),
    },
    {
      label: t("connectors.shutdown.action"),
      icon: <Power />,
      hidden: !available.shutdown,
      destructive: true,
      separatorBefore: true,
      onSelect: () => void actions.shutdown(connector),
    },
    {
      label: t("connectors.disconnect.action"),
      icon: <Unplug />,
      hidden: !available.disconnect,
      destructive: true,
      separatorBefore: true,
      onSelect: () => void actions.disconnect(connector),
    },
  ]

  return (
    <div className="group relative flex flex-col gap-3 p-4 transition-colors hover:bg-muted/40 md:flex-row md:items-start md:gap-4">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <ConnectorMark connector={connector} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              id={`connector-link-${connector.id}`}
              to={connectorPath(connector.id)}
              className="min-w-0 truncate text-sm font-medium outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
            >
              {texts.title(connector)}
            </Link>
            <StatusBadge tone={statusTone(connector.status)}>
              {texts.statusLabel(connector)}
            </StatusBadge>
          </div>

          <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            <span>{texts.typeLabel(connector)}</span>
            {handle ? (
              <>
                <span aria-hidden>·</span>
                <span className="tabular-nums">{handle}</span>
              </>
            ) : null}
            {extraNumbers > 0 ? (
              <>
                <span aria-hidden>·</span>
                <span>{t("connectors.row.moreNumbers", { count: extraNumbers })}</span>
              </>
            ) : null}
            <span aria-hidden>·</span>
            <span>
              {t("connectors.row.created")} <RelativeTime value={connector.createdAt} />
            </span>
          </p>

          {hint ? <p className="text-sm text-pretty text-muted-foreground">{hint}</p> : null}
          {failedReason ? (
            <p className="text-xs break-words text-status-danger">{failedReason}</p>
          ) : null}

          {alerts.length > 0 ? (
            <div className="flex flex-col gap-1.5 pt-1">
              {alerts.map((alert) => (
                <ConnectorAlertNotice key={alert.id} alert={alert} />
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {/* Acima do link que cobre a linha: os botões continuam sendo botões. */}
      <div className="relative z-10 flex items-center gap-1.5 pl-[3.25rem] md:pl-0">
        {main ? (
          <Button
            size="sm"
            variant={main === "turnOn" || main === "connect" ? "outline" : "default"}
            className="pointer-coarse:h-10 max-md:flex-1"
            onClick={() => runMain(main)}
          >
            {t(`connectors.main.${main}`)}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground pointer-coarse:h-10 max-md:hidden"
            render={<Link to={connectorPath(connector.id)} />}
            nativeButton={false}
          >
            {t("connectors.row.manage")}
            <ChevronRight data-icon="inline-end" />
          </Button>
        )}
        <ActionsMenu
          label={t("connectors.row.actionsOf", { name: texts.title(connector) })}
          actions={menu}
        />
      </div>
    </div>
  )
}
