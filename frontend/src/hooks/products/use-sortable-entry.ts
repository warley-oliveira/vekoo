import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useReducedMotion } from "motion/react"

/** Liga um elemento à reordenação de `SortableArea`. `handleProps` vai em quem a pessoa pega. */
export function useSortableEntry(id: string) {
  const reduced = useReducedMotion()
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, transition: reduced ? null : undefined })

  return {
    setNodeRef,
    isDragging,
    style: {
      // `Translate`, e não `Transform`: item de altura diferente não pode achatar ao passar.
      transform: CSS.Translate.toString(transform),
      transition: transition ?? undefined,
      zIndex: isDragging ? 20 : undefined,
    },
    handleProps: { ref: setActivatorNodeRef, ...attributes, ...listeners },
  }
}
