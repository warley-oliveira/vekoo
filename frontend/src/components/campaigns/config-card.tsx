import { memo } from "react"
import { useTranslation } from "react-i18next"
import { Paperclip } from "lucide-react"

import { KeyValueList, SectionCard, TagChip, type KeyValueItem } from "@/components/shared"
import {
  useCampaignConnectors,
  useCampaignFlows,
  useCampaignTags,
} from "@/hooks/campaigns/use-campaigns"
import { connectorLabel, formatInterval, formatSendDays, formatSendWindow } from "@/lib/campaigns/format"
import type { CampaignDetail } from "@/lib/campaigns/types"
import { formatDateTime } from "@/lib/date-format"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"

/** Como a campanha foi preparada: o que explica o ritmo que a pessoa está vendo. */
export const ConfigCard = memo(function ConfigCard({ campaign }: { campaign: CampaignDetail }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const { byId } = useCampaignConnectors()
  const tags = useCampaignTags(campaign.chatTagIds.length > 0)
  const flows = useCampaignFlows(Boolean(campaign.flowId))

  const official = campaign.campaignMode === "template"
  const connectorIds = official
    ? campaign.wabaConnectorId
      ? [campaign.wabaConnectorId]
      : []
    : campaign.connectorIds
  const channels = connectorIds.map((id) => {
    const connector = byId.get(id)
    if (!connector) return t("campaigns.config.unknownChannel")
    return connector.active
      ? connectorLabel(connector)
      : t("campaigns.list.disconnectedChannel", { name: connectorLabel(connector) })
  })

  const flowName = flows?.find((flow) => flow.id === campaign.flowId)?.name
  const chosenTags = (tags ?? []).filter((tag) => campaign.chatTagIds.includes(tag.id))

  const when = (value: number | null) => (value ? formatDateTime(value, language) : null)

  const items: KeyValueItem[] = [
    { label: t("campaigns.config.channels"), value: channels.join(", ") },
    {
      label: t("campaigns.config.windowLabel"),
      value: `${formatSendDays(campaign.sendDays, language, t)}, ${formatSendWindow(campaign, t)}`,
    },
    {
      label: t("campaigns.config.interval"),
      value: formatInterval(campaign.intervalMin, campaign.intervalMax, t),
    },
    {
      label: t("campaigns.config.dailyLimit"),
      value: t("campaigns.config.dailyLimitValue", {
        count: campaign.dailyLimitPerConnector,
        formatted: formatNumber(campaign.dailyLimitPerConnector, language),
      }),
    },
    ...(official
      ? [
          {
            label: t("campaigns.config.templates"),
            value: t("campaigns.config.templatesValue", { count: campaign.templateIds.length }),
          },
          {
            label: t("campaigns.config.phoneNumbers"),
            value: t("campaigns.config.phoneNumbersValue", { count: campaign.phoneNumberIds.length }),
          },
        ]
      : []),
    ...(campaign.flowId ? [{ label: t("campaigns.config.flow"), value: flowName }] : []),
    ...(chosenTags.length > 0
      ? [
          {
            label: t("campaigns.config.tags"),
            value: (
              <span className="flex flex-wrap gap-1">
                {chosenTags.map((tag) => (
                  <TagChip key={tag.id} color={tag.color ?? undefined}>
                    {tag.name}
                  </TagChip>
                ))}
              </span>
            ),
          },
        ]
      : []),
    { label: t("campaigns.config.createdAt"), value: when(campaign.createdAt) },
    ...(campaign.scheduledAt
      ? [{ label: t("campaigns.config.scheduledAt"), value: when(campaign.scheduledAt) }]
      : []),
    ...(campaign.startedAt
      ? [{ label: t("campaigns.config.startedAt"), value: when(campaign.startedAt) }]
      : []),
    ...(campaign.completedAt
      ? [{ label: t("campaigns.config.completedAt"), value: when(campaign.completedAt) }]
      : []),
  ]

  const messages = campaign.messages.filter(Boolean)

  return (
    <SectionCard title={t("campaigns.config.title")}>
      <div className="flex flex-col gap-5">
        <KeyValueList items={items} />

        {messages.length > 0 || campaign.mediaFileName ? (
          <div className="flex flex-col gap-2 border-t pt-4">
            <h3 className="text-sm font-medium">
              {t("campaigns.config.messages", { count: messages.length })}
            </h3>
            {messages.map((message, index) => (
              <blockquote
                key={index}
                className="rounded-lg bg-muted/50 px-3 py-2 text-sm wrap-anywhere whitespace-pre-wrap"
              >
                {message}
              </blockquote>
            ))}
            {campaign.mediaFileName ? (
              <p className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
                <Paperclip aria-hidden className="size-3.5 shrink-0" />
                <span className="truncate">{campaign.mediaFileName}</span>
              </p>
            ) : null}
            {messages.length > 1 ? (
              <p className="text-xs text-pretty text-muted-foreground">{t("campaigns.config.rotation")}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </SectionCard>
  )
})
