import { memo, useCallback, useEffect, useMemo, useRef } from "react"
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  defaultDropAnimationSideEffects,
  getFirstCollision,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DropAnimation,
  type UniqueIdentifier,
} from "@dnd-kit/core"
import { arrayMove } from "@dnd-kit/sortable"
import { motion } from "motion/react"
import { useTranslation } from "react-i18next"

import { stageOfCard, useBoardDrag } from "@/hooks/pipelines/use-board-drag"
import { useBoardUi } from "@/hooks/pipelines/use-board-ui"
import { useCardActions } from "@/hooks/pipelines/use-card-actions"
import { useIsMobile } from "@/hooks/use-is-mobile"
import { spring } from "@/lib/motion"
import { STAGE_TAB_PREFIX, boardKeyboardCoordinates } from "@/lib/pipelines/dnd"
import type { Card, StageWithCards } from "@/lib/pipelines/types"
import { cn } from "@/lib/utils"
import { CardBody, type BoardMeta } from "./pipeline-card"
import { StageColumn } from "./stage-column"

const MOUSE_DISTANCE_PX = 6
const TOUCH_DELAY_MS = 250
const TOUCH_TOLERANCE_PX = 8
/** Enter abre o card: com o card no ar, Enter e Espaço soltam. */
const KEYBOARD_CODES = {
  start: ["Space"],
  cancel: ["Escape"],
  end: ["Space", "Enter", "NumpadEnter"],
}

const DROP_ANIMATION: DropAnimation = {
  duration: 200,
  easing: "cubic-bezier(0.2, 0, 0, 1)",
  sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: "0" } } }),
}

const AUTO_SCROLL = {
  threshold: { x: 0.12, y: 0.15 },
  acceleration: 8,
}

const isTab = (id: UniqueIdentifier) => String(id).startsWith(STAGE_TAB_PREFIX)
const tabStage = (id: UniqueIdentifier) => String(id).slice(STAGE_TAB_PREFIX.length)

/** A cópia que acompanha o ponteiro. Assina só o card no ar. */
const BoardDragOverlay = memo(function BoardDragOverlay({ meta }: { meta: BoardMeta }) {
  const card = useBoardDrag((state) => state.activeCard)

  return (
    <DragOverlay dropAnimation={meta.reducedMotion ? null : DROP_ANIMATION}>
      {card ? (
        <motion.div
          initial={false}
          animate={meta.reducedMotion ? undefined : { rotate: 1.5, scale: 1.02 }}
          transition={spring}
          className="cursor-grabbing"
        >
          <CardBody card={card} meta={meta} overlay />
        </motion.div>
      ) : null}
    </DragOverlay>
  )
})

/** No celular só uma etapa está à vista: a aba também recebe o card e leva até a etapa dela. */
function StageTab({
  stage,
  count,
  active,
  onSelect,
}: {
  stage: StageWithCards
  count: number
  active: boolean
  onSelect: () => void
}) {
  const data = useMemo(() => ({ type: "tab" as const, stageId: stage.id }), [stage.id])
  const { setNodeRef, isOver } = useDroppable({ id: `${STAGE_TAB_PREFIX}${stage.id}`, data })

  return (
    <button
      ref={setNodeRef}
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onSelect}
      className={cn(
        "relative inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        active ? "font-medium text-foreground" : "text-muted-foreground",
        isOver && "bg-primary/10 text-foreground"
      )}
    >
      {active ? (
        <motion.span
          layoutId="pipeline-stage-tab"
          transition={spring}
          className="absolute inset-0 rounded-lg bg-muted"
        />
      ) : null}
      <span className="relative z-10">{stage.name}</span>
      <span className="relative z-10 text-xs text-muted-foreground tabular-nums">{count}</span>
    </button>
  )
}

function StageTabs({
  stages,
  activeStageId,
  onSelect,
}: {
  stages: StageWithCards[]
  activeStageId: string | null
  onSelect: (stageId: string) => void
}) {
  const { t } = useTranslation()
  const columns = useBoardDrag((state) => state.columns)
  const listRef = useRef<HTMLDivElement>(null)

  // A aba da etapa à vista não pode ficar fora da faixa.
  useEffect(() => {
    if (!activeStageId) return
    const node = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')
    node?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" })
  }, [activeStageId])

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={t("pipelines.stage.selector")}
      className="flex shrink-0 gap-1 overflow-x-auto px-4 pb-2 [scrollbar-width:none]"
    >
      {stages.map((stage) => (
        <StageTab
          key={stage.id}
          stage={stage}
          count={(columns?.[stage.id] ?? stage.cards).length}
          active={stage.id === activeStageId}
          onSelect={() => onSelect(stage.id)}
        />
      ))}
    </div>
  )
}

type BoardCanvasProps = {
  stages: StageWithCards[]
  /** Quantos cards cada etapa tem sem o filtro. */
  totalsByStage: Record<string, number>
  meta: BoardMeta
  filtered: boolean
}

