import { useTranslation } from "react-i18next"

import { AreaNav } from "@/components/shared"

export function WebhooksNav() {
  const { t } = useTranslation()
  return (
    <AreaNav
      label={t("webhooks.nav.label")}
      items={[
        { to: "/settings/webhooks", label: t("webhooks.nav.webhooks") },
        { to: "/settings/webhooks/logs", label: t("webhooks.nav.logs") },
      ]}
    />
  )
}
