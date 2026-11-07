import { useTranslation } from "react-i18next"

import { AreaNav } from "@/components/shared"

/** As duas partes da área: o que disparou e os estabelecimentos encontrados. Cada uma tem endereço. */
export function CampaignsAreaNav() {
  const { t } = useTranslation()

  return (
    <AreaNav
      label={t("campaigns.area.label")}
      items={[
        { to: "/campaigns", label: t("campaigns.area.campaigns") },
        { to: "/place-extractions", label: t("campaigns.area.places") },
      ]}
    />
  )
}
