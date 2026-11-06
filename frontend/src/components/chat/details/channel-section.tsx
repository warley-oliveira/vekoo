import { memo, type ReactNode } from "react"
import { Link } from "react-router"
import { useTranslation } from "react-i18next"
import { Settings2 } from "lucide-react"

import { KeyValueList, StatusBadge, UserAvatar, type KeyValueItem } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useConnectorTexts } from "@/components/connectors/connector-texts"
import { useChatConnectors } from "@/hooks/chat/use-chat-refs"
import { useChatFields } from "@/hooks/chat-details/use-chat-fields"
import { useCan } from "@/hooks/use-can"
import { apiAssetUrl } from "@/lib/api"
import { channelKey, type ChatConnector } from "@/lib/chat/channel"
import { connectorPicture, statusTone } from "@/lib/connectors/channels"
import { formatDate } from "@/lib/date-format"
import { useLanguage } from "@/lib/i18n"
import { ChannelIcon } from "../channel-icon"
import { DetailsSection, SectionEmpty } from "./section"

const FIELDS = ["connectorId", "audienceType", "senderPhoneNumberId"] as const

const QUALITY_TONE: Record<string, "success" | "warning" | "danger"> = {
  GREEN: "success",
  YELLOW: "warning",
  RED: "danger",
}

const MAX_ORIGINS = 3

function ExternalAnchor({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline-offset-2 hover:underline focus-visible:underline"
    >
      {children}
    </a>
  )
}

function useChannelItems(
  connector: ChatConnector,
  senderPhoneNumberId: string | null
): KeyValueItem[] {
  const { t } = useTranslation()
  const language = useLanguage()

  switch (connector.type) {
    case "whatsapp_cloud": {
      const phone = senderPhoneNumberId
        ? (connector.phoneNumberList ?? []).find(
            (item) => String(item.id) === String(senderPhoneNumberId)
          )
        : undefined
      const details = senderPhoneNumberId
        ? connector.phoneNumberDetails?.[String(senderPhoneNumberId)]
        : undefined
      const quality = phone?.qualityRating ?? connector.qualityRating
      const website = details?.websites?.[0]

      return [
        {
          label: t("chatDetails.channel.senderNumber"),
          value: phone?.displayPhoneNumber ?? connector.displayPhoneNumber,
        },
        ...(phone?.verifiedName
          ? [{ label: t("chatDetails.channel.verifiedName"), value: phone.verifiedName }]
          : []),
        ...(quality
          ? [
              {
                label: t("chatDetails.channel.quality"),
                value: (
                  <StatusBadge tone={QUALITY_TONE[quality] ?? "neutral"}>
                    {t(`chatDetails.channel.qualityLevel.${quality}`, { defaultValue: quality })}
                  </StatusBadge>
                ),
              },
            ]
          : []),
        ...(details?.about ? [{ label: t("chatDetails.channel.about"), value: details.about }] : []),
        ...(details?.email ? [{ label: t("chatDetails.channel.email"), value: details.email }] : []),
        ...(website
          ? [
              {
                label: t("chatDetails.channel.website"),
                value: <ExternalAnchor href={website}>{website}</ExternalAnchor>,
              },
            ]
          : []),
      ]
    }

    case "whatsapp_web":
    case "zapi":
      return [{ label: t("chatDetails.channel.accountNumber"), value: connector.numberFormatted }]

    case "instagram_direct":
      return [
        {
          label: t("chatDetails.channel.username"),
          value: connector.instagramUsername ? `@${connector.instagramUsername}` : null,
        },
        { label: t("chatDetails.channel.accountId"), value: connector.instagramAccountId },
      ]

    case "facebook_messenger":
      return [
        { label: t("chatDetails.channel.page"), value: connector.profileName ?? connector.name },
        ...(connector.pageUrl
          ? [
              {
                label: t("chatDetails.channel.pageLink"),
                value: (
                  <ExternalAnchor href={connector.pageUrl}>
                    {t("chatDetails.channel.viewPage")}
                  </ExternalAnchor>
                ),
              },
            ]
          : []),
      ]

    case "web_widget": {
      const origins = connector.allowedOrigins ?? []
      return [
        { label: t("chatDetails.channel.botName"), value: connector.botDisplayName },
        ...(connector.primaryColor
          ? [
              {
                label: t("chatDetails.channel.color"),
                value: (
                  <span className="inline-flex items-center gap-1.5 tabular-nums">
                    <span
                      aria-hidden
                      className="size-3 rounded-full ring-1 ring-foreground/10"
                      style={{ backgroundColor: connector.primaryColor }}
                    />
                    {connector.primaryColor}
                  </span>
                ),
              },
            ]
          : []),
        ...(origins.length > 0
          ? [
              {
                label: t("chatDetails.channel.origins"),
                value: (
                  <span className="flex flex-col gap-0.5">
                    {origins.slice(0, MAX_ORIGINS).map((origin) => (
                      <span key={origin} className="wrap-anywhere">
                        {origin}
                      </span>
                    ))}
                    {origins.length > MAX_ORIGINS ? (
                      <span className="text-muted-foreground">
                        {t("chatDetails.channel.moreOrigins", {
                          count: origins.length - MAX_ORIGINS,
                        })}
                      </span>
                    ) : null}
                  </span>
                ),
              },
            ]
          : []),
        {
          label: t("chatDetails.channel.createdAt"),
          value: formatDate(connector.createdAt, language, "medium"),
        },
      ]
    }

    default:
      return []
  }
}

