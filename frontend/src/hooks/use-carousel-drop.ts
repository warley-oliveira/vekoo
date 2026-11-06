import { useState, type DragEvent } from "react"

import { CAROUSEL_DRAG_TYPE } from "@/lib/view-prefs"

/** Alvo de soltar carrossel: a linha acende enquanto o arraste passa por cima. */
export function useCarouselDrop(onDrop: (carouselId: string) => void) {
  const [dragOver, setDragOver] = useState(false)

  return {
    dragOver,
    dropHandlers: {
      onDragOver: (event: DragEvent) => {
        if (event.dataTransfer.types.includes(CAROUSEL_DRAG_TYPE)) {
          event.preventDefault()
          setDragOver(true)
        }
      },
      onDragLeave: () => setDragOver(false),
      onDrop: (event: DragEvent) => {
        event.preventDefault()
        setDragOver(false)
        const id = event.dataTransfer.getData(CAROUSEL_DRAG_TYPE)
        if (id) onDrop(id)
      },
    },
  }
}
