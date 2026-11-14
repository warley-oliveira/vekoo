import { useTranslation } from "react-i18next"
import { AlertTriangle, Check, Clock, Loader2, RefreshCw } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import type { Piece } from "@/lib/engines"

/** O estado da peça numa etiqueta só: fila, gerando, pronta, falhou — e desatualizada. */
export function PieceStatusBadge({ piece }: { piece: Piece }) {
  const { t } = useTranslation()

  if (piece.status === "failed") {
    return <Badge variant="destructive"><AlertTriangle /> {t("pieces.status.failed")}</Badge>
  }
  if (piece.status === "rendering") {
    return <Badge variant="secondary"><Loader2 className="animate-spin" /> {t("pieces.status.rendering")}</Badge>
  }
  if (piece.status === "queued") {
    return <Badge variant="outline"><Clock /> {t("pieces.status.queued")}</Badge>
  }
  if (piece.status === "draft") {
    return <Badge variant="outline">{t("pieces.status.draft")}</Badge>
  }
  if (piece.outdated) {
    return <Badge variant="outline"><RefreshCw /> {t("pieces.status.outdated")}</Badge>
  }
  return <Badge variant="secondary"><Check /> {t("pieces.status.ready")}</Badge>
}
