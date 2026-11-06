import { memo, useMemo, useState, type ReactNode } from "react"
import { useDroppable } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { useTranslation } from "react-i18next"
import { Clock, Plus } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useBoardDrag } from "@/hooks/pipelines/use-board-drag"
import { useCardActions } from "@/hooks/pipelines/use-card-actions"
import { formatCurrency } from "@/lib/format-number"
import { stageTotals } from "@/lib/pipelines/card-meta"
import { pipelineErrorText } from "@/lib/pipelines/errors"
import { formatDealValue } from "@/lib/pipelines/format"
import type { Card, StageWithCards } from "@/lib/pipelines/types"
import { cn } from "@/lib/utils"
import type { BoardMeta } from "./pipeline-card"
import { StageCardList } from "./stage-card-list"

/** A etapa como alvo. Uma camada só para isso: o arraste não precisa redesenhar a coluna. */
function StageDropZone({
  stageId,
  count,
  children,
}: {
  stageId: string
  count: number
  children: ReactNode
}) {
  const data = useMemo(() => ({ type: "stage" as const, stageId, count }), [stageId, count])
  const { setNodeRef } = useDroppable({ id: stageId, data })
  const holdsActive = useBoardDrag(
    (state) =>
      state.activeId !== null &&
      Boolean(state.columns?.[stageId]?.some((card) => card.id === state.activeId))
  )

  return (
    <section
      ref={setNodeRef}
      data-stage-id={stageId}
      className={cn(
        "flex max-h-full w-[calc(100vw-2rem)] shrink-0 snap-center flex-col rounded-2xl bg-muted/50 transition-colors md:w-72",
        holdsActive && "bg-muted/80"
      )}
    >
      {children}
    </section>
  )
}

function StageHeader({
  stage,
  cards,
  language,
  filtered,
  totalCount,
}: {
  stage: StageWithCards
  cards: Card[]
  language: string
  filtered: boolean
  totalCount: number
}) {
  const { t } = useTranslation()
  const totals = useMemo(() => stageTotals(cards), [cards])
  const overLimit = stage.wipLimit !== null && totals.count >= stage.wipLimit

  return (
    <header className="flex flex-col gap-0.5 px-3 pt-3 pb-2">
      <div className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full bg-muted-foreground/40"
          style={stage.color ? { backgroundColor: stage.color } : undefined}
        />
        <h3 className="min-w-0 flex-1 truncate text-sm font-medium">{stage.name}</h3>
        <span
          className={cn(
            "shrink-0 text-xs text-muted-foreground tabular-nums",
            overLimit && "font-medium text-status-warning"
          )}
          title={
            stage.wipLimit !== null
              ? t("pipelines.stage.wipLimit", { limit: stage.wipLimit })
              : filtered
                ? t("pipelines.stage.filteredCount", { shown: totals.count, total: totalCount })
                : undefined
          }
        >
          {stage.wipLimit !== null ? `${totals.count}/${stage.wipLimit}` : totals.count}
        </span>
      </div>

      {totals.withValue > 0 || stage.slaHours ? (
        <div className="flex items-center gap-2 pl-4 text-xs text-muted-foreground tabular-nums">
          {totals.withValue > 0 ? (
            <span
              title={t("pipelines.stage.totalsHint", {
                count: totals.withValue,
                total: formatCurrency(totals.total, language),
                weighted: formatCurrency(totals.weighted, language),
              })}
            >
              {formatDealValue(totals.total, language)}
            </span>
          ) : null}
          {stage.slaHours ? (
            <span
              className="inline-flex items-center gap-1"
              title={t("pipelines.stage.slaHint", { count: stage.slaHours })}
            >
              <Clock className="size-3" aria-hidden />
              {t("pipelines.stage.sla", { count: stage.slaHours })}
            </span>
          ) : null}
        </div>
      ) : null}
    </header>
  )
}

