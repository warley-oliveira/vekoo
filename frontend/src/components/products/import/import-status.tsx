import { useTranslation } from "react-i18next"

import { StatusBadge, type StatusTone } from "@/components/shared"
import { isImportAbandoned, isImportRunning } from "@/hooks/products/use-product-imports"
import type { ProductImport } from "@/lib/products/types"

type StatusKey = "running" | "queued" | "completed" | "completedWithErrors" | "failed" | "abandoned"

const TONES: Record<StatusKey, StatusTone> = {
  running: "info",
  queued: "info",
  completed: "success",
  completedWithErrors: "warning",
  failed: "danger",
  abandoned: "neutral",
}

function statusKey(entry: ProductImport): StatusKey {
  if (entry.status === "failed") return "failed"
  if (entry.status === "completed") {
    return entry.errorCount > 0 ? "completedWithErrors" : "completed"
  }
  if (entry.status === "processing") return "running"
  if (isImportRunning(entry)) return "queued"
  return isImportAbandoned(entry) ? "abandoned" : "queued"
}

export function ImportStatusBadge({ entry }: { entry: ProductImport }) {
  const { t } = useTranslation()
  const key = statusKey(entry)

  return <StatusBadge tone={TONES[key]}>{t(`products.import.status.${key}`)}</StatusBadge>
}
