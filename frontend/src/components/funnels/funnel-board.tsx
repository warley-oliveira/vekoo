import { useCallback, useEffect, useMemo, useState } from "react"
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core"
import { useTranslation } from "react-i18next"
import { Plus } from "lucide-react"

import { useIsMobile } from "@/hooks/use-is-mobile"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { useMotionPreset } from "@/lib/motion"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { BoardColumn, type StageActions } from "./board-column"
import { columnKey } from "./board-state"
import { ChatCardPreview, chatName } from "./chat-card"
import type { BoardChat, BoardColumn as BoardColumnData, FunnelBoard } from "./types"

const MOUSE_DISTANCE_PX = 6
const TOUCH_DELAY_MS = 200
const TOUCH_TOLERANCE_PX = 8

/** Com ponteiro, a coluna sob ele. Com teclado não há ponteiro: a que o cartão cobre. */
const detectColumn: CollisionDetection = (args) => {
  const pointer = pointerWithin(args)
  return pointer.length > 0 ? pointer : rectIntersection(args)
}

/** As setas pulam de coluna em coluna, em vez de andar de 25 em 25 px como no padrão. */
const columnCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
  const { active, collisionRect, droppableRects, droppableContainers } = context
  const direction = event.code === "ArrowRight" ? 1 : event.code === "ArrowLeft" ? -1 : 0
  if (["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"].includes(event.code)) event.preventDefault()
  if (direction === 0 || !active || !collisionRect) return undefined

  const columns = droppableContainers
    .getEnabled()
    .flatMap((container) => {
      const rect = droppableRects.get(container.id)
      return rect ? [rect] : []
    })
    .sort((a, b) => a.left - b.left)

  const center = collisionRect.left + collisionRect.width / 2
  const current = columns.findIndex((rect) => center >= rect.left && center <= rect.right)
  const target = columns[current + direction]
  if (!target) return undefined

  return { x: target.left + (target.width - collisionRect.width) / 2, y: collisionRect.top }
}

type FunnelBoardViewProps = {
  board: FunnelBoard
  showNoStage: boolean
  loadingColumns: ReadonlySet<string>
  stageActions: StageActions
  onAddStage: () => void
  onHideNoStage: () => void
  onLoadMore: (column: BoardColumnData) => void
  onDropChat: (chat: BoardChat, toStageId: string | null) => void
  onOpen: (chat: BoardChat) => void
  onOpenChat: (chat: BoardChat) => void
  onMove: (chat: BoardChat) => void
}

