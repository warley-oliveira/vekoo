import {
  ArrowRightLeft,
  Bell,
  Code2,
  CopyPlus,
  FileText,
  MessageCircle,
  PauseCircle,
  UserPlus,
  Webhook,
  type LucideIcon,
} from "lucide-react"

import type { TriggerActionType } from "@/lib/pipelines-admin/types"

export const ACTION_ICONS: Record<TriggerActionType, LucideIcon> = {
  notify: Bell,
  move_card: ArrowRightLeft,
  assign_user: UserPlus,
  create_card: CopyPlus,
  send_whatsapp_message: MessageCircle,
  send_whatsapp_template: FileText,
  toggle_automation: PauseCircle,
  fire_webhook: Webhook,
  run_code: Code2,
}
