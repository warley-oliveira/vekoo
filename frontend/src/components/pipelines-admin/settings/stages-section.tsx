import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { useSearchParams } from "react-router"
import { Layers, ListChecks, Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import {
  ActionsMenu,
  DragHandle,
  EmptyState,
  SettingsSection,
  SortableArea,
  useConfirm,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useStageMutations } from "@/hooks/pipelines-admin/use-board"
import { useStageChecklist } from "@/hooks/pipelines-admin/use-stage-checklist"
import { useOpenCount, useRetained } from "@/hooks/use-panel-session"
import { useSortableEntry } from "@/hooks/use-sortable-entry"
import { adminErrorMessage } from "@/lib/pipelines-admin/error-message"
import type { Board, Stage, StageWithCards } from "@/lib/pipelines-admin/types"
import { cn } from "@/lib/utils"
import { StagePanel } from "./stage-panel"

const NEW_STAGE = "new"

/** A bolinha com a cor da etapa, ou um anel vazio, para a lista não dançar. */
export function StageDot({ color, className }: { color: string | null | undefined; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "size-2.5 shrink-0 rounded-full",
        !color && "ring-1 ring-inset ring-foreground/20",
        className
      )}
      style={color ? { backgroundColor: color } : undefined}
    />
  )
}

/** A esteira do quadro: etapas em ordem, com o que cada uma pede para deixar o card sair. */
export function StagesSection({ board }: { board: Board }) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const { deleteStage, reorderStages } = useStageMutations(board.id)
  const [params, setParams] = useSearchParams()

  const canDelete = board.viewerCanViewAllCards

  const selected = params.get("stage")
  const panelOpen = Boolean(selected)
  const panelKey = useOpenCount(panelOpen)
  const shown = useRetained(selected)
  const editing = useMemo(
    () => board.stages.find((stage) => stage.id === shown) ?? null,
    [board.stages, shown]
  )
  const lastEditing = useRetained(editing)
  const shownStage = shown === NEW_STAGE ? null : lastEditing

  function openPanel(value: string | null) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (value) next.set("stage", value)
        else next.delete("stage")
        return next
      },
      { replace: value === null }
    )
  }

  /** O que vai junto, para ninguém descobrir depois. */
  function impactOf(stage: Stage) {
    const cards = board.stages.find((item) => item.id === stage.id)?.cards.length ?? 0
    const fields = board.customFields.filter((field) => field.stageId === stage.id).length
    const triggers = board.triggers.filter((trigger) => trigger.stageId === stage.id).length
    const moving = board.triggers.filter(
      (trigger) =>
        trigger.stageId !== stage.id &&
        trigger.actions.some((action) => action.type === "move_card" && action.stageId === stage.id)
    ).length

    return [
      cards > 0 ? t("pipelinesAdmin.stages.delete.impactCards", { count: cards }) : null,
      fields > 0 ? t("pipelinesAdmin.stages.delete.impactFields", { count: fields }) : null,
      triggers > 0 ? t("pipelinesAdmin.stages.delete.impactTriggers", { count: triggers }) : null,
      moving > 0 ? t("pipelinesAdmin.stages.delete.impactMoving", { count: moving }) : null,
    ].filter(Boolean)
  }

  async function remove(stage: Stage) {
    const impact = impactOf(stage)
    const confirmed = await confirm({
      title: t("pipelinesAdmin.stages.delete.title", { name: stage.name }),
      description:
        impact.length > 0
          ? impact.join(" ")
          : t("pipelinesAdmin.stages.delete.noImpact"),
      confirmLabel: t("pipelinesAdmin.stages.delete.confirm"),
      destructive: true,
      onConfirm: () => deleteStage(stage.id),
    })
    if (confirmed) {
      openPanel(null)
      toast.success(t("pipelinesAdmin.stages.delete.done", { name: stage.name }))
    }
  }

  async function reorder(ordered: StageWithCards[]) {
    try {
      await reorderStages(ordered)
    } catch (cause) {
      toast.error(adminErrorMessage(t, cause))
    }
  }

  return (
    <SettingsSection
      title={t("pipelinesAdmin.stages.title")}
      description={t("pipelinesAdmin.stages.description")}
    >
      {board.stages.length === 0 ? (
        <EmptyState
          icon={<Layers className="size-5" />}
          title={t("pipelinesAdmin.stages.empty.title")}
          description={t("pipelinesAdmin.stages.empty.description")}
          action={{ label: t("pipelinesAdmin.stages.create"), onClick: () => openPanel(NEW_STAGE) }}
        />
      ) : (
        <>
          <SortableArea
            items={board.stages}
            nameOf={(stage) => stage.name}
            onReorder={(ordered) => void reorder(ordered)}
          >
            <ol className="flex flex-col divide-y rounded-lg ring-1 ring-foreground/10">
              {board.stages.map((stage) => (
                <StageRow
                  key={stage.id}
                  boardId={board.id}
                  stage={stage}
                  canDelete={canDelete}
                  onOpen={() => openPanel(stage.id)}
                  onDelete={() => void remove(stage)}
                />
              ))}
            </ol>
          </SortableArea>
          <Button
            type="button"
            variant="outline"
            className="self-start pointer-coarse:h-10"
            onClick={() => openPanel(NEW_STAGE)}
          >
            <Plus />
            {t("pipelinesAdmin.stages.create")}
          </Button>
        </>
      )}

      {shown ? (
        <StagePanel
          key={panelKey}
          boardId={board.id}
          stage={shownStage}
          customFields={board.customFields}
          open={panelOpen}
          canDelete={canDelete}
          onOpenChange={(open) => {
            if (!open) openPanel(null)
          }}
          onCreated={(stage) => openPanel(stage.id)}
          onDelete={(stage) => void remove(stage)}
        />
      ) : null}
    </SettingsSection>
  )
}

