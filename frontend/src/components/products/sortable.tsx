import { useMemo, type ComponentProps, type ReactNode } from "react"
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useReducedMotion } from "motion/react"
import { useTranslation } from "react-i18next"
import { GripVertical } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// Arrastar para reordenar, em toque, mouse e teclado. Serve às fotos, às categorias e aos
// campos. O kit ainda não tem isto; é genérico o bastante para subir para lá depois.

const TOUCH_DELAY_MS = 180
const TOUCH_TOLERANCE_PX = 8
const MOUSE_DISTANCE_PX = 6

type SortableAreaProps<T extends { id: string }> = {
  items: readonly T[]
  /** A lista já na ordem nova. */
  onReorder: (ordered: T[]) => void
  /** `grid` para fotos, `list` para linhas. */
  layout?: "list" | "grid"
  /** O nome que o leitor de tela anuncia ao pegar e soltar. */
  nameOf: (item: T) => string
  disabled?: boolean
  children: ReactNode
}

export function SortableArea<T extends { id: string }>({
  items,
  onReorder,
  layout = "list",
  nameOf,
  disabled = false,
  children,
}: SortableAreaProps<T>) {
  const { t } = useTranslation()

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: MOUSE_DISTANCE_PX } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: TOUCH_DELAY_MS, tolerance: TOUCH_TOLERANCE_PX },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const accessibility = useMemo(() => {
    const name = (id: UniqueIdentifier | undefined) => {
      const found = items.find((item) => item.id === id)
      return found ? nameOf(found) : ""
    }
    const position = (id: UniqueIdentifier | undefined) =>
      items.findIndex((item) => item.id === id) + 1

    const announcements: Announcements = {
      onDragStart: ({ active }) =>
        t("products.sortable.picked", { name: name(active.id), position: position(active.id), total: items.length }),
      onDragOver: ({ active, over }) =>
        over
          ? t("products.sortable.over", { name: name(active.id), position: position(over.id), total: items.length })
          : undefined,
      onDragEnd: ({ active, over }) =>
        t("products.sortable.dropped", { name: name(active.id), position: position(over?.id ?? active.id), total: items.length }),
      onDragCancel: ({ active }) => t("products.sortable.cancelled", { name: name(active.id) }),
    }

    return {
      announcements,
      screenReaderInstructions: { draggable: t("products.sortable.instructions") },
    }
  }, [items, nameOf, t])

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    const from = items.findIndex((item) => item.id === active.id)
    const to = items.findIndex((item) => item.id === over.id)
    if (from >= 0 && to >= 0) onReorder(arrayMove([...items], from, to))
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      accessibility={accessibility}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={items.map((item) => item.id)}
        strategy={layout === "grid" ? rectSortingStrategy : verticalListSortingStrategy}
        disabled={disabled}
      >
        {children}
      </SortableContext>
    </DndContext>
  )
}

/** Liga um elemento à reordenação. `handleProps` vai em quem a pessoa pega. */
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

/** O pegador de uma linha. `touch-none`: arrastar por aqui não rola a página. */
export function DragHandle({
  label,
  className,
  ...props
}: ComponentProps<typeof Button> & { label: string }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      className={cn(
        "cursor-grab touch-none text-muted-foreground/70 active:cursor-grabbing",
        className
      )}
      {...props}
    >
      <GripVertical />
    </Button>
  )
}
