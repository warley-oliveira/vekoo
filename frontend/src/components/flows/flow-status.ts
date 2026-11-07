import type { StatusTone } from "@/components/shared"
import type { FlowStatus } from "@/lib/flows/types"

export const STATUS_TONES: Record<FlowStatus, StatusTone> = {
  published: "success",
  draft: "neutral",
  archived: "neutral",
}
