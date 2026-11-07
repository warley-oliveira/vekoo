import { memo, useMemo } from "react"
import { Trans, useTranslation } from "react-i18next"
import { Link } from "react-router"
import { List, Loader2, Megaphone, Trash2 } from "lucide-react"

import { ActionsMenu, RelativeTime, StatusBadge, type RowAction } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { campaignFromExtractionPath, EXTRACTION_TONES } from "@/lib/campaigns/status"
import type { PlaceExtraction } from "@/lib/campaigns/types"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"

const KNOWN_ERRORS = new Set([
  "apifyNotConfigured",
  "apifyInvalidToken",
  "apifyQuotaExceeded",
  "apifyTimeout",
  "apifyFailed",
  "interrupted",
])

type ExtractionRowProps = {
  extraction: PlaceExtraction
  onOpen: (id: string) => void
  onDelete: (extraction: PlaceExtraction) => void
}

/** Uma busca feita: o que procurou, onde, como terminou e o que dá para fazer com o resultado. */
export const ExtractionRow = memo(function ExtractionRow({
  extraction,
  onOpen,
  onDelete,
}: ExtractionRowProps) {
  const { t } = useTranslation()
  const language = useLanguage()

  const { id, status, errorCode, errorMessage } = extraction
  const usable = status === "completed" && extraction.resultsCount > 0
  const working = status === "pending" || status === "running"

  const actions = useMemo<RowAction[]>(
    () => [
      {
        label: t("campaigns.places.delete.action"),
        icon: <Trash2 />,
        destructive: true,
        onSelect: () => onDelete(extraction),
      },
    ],
    [extraction, onDelete, t]
  )

  return (
    <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:gap-4 md:px-4 md:py-3">
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <p className="min-w-0 text-sm font-medium wrap-anywhere">{extraction.searchQuery}</p>
          <StatusBadge
            tone={EXTRACTION_TONES[status]}
            icon={working ? <Loader2 className="motion-safe:animate-spin" /> : undefined}
          >
            {t(`campaigns.places.status.${status}`)}
          </StatusBadge>
        </div>
        <p className="text-xs text-pretty text-muted-foreground">
          <Trans
            i18nKey={extraction.location ? "campaigns.places.row.metaLocated" : "campaigns.places.row.meta"}
            values={{
              location: extraction.location ?? "",
              name: extraction.createdBy.name ?? t("campaigns.places.row.someone"),
            }}
            components={{ time: <RelativeTime value={extraction.createdAt} className="whitespace-nowrap" /> }}
          />
        </p>
        {status === "failed" ? (
          <p className="text-xs text-pretty text-status-danger">
            {errorCode && KNOWN_ERRORS.has(errorCode)
              ? t(`campaigns.places.errors.${errorCode}`)
              : (errorMessage ?? t("campaigns.places.errors.apifyFailed"))}
          </p>
        ) : null}
        {working ? (
          <p className="text-xs text-pretty text-muted-foreground">{t("campaigns.places.row.working")}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 md:shrink-0 md:justify-end">
        {status === "completed" ? (
          <span className="mr-auto text-sm tabular-nums md:mr-1">
            {t("campaigns.places.row.results", {
              count: extraction.resultsCount,
              formatted: formatNumber(extraction.resultsCount, language),
            })}
          </span>
        ) : null}
        {usable ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="pointer-coarse:h-10"
              onClick={() => onOpen(id)}
            >
              <List />
              {t("campaigns.places.seeResults")}
            </Button>
            <Button
              nativeButton={false}
              variant="outline"
              size="sm"
              className="pointer-coarse:h-10"
              render={<Link to={campaignFromExtractionPath(id)} />}
            >
              <Megaphone />
              {t("campaigns.places.useInCampaign")}
            </Button>
          </>
        ) : null}
        <ActionsMenu
          actions={actions}
          label={t("campaigns.places.row.actionsOf", { query: extraction.searchQuery })}
          className="pointer-coarse:size-10"
        />
      </div>
    </div>
  )
})
