import type { StatusTone } from "@/components/shared"
import type { WebhookLogStatus, WebhookStatus } from "@/lib/webhooks/types"

export const WEBHOOK_STATUS_TONES: Record<WebhookStatus, StatusTone> = {
  active: "success",
  test: "info",
  inactive: "neutral",
}

export const LOG_STATUS_TONES: Record<WebhookLogStatus, StatusTone> = {
  success: "success",
  error: "danger",
  skipped: "neutral",
}
