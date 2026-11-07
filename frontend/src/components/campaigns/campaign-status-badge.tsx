import { useTranslation } from "react-i18next"

import { StatusBadge } from "@/components/shared"
import { CAMPAIGN_TONES } from "@/lib/campaigns/status"
import type { CampaignStatus } from "@/lib/campaigns/types"
import { cn } from "@/lib/utils"

/** A situação da campanha. Em andamento, o ponto pulsa: é o único movimento em repouso da tela. */
export function CampaignStatusBadge({
  status,
  className,
}: {
  status: CampaignStatus
  className?: string
}) {
  const { t } = useTranslation()

  return (
    <StatusBadge
      tone={CAMPAIGN_TONES[status]}
      className={className}
      icon={
        status === "running" ? (
          <span aria-hidden className="relative flex size-1.5 shrink-0">
            <span className="absolute inset-0 rounded-full bg-current motion-safe:animate-ping" />
            <span className={cn("relative size-1.5 rounded-full bg-current")} />
          </span>
        ) : undefined
      }
    >
      {t(`campaigns.status.${status}`)}
    </StatusBadge>
  )
}