function StageRow({
  boardId,
  stage,
  canDelete,
  onOpen,
  onDelete,
}: {
  boardId: string
  stage: StageWithCards
  canDelete: boolean
  onOpen: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const { setNodeRef, style, handleProps, isDragging } = useSortableEntry(stage.id)
  const { items } = useStageChecklist(boardId, stage.id)

  const required = items?.filter((item) => item.required).length ?? 0
  const details = [
    t("pipelinesAdmin.stages.row.cards", { count: stage.cards.length }),
    stage.slaHours ? t("pipelinesAdmin.stages.row.sla", { count: stage.slaHours }) : null,
    stage.wipLimit ? t("pipelinesAdmin.stages.row.wip", { count: stage.wipLimit }) : null,
  ].filter(Boolean)

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative flex items-center gap-2 bg-card py-2 pr-2 pl-1 transition-colors first:rounded-t-lg last:rounded-b-lg hover:bg-muted/40",
        isDragging && "shadow-md"
      )}
    >
      <DragHandle
        {...handleProps}
        label={t("pipelinesAdmin.stages.drag", { name: stage.name })}
        className="relative z-10"
      />
      <StageDot color={stage.color} />
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={onOpen}
          className="block w-full truncate rounded text-left text-sm font-medium outline-none after:absolute after:inset-0 focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
        >
          {stage.name}
        </button>
        <p className="truncate text-xs text-muted-foreground">
          {details.join(" · ")}
          {required > 0 ? (
            <span className="ml-1.5 inline-flex items-center gap-1 align-text-bottom">
              <ListChecks aria-hidden className="size-3" />
              {t("pipelinesAdmin.stages.row.checklist", { count: required })}
            </span>
          ) : null}
        </p>
      </div>
      <ActionsMenu
        label={t("pipelinesAdmin.stages.actionsOf", { name: stage.name })}
        className="relative z-10"
        actions={[
          {
            label: t("pipelinesAdmin.stages.edit"),
            icon: <Pencil />,
            onSelect: onOpen,
          },
          {
            label: t("pipelinesAdmin.stages.delete.action"),
            icon: <Trash2 />,
            destructive: true,
            separatorBefore: true,
            hidden: !canDelete,
            onSelect: onDelete,
          },
        ]}
      />
    </li>
  )
}
