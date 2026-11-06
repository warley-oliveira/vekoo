import { useTranslation } from "react-i18next"
import { BadgeCheck, ExternalLink } from "lucide-react"

import { CopyButton, StatusBadge } from "@/components/shared"
import { apiAssetUrl } from "@/lib/api"
import type { InstagramConnector } from "@/lib/connectors/types"
import { formatCompactNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { ChannelMark } from "../channel-mark"

/** O que a conta profissional mostra ao público, com os números em destaque. */
export function InstagramProfile({
  connector,
  className,
}: {
  connector: InstagramConnector
  className?: string
}) {
  const { t } = useTranslation()
  const language = useLanguage()

  const displayName = connector.accountName || connector.profileName || connector.instagramUsername
  const stats = [
    { key: "followers", value: connector.followersCount },
    { key: "follows", value: connector.followsCount },
    { key: "media", value: connector.mediaCount },
  ]

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex items-center gap-3">
        <ChannelMark
          type="instagram_direct"
          picture={connector.profilePictureUrl ? apiAssetUrl(connector.profilePictureUrl) : null}
          size="lg"
        />
        <div className="min-w-0 space-y-1">
          <p className="flex items-center gap-1.5 font-heading text-base font-medium">
            <span className="truncate">{displayName ?? t("connectors.types.instagram_direct")}</span>
            {connector.accountType === "BUSINESS" ? (
              <BadgeCheck
                aria-label={t("connectors.instagram.profile.business")}
                className="size-4 shrink-0 text-muted-foreground"
              />
            ) : null}
          </p>
          {connector.instagramUsername ? (
            <p className="text-sm text-muted-foreground">@{connector.instagramUsername}</p>
          ) : null}
          {connector.accountType ? (
            <StatusBadge dot={false}>
              {t(`connectors.instagram.profile.accountTypes.${connector.accountType}`, {
                defaultValue: connector.accountType,
              })}
            </StatusBadge>
          ) : null}
        </div>
      </div>

      <dl className="grid grid-cols-3 divide-x rounded-xl bg-muted/50 py-3 text-center">
        {stats.map((stat) => (
          <div key={stat.key} className="min-w-0 px-2">
            <dd className="font-heading text-lg font-medium tabular-nums">
              {stat.value === null ? t("kit.noValue") : formatCompactNumber(stat.value, language)}
            </dd>
            <dt className="truncate text-xs text-muted-foreground">
              {t(`connectors.instagram.profile.${stat.key}`)}
            </dt>
          </div>
        ))}
      </dl>

      {connector.biography ? (
        <p className="text-sm whitespace-pre-line text-pretty">{connector.biography}</p>
      ) : null}

      {connector.website ? (
        <a
          href={connector.website}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex w-fit items-center gap-1 text-sm underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {connector.website}
          <ExternalLink aria-hidden className="size-3.5" />
        </a>
      ) : null}

      {connector.instagramAccountId ? (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          {t("connectors.instagram.profile.accountId")}{" "}
          <span className="tabular-nums">{connector.instagramAccountId}</span>
          <CopyButton value={connector.instagramAccountId} size="icon-xs" />
        </p>
      ) : null}
    </div>
  )
}
