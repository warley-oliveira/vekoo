import {
  CalendarDays,
  CheckSquare,
  Hash,
  Link2,
  ListFilter,
  Type,
  UserRound,
  type LucideIcon,
} from "lucide-react"

import type { CustomFieldType } from "@/lib/pipelines-admin/types"

export const FIELD_TYPE_ICONS: Record<CustomFieldType, LucideIcon> = {
  text: Type,
  number: Hash,
  date: CalendarDays,
  select: ListFilter,
  checkbox: CheckSquare,
  url: Link2,
  user: UserRound,
}
