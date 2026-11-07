import { useTranslation } from "react-i18next"
import { Link } from "react-router"
import { CircleAlert } from "lucide-react"

import { Callout } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { usePlatformPausedCampaigns } from "@/hooks/campaigns/use-campaigns"

/**
 * O que parou sem a pessoa pedir: é o que ela não pode descobrir por acaso, página 3 abaixo. Fora do
 * filtro da lista, de propósito: filtrar por outra coisa não faz o problema sumir.
 */
export function CampaignAttention() {
  const { t } = useTranslation()
  const paused = usePlatformPausedCampaigns()

  if (paused.length === 0) return null

  const single = paused.length === 1 ? paused[0] : null

  return (
    <Callout
      tone="danger"
      role="status"
      icon={<CircleAlert />}
      title={
        single
          ? t("campaigns.attention.one", { name: single.name })
          : t("campaigns.attention.many", { count: paused.length })
      }
      action={
        <Button
          nativeButton={false}
          variant="outline"
          size="sm"
          className="pointer-coarse:h-10"
          render={<Link to={single ? `/campaigns/${single.id}` : "/campaigns?status=paused"} />}
        >
          {t(single ? "campaigns.attention.see" : "campaigns.attention.seeAll")}
        </Button>
      }
    >
      {single
        ? t(`campaigns.attention.reason.${single.pauseReason}`)
        : paused.map((campaign) => campaign.name).join(", ")}
    </Callout>
  )
}