/**
 * O quadro: as etapas lado a lado e o arraste. O `DndContext` redesenha a cada movimento do
 * ponteiro, mas os filhos dele não: as colunas chegam prontas de fora e são memorizadas. Durante o
 * arraste, as listas vêm de `useBoardDrag`, e o cache do SWR só muda ao soltar.
 */
export const BoardCanvas = memo(function BoardCanvas({
  stages,
  totalsByStage,
  meta,
  filtered,
}: BoardCanvasProps) {
  const { t } = useTranslation()
  const actions = useCardActions()
  const isMobile = useIsMobile()
  const activeStageId = useBoardUi((state) => state.activeStageId)
  const setActiveStage = useBoardUi((state) => state.setActiveStage)

  const scrollerRef = useRef<HTMLDivElement>(null)
  const stagesRef = useRef(stages)
  stagesRef.current = stages

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: MOUSE_DISTANCE_PX } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: TOUCH_DELAY_MS, tolerance: TOUCH_TOLERANCE_PX },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: boardKeyboardCoordinates,
      keyboardCodes: KEYBOARD_CODES,
    })
  )

  /* ---------- colisão ---------- */

  const lastOverId = useRef<UniqueIdentifier | null>(null)
  const recentlyMovedToNewStage = useRef(false)

  // Estável: lê as listas do store. Trocar esta função redesenharia o `DndContext` à toa.
  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const columns = useBoardDrag.getState().columns ?? {}
    const pointer = pointerWithin(args)
    const hits = pointer.length > 0 ? pointer : rectIntersection(args)

    const tab = hits.find((hit) => isTab(hit.id))
    if (tab) {
      lastOverId.current = tab.id
      return [tab]
    }

    let overId = getFirstCollision(hits, "id")
    if (overId !== null && overId !== undefined) {
      const items = columns[String(overId)]
      if (items && items.length > 0) {
        // Sobre a etapa, e não sobre um card dela: vale o card mais perto.
        const ids = new Set(items.map((card) => card.id))
        const closest = closestCenter({
          ...args,
          droppableContainers: args.droppableContainers.filter(
            (container) => container.id !== overId && ids.has(String(container.id))
          ),
        })
        overId = closest[0]?.id ?? overId
      }
      lastOverId.current = overId
      return [{ id: overId }]
    }

    // O card acabou de mudar de etapa: as medidas ainda não assentaram, e sem isso o alvo piscaria.
    if (recentlyMovedToNewStage.current) lastOverId.current = args.active.id
    return lastOverId.current !== null ? [{ id: lastOverId.current }] : []
  }, [])

  // Sem assinar por hook: este componente não precisa redesenhar quando um card muda de etapa.
  useEffect(
    () =>
      useBoardDrag.subscribe((state, previous) => {
        if (state.columns === previous.columns) return
        requestAnimationFrame(() => {
          recentlyMovedToNewStage.current = false
        })
      }),
    []
  )

  /* ---------- arraste ---------- */

  const setDraggingAttribute = (on: boolean) => {
    // Sem re-render: o `snap` do celular desliga enquanto o card está no ar, porque cada passo da
    // rolagem automática seria desfeito por ele.
    if (scrollerRef.current) {
      if (on) scrollerRef.current.dataset.dragging = "true"
      else delete scrollerRef.current.dataset.dragging
    }
  }

  const scrollToStage = useCallback(
    (stageId: string) => {
      const node = scrollerRef.current?.querySelector<HTMLElement>(
        `[data-stage-id="${CSS.escape(stageId)}"]`
      )
      node?.scrollIntoView({
        behavior: meta.reducedMotion ? "auto" : "smooth",
        block: "nearest",
        inline: "center",
      })
    },
    [meta.reducedMotion]
  )

  function onDragStart({ active }: DragStartEvent) {
    const columns: Record<string, Card[]> = {}
    let origin: { card: Card; stageId: string; index: number } | null = null

    for (const stage of stagesRef.current) {
      columns[stage.id] = stage.cards
      const index = stage.cards.findIndex((card) => card.id === active.id)
      if (index >= 0) origin = { card: stage.cards[index], stageId: stage.id, index }
    }
    if (!origin) return

    lastOverId.current = null
    setDraggingAttribute(true)
    useBoardDrag.getState().begin(columns, origin.card, origin.stageId, origin.index)
    if (typeof navigator.vibrate === "function") navigator.vibrate(8)
  }

  function onDragOver({ active, over }: DragOverEvent) {
    const drag = useBoardDrag.getState()
    if (!over || !drag.columns) return

    const activeId = String(active.id)
    const overId = String(over.id)
    const fromStage = stageOfCard(drag.columns, activeId)

    let toStage: string | null
    if (isTab(over.id)) toStage = tabStage(over.id)
    else if (drag.columns[overId]) toStage = overId
    else toStage = stageOfCard(drag.columns, overId)

    if (!fromStage || !toStage || fromStage === toStage) return

    const target = drag.columns[toStage]
    const overIndex = target.findIndex((card) => card.id === overId)
    let index = target.length
    if (overIndex >= 0) {
      const translated = active.rect.current.translated
      const below = translated ? translated.top > over.rect.top + over.rect.height : false
      index = overIndex + (below ? 1 : 0)
    }

    recentlyMovedToNewStage.current = true
    drag.moveAcross(fromStage, toStage, index)
    if (isMobile) scrollToStage(toStage)
  }

  function finish() {
    setDraggingAttribute(false)
    useBoardDrag.getState().end()
    lastOverId.current = null
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    const drag = useBoardDrag.getState()
    if (!drag.columns || !over) return finish()

    const activeId = String(active.id)
    const stageId = stageOfCard(drag.columns, activeId)
    if (!stageId) return finish()

    let list = drag.columns[stageId]
    const from = list.findIndex((card) => card.id === activeId)
    const to = list.findIndex((card) => card.id === over.id)
    if (to >= 0 && from !== to) list = arrayMove(list, from, to)

    const index = list.findIndex((card) => card.id === activeId)
    const unchanged = stageId === drag.fromStageId && index === drag.fromIndex

    if (!unchanged) {
      void actions.drop({
        cardId: activeId,
        toStageId: stageId,
        previousId: list[index - 1]?.id ?? null,
        nextId: list[index + 1]?.id ?? null,
      })
    }
    finish()
  }

  /* ---------- leitor de tela ---------- */

  const accessibility = useMemo(() => {
    const titleOf = (id: UniqueIdentifier) => {
      const columns = useBoardDrag.getState().columns
      const card = columns
        ? Object.values(columns)
            .flat()
            .find((candidate) => candidate.id === id)
        : null
      return card?.title ?? ""
    }
    const whereIs = (id: UniqueIdentifier) => {
      const columns = useBoardDrag.getState().columns
      const stageId = columns ? stageOfCard(columns, String(id)) : null
      if (!columns || !stageId) return { stage: "", position: 0, total: 0 }
      const list = columns[stageId]
      return {
        stage: stagesRef.current.find((stage) => stage.id === stageId)?.name ?? "",
        position: list.findIndex((card) => card.id === id) + 1,
        total: list.length,
      }
    }

    const announcements: Announcements = {
      onDragStart: ({ active }) =>
        t("pipelines.dnd.picked", { title: titleOf(active.id), ...whereIs(active.id) }),
      onDragOver: ({ active }) =>
        t("pipelines.dnd.over", { title: titleOf(active.id), ...whereIs(active.id) }),
      onDragEnd: ({ active }) =>
        t("pipelines.dnd.dropped", { title: titleOf(active.id), ...whereIs(active.id) }),
      onDragCancel: ({ active }) => t("pipelines.dnd.cancelled", { title: titleOf(active.id) }),
    }
    return {
      announcements,
      screenReaderInstructions: { draggable: t("pipelines.dnd.instructions") },
    }
  }, [t])

  /* ---------- etapa à vista no celular ---------- */

  useEffect(() => {
    const scroller = scrollerRef.current
    if (!isMobile || !scroller) return

    let frame = 0
    const update = () => {
      frame = 0
      const middle = scroller.getBoundingClientRect().left + scroller.clientWidth / 2
      const nodes = scroller.querySelectorAll<HTMLElement>("[data-stage-id]")
      for (const node of nodes) {
        const rect = node.getBoundingClientRect()
        if (rect.left <= middle && rect.right >= middle) {
          if (useBoardUi.getState().activeStageId !== node.dataset.stageId) {
            setActiveStage(node.dataset.stageId ?? null)
          }
          return
        }
      }
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }

    update()
    scroller.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      scroller.removeEventListener("scroll", onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
    // Trocar a lista de etapas (filtro, etapa nova) muda quem está no meio.
  }, [isMobile, setActiveStage, stages.length])

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      accessibility={accessibility}
      autoScroll={AUTO_SCROLL}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={finish}
    >
      {isMobile ? (
        <StageTabs stages={stages} activeStageId={activeStageId} onSelect={scrollToStage} />
      ) : null}

      <div
        ref={scrollerRef}
        className={cn(
          "flex min-h-0 flex-1 items-start gap-3 overflow-x-auto overflow-y-hidden overscroll-x-contain px-4 pb-[calc(0.75rem+var(--app-bottom-nav-total))] md:px-6",
          "snap-x snap-mandatory scroll-px-4 data-[dragging]:snap-none md:snap-none"
        )}
      >
        {stages.map((stage) => (
          <StageColumn
            key={stage.id}
            stage={stage}
            meta={meta}
            filtered={filtered}
            totalCount={totalsByStage[stage.id] ?? stage.cards.length}
          />
        ))}
      </div>

      <BoardDragOverlay meta={meta} />
    </DndContext>
  )
})
