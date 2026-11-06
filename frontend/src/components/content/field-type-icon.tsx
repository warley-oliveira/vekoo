import type { ComponentType } from "react"
import { CalendarDays, Hash, List, SquareCheck, Type } from "lucide-react"

import type { CustomFieldValueType } from "@/lib/content/types"

const ICONS: Record<CustomFieldValueType, ComponentType<{ className?: string }>> = {
  text: Type,
  number: Hash,
  list: List,
  checkbox: SquareCheck,
  date: CalendarDays,
}

export function FieldTypeIcon({
  type,
  className,
}: {
  type: CustomFieldValueType
  className?: string
}) {
  const Icon = ICONS[type] ?? Type
  return <Icon aria-hidden className={className} />
}
