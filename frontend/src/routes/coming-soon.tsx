import { useTranslation } from "react-i18next"
import { LayoutTemplate, Palette } from "lucide-react"

import { EmptyState } from "@/components/empty-state"

// Modelos e Marcas fazem parte da navegação desde já, mas o conteúdo delas
// chega nas próximas etapas — sem UI de mentira enquanto isso.

export function TemplatesPage() {
  const { t } = useTranslation()
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-6">
      <EmptyState
        icon={<LayoutTemplate className="size-6" />}
        title={t("templates.emptyTitle")}
        description={t("templates.emptyDescription")}
      />
    </div>
  )
}

export function BrandsPage() {
  const { t } = useTranslation()
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-6">
      <EmptyState
        icon={<Palette className="size-6" />}
        title={t("brands.emptyTitle")}
        description={t("brands.emptyDescription")}
      />
    </div>
  )
}
