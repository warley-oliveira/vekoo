import {
  KeyboardCode,
  closestCorners,
  getFirstCollision,
  type DroppableContainer,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core"

// O arraste por teclado entre etapas. O `sortableKeyboardCoordinates` do dnd-kit só anda dentro de
// uma lista: aqui as setas para o lado levam à etapa vizinha, e para cima e para baixo, ao card
// vizinho, na etapa em que o card estiver.

/** No celular, cada aba do seletor também recebe o card. */
export const STAGE_TAB_PREFIX = "stage-tab:"

const DIRECTIONS: string[] = [
  KeyboardCode.Down,
  KeyboardCode.Right,
  KeyboardCode.Up,
  KeyboardCode.Left,
]

export const boardKeyboardCoordinates: KeyboardCoordinateGetter = (
  event,
  { context: { active, droppableRects, droppableContainers, collisionRect } }
) => {
  if (!DIRECTIONS.includes(event.code)) return undefined
  event.preventDefault()
  if (!active || !collisionRect) return undefined

  const candidates: DroppableContainer[] = []

  droppableContainers.getEnabled().forEach((entry) => {
    if (!entry || String(entry.id).startsWith(STAGE_TAB_PREFIX)) return
    const rect = droppableRects.get(entry.id)
    if (!rect) return

    // Etapa com cards recebe por eles: pular para a etapa em si cairia fora da lista.
    const data = entry.data.current as { type?: string; count?: number } | undefined
    if (data?.type === "stage" && (data.count ?? 0) > 0) return

    switch (event.code) {
      case KeyboardCode.Down:
        if (collisionRect.top < rect.top) candidates.push(entry)
        break
      case KeyboardCode.Up:
        if (collisionRect.top > rect.top) candidates.push(entry)
        break
      case KeyboardCode.Left:
        if (collisionRect.left >= rect.left + rect.width) candidates.push(entry)
        break
      case KeyboardCode.Right:
        if (collisionRect.left + collisionRect.width <= rect.left) candidates.push(entry)
        break
    }
  })

  const closestId = getFirstCollision(
    closestCorners({
      active,
      collisionRect,
      droppableRects,
      droppableContainers: candidates,
      pointerCoordinates: null,
    }),
    "id"
  )
  if (closestId === null || closestId === undefined) return undefined

  const target = droppableContainers.get(closestId)
  const rect = target?.rect.current
  if (!target?.node.current || !rect) return undefined

  if (target.data.current?.type === "stage") {
    return { x: rect.left + 12, y: rect.top + 56 }
  }
  return { x: rect.left, y: rect.top }
}
