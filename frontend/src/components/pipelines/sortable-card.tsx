import { memo, useMemo, type KeyboardEvent, type MouseEvent } from "react"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useTranslation } from "react-i18next"

import { useBoardDrag } from "@/hooks/pipelines/use-board-drag"
import { useBoardUi } from "@/hooks/pipelines/use-board-ui"
import { useCardActions } from "@/hooks/pipelines/use-card-actions"
import type { Card } from "@/lib/pipelines/types"
import { cn } from "@/lib/utils"
import { CardBody, type BoardMeta } from "./pipeline-card"

type SortableCardProps = {
  card: Card
  stageId: string
  meta: BoardMeta
}

/**
 * A casca que o dnd-kit movimenta. `useSortable` assina o contexto do arraste, e por isso esta
 * camada redesenha toda vez que o alvo muda: ela é fina de propósito, e o conteúdo, `CardBody`,
 * fica de fora disso. É o que mantém o arraste leve num quadro cheio.
 */
export const SortableCard = memo(function SortableCard({ card, stageId, meta }: SortableCardProps) {
  const { t } = useTranslation()
  const actions = useCardActions()

  const selected = useBoardUi((state) => Boolean(state.selected[card.id]))
  const selecting = useBoardUi((state) => state.selectedCount > 0)
  const blocked = useBoardUi((state) => state.blocked[card.id])
  const fresh = useBoardUi((state) => Boolean(state.fresh[card.id]))
  const toggleSelected = useBoardUi((state) => state.toggleSelected)

  const data = useMemo(
    () => ({ type: "card" as const, stageId, title: card.title }),
    [stageId, card.title]
  )

  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: card.id,
    data,
    disabled: selecting,
    transition: meta.reducedMotion ? null : undefined,
    attributes: { role: "group", roleDescription: t("pipelines.dnd.roleDescription") },
  })

  function onClick(event: MouseEvent) {
    if (selecting || event.shiftKey || event.metaKey || event.ctrlKey) {
      toggleSelected(card.id)
      return
    }
    actions.open(card.id)
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    listeners?.onKeyDown?.(event)
    if (event.key !== "Enter" || event.target !== event.currentTarget) return
    // Com o card no ar, Enter é soltar: quem cuida é o sensor de teclado.
    if (useBoardDrag.getState().activeId) return
    event.preventDefault()
    if (selecting) toggleSelected(card.id)
    else actions.open(card.id)
  }

  return (
    <div
      ref={(node) => {
        setNodeRef(node)
        setActivatorNodeRef(node)
      }}
      data-card-id={card.id}
      aria-label={card.title}
      style={{ transform: CSS.Translate.toString(transform), transition: transition ?? undefined }}
      className={cn(
        "cursor-pointer rounded-xl outline-none select-none [-webkit-touch-callout:none] focus-visible:ring-3 focus-visible:ring-ring/50",
        "touch-manipulation",
        isDragging && "cursor-grabbing",
        fresh && "animate-in duration-200 fade-in-0 slide-in-from-bottom-1"
      )}
      {...attributes}
      {...listeners}
      onKeyDown={onKeyDown}
      onClick={onClick}
      // No celular, segurar é arrastar: o menu do navegador não pode abrir por cima.
      onContextMenu={(event) => {
        if (window.matchMedia("(pointer: coarse)").matches) event.preventDefault()
      }}
    >
      <CardBody
        card={card}
        meta={meta}
        ghost={isDragging}
        selected={selected}
        selecting={selecting}
        blocked={blocked}
      />
    </div>
  )
})
