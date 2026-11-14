import { useTranslation } from "react-i18next"
import { LoaderCircle } from "lucide-react"

import type { AnalysisStatus } from "@/admin/api"
import { Badge } from "@/components/ui/badge"
import type { ReferenceStatus } from "@/lib/taxonomy"
import { cn } from "@/lib/utils"

/**
 * A situação do card. A análise em andamento ou com falha aparece no lugar da
 * curadoria: enquanto ela não termina, a curadoria não tem o que decidir.
 */
export function ReferenceStatusBadge({ status, analysis }: { status: ReferenceStatus; analysis: AnalysisStatus }) {
  const { t } = useTranslation()

  if (analysis === "pending" || analysis === "running") {
    return (
      <Badge variant="outline" className="gap-1">
        <LoaderCircle className="size-3 animate-spin motion-reduce:animate-none" aria-hidden />
        {t(`admin.analysisStatus.${analysis}`)}
      </Badge>
    )
  }
  if (analysis === "failed") return <Badge variant="destructive">{t("admin.analysisStatus.failed")}</Badge>

  return (
    <Badge
      variant={status === "published" ? "default" : "outline"}
      className={cn(status === "archived" && "text-muted-foreground")}
    >
      {t(`admin.status.${status}`)}
    </Badge>
  )
}
