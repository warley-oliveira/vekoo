import { useState } from "react"
import { useTranslation } from "react-i18next"
import { BadgeCheck, Phone, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { mutate as globalMutate } from "swr"

import {
  CopyButton,
  EmptyState,
  ErrorState,
  KeyValueList,
  ListSkeleton,
  StatusBadge,
  type StatusTone,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { connectorKey } from "@/hooks/connectors/use-connectors"
import { useApi } from "@/hooks/use-api"
import { apiPost } from "@/lib/api"
import { connectorErrorMessage } from "@/lib/connectors/channels"
import type { WhatsappCloudConnector, WhatsappPhoneNumber } from "@/lib/connectors/types"
import { cn } from "@/lib/utils"

type NumbersResponse = {
  phoneNumbers: WhatsappPhoneNumber[]
  primaryPhoneNumberId: string | null
}

const STATUS_TONES: Record<string, StatusTone> = {
  CONNECTED: "success",
  VERIFIED: "success",
  PENDING: "warning",
  NOT_VERIFIED: "warning",
  DISCONNECTED: "danger",
}

const QUALITY_TONES: Record<string, StatusTone> = {
  GREEN: "success",
  YELLOW: "warning",
  RED: "danger",
}

/** Valor da Meta em linguagem de gente; o que a tela não conhece aparece como veio. */
function useMetaValue() {
  const { t } = useTranslation()
  return (group: string, value: string | null | undefined) =>
    value ? t(`connectors.waba.${group}.${value}`, { defaultValue: value.replace(/_/g, " ") }) : null
}

export function WabaNumbers({ connector }: { connector: WhatsappCloudConnector }) {
  const { t } = useTranslation()
  const key = `/connectors/${connector.id}/phone-numbers`
  const { data, error, isLoading, mutate } = useApi<NumbersResponse>(key)
  const [refreshing, setRefreshing] = useState(false)

  async function refresh() {
    setRefreshing(true)
    try {
      const fresh = await apiPost<NumbersResponse>(`${key}/refresh`)
      await mutate(fresh, { revalidate: false })
      void globalMutate(connectorKey(connector.id))
      toast.success(t("connectors.waba.numbers.refreshed"))
    } catch (cause) {
      toast.error(t("connectors.waba.numbers.refreshFailed"), {
        description: connectorErrorMessage(cause, t),
      })
    } finally {
      setRefreshing(false)
    }
  }

  const refreshButton = (
    <Button
      variant="outline"
      size="sm"
      className="pointer-coarse:h-10"
      disabled={refreshing}
      onClick={() => void refresh()}
    >
      <RefreshCw className={cn(refreshing && "animate-spin")} />
      {t("connectors.waba.numbers.refresh")}
    </Button>
  )

  if (isLoading) return <ListSkeleton rows={2} />
  if (error) return <ErrorState error={error} onRetry={() => void mutate()} />

  const numbers = data?.phoneNumbers ?? []

  if (numbers.length === 0) {
    return (
      <EmptyState
        icon={<Phone className="size-5" />}
        title={t("connectors.waba.numbers.empty")}
        description={t("connectors.waba.numbers.emptyHint")}
        action={{ label: t("connectors.waba.numbers.refresh"), onClick: () => void refresh() }}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-xl text-sm text-pretty text-muted-foreground">
          {t("connectors.waba.numbers.description")}
        </p>
        {refreshButton}
      </div>

      <ul className="grid gap-3 md:grid-cols-2">
        {numbers.map((phone) => (
          <li key={phone.id}>
            <PhoneCard phone={phone} primary={phone.id === data?.primaryPhoneNumberId} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function PhoneCard({ phone, primary }: { phone: WhatsappPhoneNumber; primary: boolean }) {
  const { t } = useTranslation()
  const metaValue = useMetaValue()

  const yesNo = (value: boolean | null) =>
    value === null ? null : t(value ? "connectors.waba.numbers.yes" : "connectors.waba.numbers.no")

  return (
    <div className="flex h-full flex-col gap-3 rounded-xl p-4 ring-1 ring-foreground/10">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium tabular-nums">{phone.displayPhoneNumber}</p>
          {phone.verifiedName ? (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <BadgeCheck aria-hidden className="size-3.5 shrink-0" />
              <span className="truncate">{phone.verifiedName}</span>
            </p>
          ) : null}
        </div>
        {primary ? <StatusBadge tone="accent" dot={false}>{t("connectors.waba.numbers.primary")}</StatusBadge> : null}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {phone.status ? (
          <StatusBadge tone={STATUS_TONES[phone.status] ?? "neutral"}>
            {metaValue("phoneStatus", phone.status)}
          </StatusBadge>
        ) : null}
        {phone.qualityRating ? (
          <StatusBadge tone={QUALITY_TONES[phone.qualityRating] ?? "neutral"}>
            {t("connectors.waba.numbers.qualityLabel", {
              value: metaValue("quality", phone.qualityRating),
            })}
          </StatusBadge>
        ) : null}
        {phone.codeVerificationStatus ? (
          <StatusBadge tone={STATUS_TONES[phone.codeVerificationStatus] ?? "neutral"}>
            {metaValue("phoneStatus", phone.codeVerificationStatus)}
          </StatusBadge>
        ) : null}
      </div>

      <KeyValueList
        className="gap-2 text-xs"
        items={[
          { label: t("connectors.waba.numbers.accountMode"), value: metaValue("accountMode", phone.accountMode) },
          { label: t("connectors.waba.numbers.nameStatus"), value: metaValue("nameStatus", phone.nameStatus) },
          { label: t("connectors.waba.numbers.pin"), value: yesNo(phone.isPinEnabled) },
          { label: t("connectors.waba.numbers.official"), value: yesNo(phone.isOfficialBusinessAccount) },
          { label: t("connectors.waba.numbers.searchVisibility"), value: metaValue("searchVisibility", phone.searchVisibility) },
          {
            label: t("connectors.waba.numbers.globalSearch"),
            value: metaValue("searchVisibility", phone.eligibilityForApiBusinessGlobalSearch),
          },
        ]}
      />

      <p className="mt-auto flex items-center gap-1 border-t pt-2 text-xs text-muted-foreground">
        {t("connectors.waba.numbers.id")} <span className="tabular-nums">{phone.id}</span>
        <CopyButton value={phone.id} size="icon-xs" />
      </p>
    </div>
  )
}