export function FunnelBoardView({
  board,
  showNoStage,
  loadingColumns,
  stageActions,
  onAddStage,
  onHideNoStage,
  onLoadMore,
  onDropChat,
  onOpen,
  onOpenChat,
  onMove,
}: FunnelBoardViewProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const isMobile = useIsMobile()
  const preset = useMotionPreset()
  const [activeChat, setActiveChat] = useState<BoardChat | null>(null)

  const columns = useMemo(
    () => board.columns.filter((column) => showNoStage || column.stageId !== null),
    [board.columns, showNoStage]
  )
  const stageColumns = useMemo(
    () => board.columns.filter((column) => column.stageId !== null),
    [board.columns]
  )

  /* ---------- celular: uma coluna por vez ---------- */

  const [mobileColumn, setMobileColumn] = useState<string | null>(null)
  const selected = columns.find((column) => columnKey(column.stageId) === mobileColumn)
  // A primeira etapa com conversa: abrir em "Sem etapa", ou numa coluna vazia, esconderia o quadro.
  const fallback =
    columns.find((column) => column.stageId !== null && column.count > 0) ??
    columns.find((column) => column.stageId !== null) ??
    columns[0]
  const mobileShown = selected ?? fallback

  // Trocou de funil, e a coluna escolhida não existe mais: volta à primeira, em vez de lembrar um id morto.
  useEffect(() => {
    if (mobileColumn && !selected) setMobileColumn(null)
  }, [mobileColumn, selected])

  /* ---------- arrastar ---------- */

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: MOUSE_DISTANCE_PX } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: TOUCH_DELAY_MS, tolerance: TOUCH_TOLERANCE_PX },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: columnCoordinates,
      // Enter é abrir o painel, no próprio botão do cartão. Espaço pega e solta.
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] },
    })
  )

  const stageNameOf = useCallback(
    (id: string | number | undefined) =>
      board.columns.find((column) => columnKey(column.stageId) === id)?.stageName ?? "",
    [board.columns]
  )
  const nameOf = useCallback(
    (data: unknown) => {
      const chat = (data as { chat?: BoardChat } | undefined)?.chat
      return chat ? chatName(chat, t("funnels.card.noName")) : ""
    },
    [t]
  )

  const accessibility = useMemo(() => {
    const announcements: Announcements = {
      onDragStart: ({ active }) => t("funnels.dnd.picked", { name: nameOf(active.data.current) }),
      onDragOver: ({ active, over }) =>
        over
          ? t("funnels.dnd.over", { name: nameOf(active.data.current), stage: stageNameOf(over.id) })
          : undefined,
      onDragEnd: ({ active, over }) =>
        over
          ? t("funnels.dnd.dropped", { name: nameOf(active.data.current), stage: stageNameOf(over.id) })
          : t("funnels.dnd.cancelled", { name: nameOf(active.data.current) }),
      onDragCancel: ({ active }) => t("funnels.dnd.cancelled", { name: nameOf(active.data.current) }),
    }
    return { announcements, screenReaderInstructions: { draggable: t("funnels.dnd.instructions") } }
  }, [nameOf, stageNameOf, t])

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveChat((event.active.data.current as { chat: BoardChat }).chat)
  }, [])

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      setActiveChat(null)
      if (!over) return
      const chat = (active.data.current as { chat: BoardChat }).chat
      const toStageId = (over.data.current as { stageId: string | null }).stageId
      if (chat.stageId !== toStageId) onDropChat(chat, toStageId)
    },
    [onDropChat]
  )

  if (isMobile) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div
          role="tablist"
          aria-label={t("funnels.column.choose")}
          className="-mx-4 flex shrink-0 gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]"
        >
          {columns.map((column) => {
            const active = columnKey(column.stageId) === columnKey(mobileShown.stageId)
            return (
              <button
                key={columnKey(column.stageId)}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setMobileColumn(columnKey(column.stageId))}
                className={cn(
                  "flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm whitespace-nowrap ring-1 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  active
                    ? "bg-accent font-medium text-accent-foreground ring-primary/40"
                    : "text-muted-foreground ring-foreground/10"
                )}
              >
                {column.stageName}
                <span className="text-xs tabular-nums">{formatNumber(column.count, language)}</span>
              </button>
            )
          })}
        </div>

        <BoardColumn
          key={columnKey(mobileShown.stageId)}
          column={mobileShown}
          conversionRate={conversionOf(board, mobileShown)}
          stageIndex={stageColumns.indexOf(mobileShown)}
          stageCount={stageColumns.length}
          isLoadingMore={loadingColumns.has(columnKey(mobileShown.stageId))}
          isDragging={false}
          draggable={false}
          stageActions={stageActions}
          onHideNoStage={onHideNoStage}
          onLoadMore={onLoadMore}
          onOpen={onOpen}
          onOpenChat={onOpenChat}
          onMove={onMove}
          className="-mx-1 flex-1 pb-[calc(var(--app-bottom-nav-total)+0.5rem)]"
        />
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={detectColumn}
      accessibility={accessibility}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveChat(null)}
    >
      <div className="-mx-4 flex min-h-0 flex-1 gap-3 overflow-x-auto px-4 pb-3 [scrollbar-width:thin] md:-mx-6 md:px-6">
        {columns.map((column) => (
          <BoardColumn
            key={columnKey(column.stageId)}
            column={column}
            conversionRate={conversionOf(board, column)}
            stageIndex={stageColumns.indexOf(column)}
            stageCount={stageColumns.length}
            isLoadingMore={loadingColumns.has(columnKey(column.stageId))}
            isDragging={activeChat !== null}
            draggable
            stageActions={stageActions}
            onHideNoStage={onHideNoStage}
            onLoadMore={onLoadMore}
            onOpen={onOpen}
            onOpenChat={onOpenChat}
            onMove={onMove}
            className="w-72 shrink-0"
          />
        ))}
        {stageColumns.length < 30 ? (
          <div className="w-44 shrink-0">
            <Button
              type="button"
              variant="ghost"
              className="w-full justify-start border border-dashed text-muted-foreground"
              onClick={onAddStage}
            >
              <Plus />
              {t("funnels.stage.add")}
            </Button>
          </div>
        ) : null}
      </div>
      <DragOverlay dropAnimation={preset.reduced ? null : undefined}>
        {activeChat ? <ChatCardPreview chat={activeChat} /> : null}
      </DragOverlay>
    </DndContext>
  )
}

function conversionOf(board: FunnelBoard, column: BoardColumnData): number | null {
  if (column.stageId === null) return null
  const index = board.columns.filter((entry) => entry.stageId !== null).indexOf(column)
  return board.metrics.conversionRates[index] ?? 0
}
