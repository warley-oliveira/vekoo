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
  type KeyboardSensorProps,
  type UniqueIdentifier,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { useTranslation } from "react-i18next"
import { GripVertical } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// Arrastar para reordenar, em toque, mouse e teclado. Serve às fotos, às categorias e aos
// campos, e a qualquer lista que a pessoa ordena.

const TOUCH_DELAY_MS = 180
const TOUCH_TOLERANCE_PX = 8
const MOUSE_DISTANCE_PX = 6

/** As teclas que o arrasto por teclado usa. O resto continua o caminho de sempre. */
const DRAG_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
  "Enter",
  "Tab",
  "Escape",
])

/**
 * O sensor de teclado do dnd-kit ouve no `document`, na bolha. Dentro de `SidePanel` e
 * `ResponsiveDialog`, as setas nunca chegam lá, porque o `Dialog` do Base UI para a propagação delas:
 * a pessoa pegava o item com Espaço e ficava sem como movê-lo. Este ouve na captura, antes do popup,
 * e a tecla usada no arrasto não segue adiante: Esc cancela o arrasto sem fechar o painel.
 */
class LayerSafeKeyboardSensor extends KeyboardSensor {
  constructor(props: KeyboardSensorProps) {
    super(props)
    // O construtor de cima só liga a escuta no próximo tique: dá tempo de trocar como ela é ligada.
    const { listeners } = this as unknown as {
      listeners: { add: (name: string, handler: EventListener, options?: AddEventListenerOptions) => void }
    }
    const add = listeners.add.bind(listeners)
    listeners.add = (name, handler) => {
      const relay: EventListener = (event) => {
        if (DRAG_KEYS.has((event as KeyboardEvent).code)) event.stopPropagation()
        handler(event)
      }
      add(name, relay, { capture: true })
    }
  }
}

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
    useSensor(LayerSafeKeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
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
        t("kit.sortable.picked", { name: name(active.id), position: position(active.id), total: items.length }),
      onDragOver: ({ active, over }) =>
        over
          ? t("kit.sortable.over", { name: name(active.id), position: position(over.id), total: items.length })
          : undefined,
      onDragEnd: ({ active, over }) =>
        t("kit.sortable.dropped", { name: name(active.id), position: position(over?.id ?? active.id), total: items.length }),
      onDragCancel: ({ active }) => t("kit.sortable.cancelled", { name: name(active.id) }),
    }

    return {
      announcements,
      screenReaderInstructions: { draggable: t("kit.sortable.instructions") },
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