function StageQuickAdd({
  stageId,
  adding,
  onAddingChange,
}: {
  stageId: string
  adding: boolean
  onAddingChange: (adding: boolean) => void
}) {
  const { t } = useTranslation()
  const actions = useCardActions()
  const [title, setTitle] = useState("")

  function submit() {
    const text = title.trim()
    if (!text) return
    // O campo limpa na hora, para a próxima linha: cadastrar vários em sequência é o caso comum.
    setTitle("")
    actions.create(stageId, text).catch((error: unknown) => {
      setTitle((current) => current || text)
      toast.error(pipelineErrorText(t, error, "pipelines.errors.createFailed"))
    })
  }

  if (!adding) {
    return (
      <div className="px-2 pt-1 pb-2">
        <Button
          type="button"
          variant="ghost"
          className="w-full justify-start text-muted-foreground pointer-coarse:h-10"
          onClick={() => onAddingChange(true)}
        >
          <Plus />
          {t("pipelines.card.add")}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5 px-2 pt-1 pb-2">
      <Input
        autoFocus
        value={title}
        maxLength={500}
        aria-label={t("pipelines.card.titleLabel")}
        placeholder={t("pipelines.card.titlePlaceholder")}
        className="bg-background"
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            submit()
          } else if (event.key === "Escape") {
            setTitle("")
            onAddingChange(false)
          }
        }}
        onBlur={() => {
          if (!title.trim()) onAddingChange(false)
        }}
      />
      <div className="flex items-center gap-1">
        <Button type="button" size="sm" className="pointer-coarse:h-10" onClick={submit}>
          {t("pipelines.card.addConfirm")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground pointer-coarse:h-10"
          onClick={() => {
            setTitle("")
            onAddingChange(false)
          }}
        >
          {t("pipelines.card.addCancel")}
        </Button>
      </div>
    </div>
  )
}

type StageColumnProps = {
  stage: StageWithCards
  meta: BoardMeta
  /** Há filtro aplicado: uma etapa vazia aqui é "nada passou", e não "nada existe". */
  filtered: boolean
  /** Quantos cards a etapa tem sem o filtro. */
  totalCount: number
}

/**
 * Uma etapa. Memorizada, e só assina a própria lista durante o arraste: mover um card redesenha a
 * etapa de onde ele saiu e a de onde ele entrou, e nenhuma outra.
 */
export const StageColumn = memo(function StageColumn({
  stage,
  meta,
  filtered,
  totalCount,
}: StageColumnProps) {
  const { t } = useTranslation()
  const dragCards = useBoardDrag((state) => state.columns?.[stage.id])
  const dragging = useBoardDrag((state) => state.activeId !== null)
  const cards = dragCards ?? stage.cards
  const ids = useMemo(() => cards.map((card) => card.id), [cards])

  const [adding, setAdding] = useState(false)
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null)

  return (
    <StageDropZone stageId={stage.id} count={cards.length}>
      <StageHeader
        stage={stage}
        cards={cards}
        language={meta.language}
        filtered={filtered}
        totalCount={totalCount}
      />

      <div
        ref={setScroller}
        className="flex min-h-12 flex-1 flex-col gap-2 overflow-x-hidden overflow-y-auto overscroll-contain px-2 pt-0.5 pb-1 [scrollbar-width:thin]"
      >
        <SortableContext id={stage.id} items={ids} strategy={verticalListSortingStrategy}>
          <StageCardList cards={cards} stageId={stage.id} meta={meta} root={scroller} />
        </SortableContext>

        {cards.length === 0 && !dragging && !adding ? (
          <p className="px-2 py-6 text-center text-xs text-pretty text-muted-foreground">
            {filtered ? t("pipelines.stage.emptyFiltered") : t("pipelines.stage.empty")}
          </p>
        ) : null}
      </div>

      <StageQuickAdd stageId={stage.id} adding={adding} onAddingChange={setAdding} />
    </StageDropZone>
  )
})
