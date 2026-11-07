import { useTranslation } from "react-i18next"

import { AreaNav } from "@/components/shared"

/** As duas partes da área: o que se instala, para todo mundo, e o que se escreve, para quem programa. */
export function ToolsNav() {
  const { t } = useTranslation()
  return (
    <AreaNav
      label={t("tools.nav.label")}
      items={[
        { to: "/tools", label: t("tools.nav.catalog") },
        { to: "/tools/functions", label: t("tools.nav.functions") },
      ]}
    />
  )
}
