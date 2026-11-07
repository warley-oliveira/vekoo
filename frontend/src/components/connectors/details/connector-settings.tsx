import { useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router"
import { Pause, Power, RefreshCw, Unplug } from "lucide-react"
import { toast } from "sonner"

import { SettingsSection, KeyValueList, type KeyValueItem } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { useConnectorActions } from "@/hooks/connectors/use-connector-actions"
import { storeConnector } from "@/hooks/connectors/use-connectors"
import { apiPatch } from "@/lib/api"
import {
  availableActions,
  connectorErrorMessage,
  connectorPath,
  pauseDiscardsMessages,
} from "@/lib/connectors/channels"
import type { Connector } from "@/lib/connectors/types"
import { formatDate } from "@/lib/date-format"
import { useLanguage } from "@/lib/i18n"

/** Assinar a mensagem com o nome de quem atendeu. Vale na hora. */
export function CollaboratorNameSetting({ connector }: { connector: Connector }) {
  const { t } = useTranslation()
  const [pending, setPending] = useState<boolean | null>(null)
  const checked = pending ?? connector.sendCollaboratorName

  async function change(next: boolean) {
    setPending(next)
    try {
      const { connector: updated } = await apiPatch<{ connector: Connector }>(
        `/connectors/${connector.id}`,
        { sendCollaboratorName: next }
      )
      storeConnector(updated)
      toast.success(t(next ? "connectors.signature.on" : "connectors.signature.off"))
    } catch (error) {
      toast.error(t("connectors.signature.failed"), {
        description: connectorErrorMessage(error, t),
      })
    } finally {
      setPending(null)
    }
  }

  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 pointer-coarse:min-h-10">
      <span className="min-w-0 space-y-0.5">
        <span className="block text-sm font-medium">{t("connectors.signature.label")}</span>
        <span className="block text-xs leading-snug text-pretty text-muted-foreground">
          {t("connectors.signature.hint")}
        </span>
      </span>
      <Switch
        checked={checked}
        disabled={pending !== null}
        onCheckedChange={(next) => void change(next)}
      />
    </label>
  )
}

/** Os dados do canal, conforme o tipo. Só o que ajuda a reconhecer ou a pedir suporte. */
export function ConnectorFacts({ connector }: { connector: Connector }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const created: KeyValueItem = {
    label: t("connectors.facts.createdAt"),
    value: formatDate(connector.createdAt, language),
  }

  let items: KeyValueItem[]
  switch (connector.type) {
    case "whatsapp_web":
      items = [
        { label: t("connectors.facts.number"), value: connector.numberFormatted, copyValue: connector.numberId ?? undefined },
        { label: t("connectors.facts.profileName"), value: connector.profileName },
        { label: t("connectors.facts.provider"), value: t("connectors.facts.providerDefault") },
        created,
      ]
      break
    case "lead_chat":
      items = [
        { label: t("connectors.facts.numberId"), value: connector.phoneNumberId, copyValue: connector.phoneNumberId ?? undefined },
        created,
      ]
      break
    case "facebook_messenger":
      items = [
        { label: t("connectors.facts.page"), value: connector.profileName },
        { label: t("connectors.facts.pageId"), value: connector.pageId, copyValue: connector.pageId ?? undefined },
        {
          label: t("connectors.facts.pageUrl"),
          value: connector.pageUrl ? (
            <a
              href={connector.pageUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="underline-offset-4 hover:underline"
            >
              {connector.pageUrl}
            </a>
          ) : null,
        },
        {
          label: t("connectors.facts.linkedInstagram"),
          value: connector.linkedInstagramConnectorId ? (
            <Link
              to={connectorPath(connector.linkedInstagramConnectorId)}
              className="underline-offset-4 hover:underline"
            >
              {t("connectors.facts.openInstagram")}
            </Link>
          ) : null,
        },
        created,
      ]
      break
    case "whatsapp_cloud":
      items = [
        { label: t("connectors.facts.number"), value: connector.displayPhoneNumber },
        {
          label: t("connectors.facts.quality"),
          value: connector.qualityRating
            ? t(`connectors.waba.quality.${connector.qualityRating}`, { defaultValue: connector.qualityRating })
            : null,
        },
        {
          label: t("connectors.facts.metaStatus"),
          value: connector.fbStatus
            ? t(`connectors.waba.phoneStatus.${connector.fbStatus}`, { defaultValue: connector.fbStatus })
            : null,
        },
        { label: t("connectors.facts.wabaId"), value: connector.wabaId, copyValue: connector.wabaId ?? undefined },
        { label: t("connectors.facts.businessId"), value: connector.businessId, copyValue: connector.businessId ?? undefined },
        created,
      ]
      break
    default:
      items = [created]
  }

  return <KeyValueList items={items} />
}

function ActionRow({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs leading-snug text-pretty text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  )
}

/**
 * Cada ação com o que ela faz, em vez de um menu de verbos parecidos. O que não existe neste
 * tipo de canal, ou não faz sentido no estado atual, não aparece.
 */
export function ConnectorActionsSection({ connector }: { connector: Connector }) {
  const { t } = useTranslation()
  const actions = useConnectorActions()
  const available = availableActions(connector)

  if (!Object.values(available).some(Boolean)) return null

  return (
    <SettingsSection
      title={t("connectors.detail.actionsTitle")}
      description={t("connectors.detail.actionsDescription")}
    >
      <div className="flex flex-col divide-y">
        {available.pause ? (
          <ActionRow
            title={t("connectors.pause.action")}
            description={t(
              pauseDiscardsMessages(connector)
                ? "connectors.pause.summaryDiscards"
                : "connectors.pause.summary"
            )}
            action={
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 pointer-coarse:h-10"
                onClick={() => void actions.pause(connector)}
              >
                <Pause />
                {t("connectors.pause.action")}
              </Button>
            }
          />
        ) : null}
        {available.reload ? (
          <ActionRow
            title={t("connectors.reload.action")}
            description={t("connectors.reload.summary")}
            action={
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 pointer-coarse:h-10"
                onClick={() => void actions.reload(connector)}
              >
                <RefreshCw />
                {t("connectors.reload.action")}
              </Button>
            }
          />
        ) : null}
        {available.shutdown ? (
          <ActionRow
            title={t("connectors.shutdown.action")}
            description={t("connectors.shutdown.summary")}
            action={
              <Button
                variant="destructive"
                size="sm"
                className="shrink-0 pointer-coarse:h-10"
                onClick={() => void actions.shutdown(connector)}
              >
                <Power />
                {t("connectors.shutdown.action")}
              </Button>
            }
          />
        ) : null}
        {available.disconnect ? (
          <ActionRow
            title={t("connectors.disconnect.action")}
            description={t(
              connector.type === "instagram_direct"
                ? "connectors.disconnect.summaryInstagram"
                : "connectors.disconnect.summary"
            )}
            action={
              <Button
                variant="destructive"
                size="sm"
                className="shrink-0 pointer-coarse:h-10"
                onClick={() => void actions.disconnect(connector)}
              >
                <Unplug />
                {t("connectors.disconnect.action")}
              </Button>
            }
          />
        ) : null}
      </div>
    </SettingsSection>
  )
}
