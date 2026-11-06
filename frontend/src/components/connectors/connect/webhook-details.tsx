import { useTranslation } from "react-i18next"

import { CopyButton } from "@/components/shared"
import type { Connector } from "@/lib/connectors/types"

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex items-center gap-1 rounded-lg bg-muted px-3 py-2">
        <code className="min-w-0 flex-1 font-mono text-xs break-all">{value}</code>
        <CopyButton value={value} size="icon-xs" className="shrink-0 pointer-coarse:size-10" />
      </div>
    </div>
  )
}

/**
 * O que a pessoa cola no painel da Meta. A API só entrega isto na criação, e nunca mais:
 * por isso a tela diz para guardar agora.
 */
export function WebhookDetails({ connector, heading }: { connector: Connector; heading?: string }) {
  const { t } = useTranslation()

  if (!connector.webhookUrl && !connector.verificationToken) return null

  return (
    <section className="flex flex-col gap-3 rounded-xl p-4 ring-1 ring-foreground/10">
      <div className="space-y-0.5">
        <h4 className="text-sm font-medium">{heading ?? t("connectors.webhook.title")}</h4>
        <p className="text-xs text-pretty text-muted-foreground">{t("connectors.webhook.description")}</p>
      </div>
      {connector.webhookUrl ? (
        <CopyRow label={t("connectors.webhook.url")} value={connector.webhookUrl} />
      ) : null}
      {connector.verificationToken ? (
        <CopyRow label={t("connectors.webhook.token")} value={connector.verificationToken} />
      ) : null}
    </section>
  )
}