function ChannelCard({
  connector,
  senderPhoneNumberId,
}: {
  connector: ChatConnector
  senderPhoneNumberId: string | null
}) {
  const { t } = useTranslation()
  const { title, typeLabel, statusLabel } = useConnectorTexts()
  const canManage = useCan("core_settings")
  const items = useChannelItems(connector, senderPhoneNumberId)
  const picture = connectorPicture(connector)
  const channel = channelKey(connector, null)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        {picture ? (
          <UserAvatar name={title(connector)} src={apiAssetUrl(picture)} className="size-9 shrink-0" />
        ) : (
          <span
            aria-hidden
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
          >
            <ChannelIcon channel={channel} className="size-4" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{title(connector)}</span>
          <span className="block truncate text-xs text-muted-foreground">{typeLabel(connector)}</span>
        </span>
        <StatusBadge tone={statusTone(connector.status)} className="shrink-0">
          {statusLabel(connector)}
        </StatusBadge>
      </div>

      {items.length > 0 ? <KeyValueList items={items} className="gap-2 text-[0.8125rem]" /> : null}

      {canManage ? (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 w-fit text-muted-foreground pointer-coarse:h-10"
          nativeButton={false}
          render={<Link to={`/settings/integrations/${connector.id}`} />}
        >
          <Settings2 />
          {t("chatDetails.channel.manage")}
        </Button>
      ) : null}
    </div>
  )
}

/** Por onde esta conversa acontece. Raro, e por isso dobrado: um toque, e está tudo aqui. */
export const ChannelSection = memo(function ChannelSection({ chatId }: { chatId: string }) {
  const { t } = useTranslation()
  const chat = useChatFields(chatId, FIELDS)
  const { byId, isLoading } = useChatConnectors()

  if (!chat) return null

  const connector = chat.connectorId ? byId.get(chat.connectorId) : undefined
  const channel = channelKey(connector, chat.audienceType)

  return (
    <DetailsSection
      id="channel"
      title={t("chatDetails.channel.title")}
      summary={connector?.name ?? t(`chat.channel.${channel}`)}
    >
      {connector ? (
        <ChannelCard connector={connector} senderPhoneNumberId={chat.senderPhoneNumberId} />
      ) : isLoading ? null : (
        <SectionEmpty>{t("chatDetails.channel.notFound")}</SectionEmpty>
      )}
    </DetailsSection>
  )
})
