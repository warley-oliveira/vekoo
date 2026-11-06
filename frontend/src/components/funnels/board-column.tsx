import { useDroppable } from "@dnd-kit/core"
import { AnimatePresence, motion } from "motion/react"
import { useTranslation } from "react-i18next"
import { ArrowLeft, ArrowRight, EyeOff, Loader2, Pencil, Plus, Trash2 } from "lucide-react"

import { ActionsMenu } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { useMotionPreset } from "@/lib/motion"
import { cn } from "@/lib/utils"
import { formatRate } from "@/components/dashboard/format"
import { columnKey, remainingIn } from "./board-state"
import { ChatCard } from "./chat-card"
import type { BoardChat, BoardColumn as BoardColumnData } from "./types"

export type StageActions = {
  rename: (column: BoardColumnData) => void
  addAfter: (column: BoardColumnData) => void
  moveLeft: (column: BoardColumnData) => void
  moveRight: (column: BoardColumnData) => void
  remove: (column: BoardColumnData) => void
}

type BoardColumnProps = {
  column: BoardColumnData
  /** Da primeira etapa até esta, em pontos percentuais. Nulo em "Sem etapa". */
  conversionRate: number | null
  /** Posição entre as etapas de verdade, para saber o que dá para mover. */
  stageIndex: number
  stageCount: number
  isLoadingMore: boolean
  /** Alguém está arrastando: a coluna vazia diz o que fazer. */
  isDragging: boolean
  draggable: boolean
  stageActions: StageActions
  onHideNoStage: () => void
  onLoadMore: (column: BoardColumnData) => void
  onOpen: (chat: BoardChat) => void
  onOpenChat: (chat: BoardChat) => void
  onMove: (chat: BoardChat) => void
  className?: string
}

export function BoardColumn({
  column,
  conversionRate,
  stageIndex,
  stageCount,
  isLoadingMore,
  isDragging,
  draggable,
  stageActions,
  onHideNoStage,
  onLoadMore,
  onOpen,
  onOpenChat,
  onMove,
  className,
}: BoardColumnProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const preset = useMotionPreset()
  const isNoStage = column.stageId === null
  const remaining = remainingIn(column)

  const { setNodeRef, isOver } = useDroppable({
    id: columnKey(column.stageId),
    data: { stageId: column.stageId, stageName: column.stageName },
  })

  return (
    <section
      ref={setNodeRef}
      aria-label={t("funnels.column.label", { name: column.stageName, count: column.count })}
      className={cn(
        "flex min-h-0 flex-col rounded-xl bg-muted/50 transition-shadow",
        isNoStage && "bg-muted/30",
        isOver && "ring-2 ring-primary/40",
        className
      )}
    >
      <header className="flex shrink-0 items-center gap-2 px-3 pt-2.5 pb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <h2 className="truncate font-heading text-sm font-medium" title={column.stageName}>
              {column.stageName}
            </h2>
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatNumber(column.count, language)}
            </span>
          </div>
          <p className="min-h-4 truncate text-xs text-muted-foreground">
            {isNoStage
              ? t("funnels.column.noStageHint")
              : t("funnels.column.conversion", { value: formatRate(conversionRate ?? 0, language) })}
          </p>
        </div>
        {isNoStage ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("funnels.column.hideNoStage")}
            title={t("funnels.column.hideNoStage")}
            className="text-muted-foreground"
            onClick={onHideNoStage}
          >
            <EyeOff />
          </Button>
        ) : (
          <ActionsMenu
            label={t("funnels.column.actionsOf", { name: column.stageName })}
            actions={[
              {
                label: t("funnels.stage.rename"),
                icon: <Pencil />,
                onSelect: () => stageActions.rename(column),
              },
              {
                label: t("funnels.stage.addAfter"),
                icon: <Plus />,
                disabled: stageCount >= 30,
                onSelect: () => stageActions.addAfter(column),
              },
              {
                label: t("funnels.stage.moveLeft"),
                icon: <ArrowLeft />,
                disabled: stageIndex === 0,
                separatorBefore: true,
                onSelect: () => stageActions.moveLeft(column),
              },
              {
                label: t("funnels.stage.moveRight"),
                icon: <ArrowRight />,
                disabled: stageIndex === stageCount - 1,
                onSelect: () => stageActions.moveRight(column),
              },
              {
                label: t("funnels.stage.delete"),
                icon: <Trash2 />,
                destructive: true,
                // Um funil precisa de pelo menos uma etapa.
                disabled: stageCount <= 1,
                separatorBefore: true,
                onSelect: () => stageActions.remove(column),
              },
            ]}
          />
        )}
      </header>

      <motion.div layoutScroll className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2 [scrollbar-width:thin]">
        {column.chats.length === 0 ? (
          <p
            className={cn(
              "rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground transition-colors",
              isOver && "border-primary/40 bg-accent/40"
            )}
          >
            {isDragging ? t("funnels.column.dropHere") : t("funnels.column.empty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {column.chats.map((chat) => (
                <motion.li key={chat.id} {...preset.listItem} layout="position">
                  <ChatCard
                    chat={chat}
                    draggable={draggable}
                    onOpen={onOpen}
                    onOpenChat={onOpenChat}
                    onMove={onMove}
                  />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}

        {column.hasMore && remaining > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 text-muted-foreground pointer-coarse:h-10"
            disabled={isLoadingMore}
            onClick={() => onLoadMore(column)}
          >
            {isLoadingMore ? <Loader2 className="animate-spin" /> : null}
            {t("funnels.column.loadMore", { count: remaining, value: formatNumber(remaining, language) })}
          </Button>
        ) : null}
      </motion.div>
    </section>
  )
}
