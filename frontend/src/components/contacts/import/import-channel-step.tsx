import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router"
import { Unplug } from "lucide-react"

import { ConnectorMark } from "@/components/connectors/channel-mark"
import { useConnectorTexts } from "@/components/connectors/connector-texts"
import { Callout, EmptyState, ErrorState, ListSkeleton } from "@/components/shared"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { useCan } from "@/hooks/use-can"
import type { Connector } from "@/lib/connectors/types"
import { connectorHandle } from "@/lib/connectors/channels"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"

export type ImportChannelStepProps = {
  connectors: Connector[]
  isLoading: boolean
  error: unknown
  onRetry: () => void
  value: string | null
  onChange: (connectorId: string) => void
  readyCount: number
  /** Abaixo de tudo: o resumo das escolhas. */
  footer?: ReactNode
}

/** Para qual canal vão os contatos. Só os que começam conversa por número entram na lista. */
export function ImportChannelStep({
  connectors,
  isLoading,
  error,
  onRetry,
  value,
  onChange,
  readyCount,
  footer,
}: ImportChannelStepProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const texts = useConnectorTexts()
  const canManageChannels = useCan("core_settings")

  if (isLoading) return <ListSkeleton rows={3} avatar />
  if (error) return <ErrorState error={error} onRetry={onRetry} />

  if (connectors.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <EmptyState
          icon={<Unplug className="size-5" />}
          title={t("contacts.import.channel.emptyTitle")}
          description={t("contacts.import.channel.emptyHint")}
        />
        {canManageChannels ? (
          <Link
            to="/settings/integrations"
            className="self-center text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {t("contacts.import.channel.connect")}
          </Link>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span id="import-channel-label" className="text-sm font-medium">
          {t("contacts.import.channel.label", {
            count: readyCount,
            formatted: formatNumber(readyCount, language),
          })}
        </span>
        <RadioGroup
          aria-labelledby="import-channel-label"
          className="grid-cols-1"
          value={value}
          onValueChange={(next) => onChange(next as string)}
        >
          {connectors.map((connector) => {
            // Canal parado também recebe os contatos: só não dá para conversar até reconectar.
            const description = [
              texts.typeLabel(connector),
              connectorHandle(connector),
              connector.status === "active" ? null : texts.statusLabel(connector),
            ]
              .filter(Boolean)
              .join(" · ")

            return (
              <label
                key={connector.id}
                className="flex min-w-0 cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50 has-data-checked:border-primary has-data-checked:bg-accent/50 has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
              >
                <RadioGroupItem value={connector.id} className="border-muted-foreground/40" />
                <ConnectorMark connector={connector} size="sm" />
                <span className="min-w-0 flex-1 space-y-0.5">
                  <span className="block truncate text-sm font-medium">
                    {texts.title(connector)}
                  </span>
                  <span className="block text-xs text-pretty text-muted-foreground">
                    {description}
                  </span>
                </span>
              </label>
            )
          })}
        </RadioGroup>
      </div>

      <Callout title={t("contacts.import.channel.noteTitle")}>
        <ul className="flex flex-col gap-0.5">
          <li>{t("contacts.import.channel.noteAutomation")}</li>
          <li>{t("contacts.import.channel.noteDuplicates")}</li>
          <li>{t("contacts.import.channel.noteOrder")}</li>
        </ul>
      </Callout>

      {footer}
    </div>
  )
}
