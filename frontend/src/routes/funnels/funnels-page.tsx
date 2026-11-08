import { useCallback, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "@/lib/router"
import { ArrowRight, Filter, Plus } from "lucide-react"
import { toast } from "sonner"

import "@/components/dashboard/viz-tokens.css"
import { BoardSkeleton } from "@/components/funnels/board-skeleton"
import { chatName } from "@/components/funnels/chat-format"
import { ChatPanel } from "@/components/funnels/chat-panel"
import { funnelErrorMessage } from "@/components/funnels/error-message"
import { FunnelBoardView } from "@/components/funnels/funnel-board"
import { FunnelFormPanel } from "@/components/funnels/funnel-form-panel"
import { BoardFiltersBar, BoardSummary, FunnelSwitcher } from "@/components/funnels/funnel-toolbar"
import { MoveChatDialog, StageNameDialog } from "@/components/funnels/stage-dialogs"
import type { BoardChat, BoardColumn, Funnel } from "@/components/funnels/types"
import type { StageActions } from "@/components/funnels/board-column"
import {
  Callout,
  EmptyState,
  ErrorState,
  PageBody,
  PageHeader,
  useConfirm,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useFunnelFilters } from "@/hooks/insights/use-funnel-filters"
import { useFunnelBoard, useFunnelMutations, useFunnels } from "@/hooks/insights/use-funnels"
import { useFullBleed } from "@/hooks/use-app-shell"
import { useOpenCount, useRetained } from "@/hooks/use-panel-session"
import { cn } from "@/lib/utils"

type FormState = { kind: "closed" } | { kind: "new" } | { kind: "edit"; funnelId: string }

export default function FunnelsPage() {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const { funnels, error, isLoading, reload } = useFunnels()
  const { deleteFunnel } = useFunnelMutations()
  const filterState = useFunnelFilters(funnels)
  const { funnelId, setFunnelId } = filterState

  // O quadro é dono da própria rolagem: cada coluna rola por dentro, e a página fica parada.
  const hasBoard = Boolean(funnelId)
  useFullBleed(hasBoard)

  const [form, setForm] = useState<FormState>({ kind: "closed" })
  const formOpen = form.kind !== "closed"
  const formKey = useOpenCount(formOpen)
  const shownForm = useRetained(formOpen ? form : null)
  const [stageCounts, setStageCounts] = useState<Record<string, number>>({})

  const editingFunnel =
    shownForm?.kind === "edit" ? (funnels?.find((funnel) => funnel.id === shownForm.funnelId) ?? null) : null
  const lastEditing = useRetained(editingFunnel)

  const openNew = useCallback(() => setForm({ kind: "new" }), [])

  const removeFunnel = useCallback(
    async (funnel: Funnel) => {
      const confirmed = await confirm({
        title: t("funnels.delete.title", { name: funnel.name }),
        description: t("funnels.delete.description"),
        confirmLabel: t("funnels.delete.action"),
        destructive: true,
        onConfirm: () => deleteFunnel(funnel.id),
      })
      if (confirmed) {
        setForm({ kind: "closed" })
        const next = funnels?.find((entry) => entry.id !== funnel.id)
        setFunnelId(next?.id ?? null)
        toast.success(t("funnels.delete.done", { name: funnel.name }))
      }
    },
    [confirm, deleteFunnel, funnels, setFunnelId, t]
  )

  const header = (
    <PageHeader
      actions={
        <Button onClick={openNew} className="pointer-coarse:h-10">
          <Plus />
          {t("funnels.create.action")}
        </Button>
      }
      mobileActions={
        <Button onClick={openNew} aria-label={t("funnels.create.action")} className="pointer-coarse:h-10">
          <Plus />
          {t("funnels.create.mobileAction")}
        </Button>
      }
      mobilePlacement="inline"
    />
  )

  return (
    <PageBody
      variant="full"
      className={cn(hasBoard && "h-full min-h-0 gap-3 pt-3 pb-0 md:gap-3 md:pt-4 md:pb-0")}
    >
      {header}

      {error && !funnels ? (
        <ErrorState error={error} onRetry={reload} />
      ) : isLoading && !funnels ? (
        <BoardSkeleton />
      ) : !funnelId ? (
        <FirstFunnel onCreate={openNew} />
      ) : (
        // `key`: outro funil nasce sem o quadro do anterior na tela.
        <BoardArea
          key={funnelId}
          funnelId={funnelId}
          funnels={funnels ?? []}
          state={filterState}
          onCountsChange={setStageCounts}
          onEdit={(id) => setForm({ kind: "edit", funnelId: id })}
          onDelete={(funnel) => void removeFunnel(funnel)}
        />
      )}

      {shownForm ? (
        <FunnelFormPanel
          key={formKey}
          funnel={shownForm.kind === "edit" ? lastEditing : null}
          stageCounts={stageCounts}
          open={formOpen}
          onOpenChange={(open) => {
            if (!open) setForm({ kind: "closed" })
          }}
          onSaved={(saved) => {
            if (shownForm.kind === "new") setFunnelId(saved.id)
          }}
          onDelete={(funnel) => void removeFunnel(funnel)}
        />
      ) : null}
    </PageBody>
  )
}

/** O primeiro contato com funis: o que é, em um desenho e duas frases, e o botão. */
function FirstFunnel({ onCreate }: { onCreate: () => void }) {
  const { t } = useTranslation()
  const stages = t("funnels.templates.sales.stages", { returnObjects: true }) as string[]

  return (
    <EmptyState
      icon={
        <div aria-hidden className="mb-1 flex flex-wrap items-center justify-center gap-1.5">
          {stages.map((stage, index) => (
            <span key={stage} className="flex items-center gap-1.5">
              {index > 0 ? <ArrowRight className="size-3" /> : null}
              <span className="rounded-md bg-muted px-2 py-1 text-xs">{stage}</span>
            </span>
          ))}
        </div>
      }
      title={t("funnels.empty.title")}
      description={t("funnels.empty.description")}
      action={{ label: t("funnels.empty.action"), onClick: onCreate }}
    />
  )
}

type BoardAreaProps = {
  funnelId: string
  funnels: Funnel[]
  state: ReturnType<typeof useFunnelFilters>
  onCountsChange: (counts: Record<string, number>) => void
  onEdit: (funnelId: string) => void
  onDelete: (funnel: Funnel) => void
}

type StageDialogState =
  | { mode: "rename"; column: BoardColumn }
  /** Depois de qual posição a etapa nova entra. */
  | { mode: "create"; index: number }

function BoardArea({ funnelId, funnels, state, onCountsChange, onEdit, onDelete }: BoardAreaProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const { updateFunnel } = useFunnelMutations()
  const {
    filters,
    showNoStage,
    activeFilterCount,
    setFunnelId,
    setDays,
    setDateField,
    setAssignedUser,
    setTagIds,
    setQuery,
    clearFilters,
    toggleNoStage,
    openChatId,
    openChat,
    closeChat,
  } = state

  const { board, error, isLoading, isValidating, loadingColumns, reload, loadMore, moveChat, patchChat } =
    useFunnelBoard(funnelId, filters)
  const funnel = funnels.find((entry) => entry.id === funnelId) as Funnel

  const stageColumns = useMemo(
    () => board?.columns.filter((column) => column.stageId !== null) ?? [],
    [board?.columns]
  )

  const [moveTarget, setMoveTarget] = useState<BoardChat | null>(null)
  const shownMoveTarget = useRetained(moveTarget)
  const [stageDialog, setStageDialog] = useState<StageDialogState | null>(null)
  const shownStageDialog = useRetained(stageDialog)
  const stageDialogKey = useOpenCount(Boolean(stageDialog))

  const noName = t("funnels.card.noName")

  /* ---------- mover ---------- */

  const move = useCallback(
    async (chat: BoardChat, toStageId: string | null, options: { undo?: boolean } = {}) => {
      const fromStageId = chat.stageId
      const name = chatName(chat, noName)
      const stageName =
        board?.columns.find((column) => column.stageId === toStageId)?.stageName ?? t("funnels.column.noStage")
      try {
        await moveChat(chat, toStageId)
        if (options.undo === false) return
        toast.success(t("funnels.move.done", { name, stage: stageName }), {
          action: {
            label: t("funnels.move.undo"),
            onClick: () => void move({ ...chat, stageId: toStageId }, fromStageId, { undo: false }),
          },
        })
      } catch (cause) {
        toast.error(t("funnels.move.failed", { name, reason: funnelErrorMessage(t, cause) }))
      }
    },
    [board?.columns, moveChat, noName, t]
  )

  const handleDrop = useCallback((chat: BoardChat, toStageId: string | null) => void move(chat, toStageId), [move])
  const handleOpen = useCallback((chat: BoardChat) => openChat(chat.id), [openChat])
  const handleOpenChat = useCallback((chat: BoardChat) => navigate(`/chat/${chat.id}`), [navigate])

  /* ---------- etapas, direto no quadro ---------- */

  const currentStages = useCallback(
    () => (board?.funnel ?? funnel).stages.map((stage) => ({ id: stage.id, name: stage.name })),
    [board?.funnel, funnel]
  )

  const saveStages = useCallback(
    async (stages: { id?: string; name: string }[], success: string) => {
      await updateFunnel(funnelId, { stages })
      toast.success(success)
    },
    [funnelId, updateFunnel]
  )

  const stageActions = useMemo<StageActions>(() => {
    const reorder = async (column: BoardColumn, direction: -1 | 1) => {
      const stages = currentStages()
      const index = stages.findIndex((stage) => stage.id === column.stageId)
      const target = index + direction
      if (index < 0 || target < 0 || target >= stages.length) return
      ;[stages[index], stages[target]] = [stages[target], stages[index]]
      try {
        await saveStages(stages, t("funnels.stage.moved", { name: column.stageName }))
      } catch (cause) {
        toast.error(funnelErrorMessage(t, cause))
      }
    }

    return {
      rename: (column) => setStageDialog({ mode: "rename", column }),
      addAfter: (column) =>
        setStageDialog({
          mode: "create",
          index: currentStages().findIndex((stage) => stage.id === column.stageId) + 1,
        }),
      moveLeft: (column) => void reorder(column, -1),
      moveRight: (column) => void reorder(column, 1),
      remove: (column) => {
        void (async () => {
          const confirmed = await confirm({
            title: t("funnels.stage.deleteTitle", { name: column.stageName }),
            description: t(column.count > 0 ? "funnels.stage.deleteHint" : "funnels.stage.deleteHintEmpty", {
              count: column.count,
            }),
            confirmLabel: t("funnels.stage.delete"),
            destructive: true,
            onConfirm: () =>
              updateFunnel(funnelId, {
                stages: currentStages().filter((stage) => stage.id !== column.stageId),
              }),
          })
          if (confirmed) toast.success(t("funnels.stage.deleted", { name: column.stageName }))
        })()
      },
    }
  }, [confirm, currentStages, funnelId, saveStages, t, updateFunnel])

  const submitStageDialog = useCallback(
    async (name: string) => {
      if (!stageDialog) return
      const stages: { id?: string; name: string }[] = currentStages()
      if (stageDialog.mode === "rename") {
        await saveStages(
          stages.map((stage) => (stage.id === stageDialog.column.stageId ? { ...stage, name } : stage)),
          t("funnels.stage.renamed", { name })
        )
      } else {
        stages.splice(stageDialog.index, 0, { name })
        await saveStages(stages, t("funnels.stage.created", { name }))
      }
    },
    [currentStages, saveStages, stageDialog, t]
  )

  /* ---------- o que a tela mostra ---------- */

  const openEdit = () => {
    // Quantas conversas cada etapa tem agora, para o aviso de excluir dizer o que acontece.
    onCountsChange(
      Object.fromEntries(stageColumns.map((column) => [column.stageId as string, column.count]))
    )
    onEdit(funnelId)
  }

  const isFiltered = activeFilterCount > 0 || Boolean(filters.q)

  const notice = (() => {
    if (!board) return null
    if (board.metrics.total === 0) {
      return isFiltered ? (
        <Callout
          icon={<Filter className="size-4" />}
          title={t("funnels.notice.noResultsTitle")}
          action={
            <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
              {t("funnels.notice.clear")}
            </Button>
          }
        >
          {t("funnels.notice.noResultsHint")}
        </Callout>
      ) : (
        <Callout title={t("funnels.notice.noChatsTitle")}>
          {t("funnels.notice.noChatsHint", { count: filters.days })}
        </Callout>
      )
    }
    // Funil recém-criado: todas as conversas começam em "Sem etapa".
    if (board.metrics.total === board.metrics.noStage && !isFiltered) {
      return <Callout title={t("funnels.notice.startTitle")}>{t("funnels.notice.startHint")}</Callout>
    }
    return null
  })()

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <FunnelSwitcher
            funnels={funnels}
            funnelId={funnelId}
            onChange={setFunnelId}
            onEdit={openEdit}
            onDelete={() => onDelete(funnel)}
            className="flex-1 md:flex-none"
          />
          <BoardSummary
            board={board}
            isValidating={isValidating}
            showNoStage={showNoStage}
            onToggleNoStage={toggleNoStage}
            onRefresh={() => void reload()}
          />
        </div>
        <BoardFiltersBar
          filters={filters}
          activeCount={activeFilterCount}
          board={board}
          isValidating={isValidating}
          showNoStage={showNoStage}
          onDays={setDays}
          onDateField={setDateField}
          onAssignedUser={setAssignedUser}
          onTagIds={setTagIds}
          onQuery={setQuery}
          onClear={clearFilters}
          onToggleNoStage={toggleNoStage}
          onRefresh={() => void reload()}
        />
      </div>

      {notice}

      {error && !board ? (
        <ErrorState error={error} onRetry={() => void reload()} />
      ) : !board ? (
        <BoardSkeleton />
      ) : (
        <div
          aria-busy={isLoading}
          className={cn(
            "flex min-h-0 flex-1 flex-col transition-opacity duration-150",
            isLoading && "opacity-60"
          )}
        >
          <FunnelBoardView
            board={board}
            showNoStage={showNoStage}
            loadingColumns={loadingColumns}
            stageActions={stageActions}
            onAddStage={() => setStageDialog({ mode: "create", index: stageColumns.length })}
            onHideNoStage={toggleNoStage}
            onLoadMore={(column) => {
              loadMore(column).catch((cause: unknown) => toast.error(funnelErrorMessage(t, cause)))
            }}
            onDropChat={handleDrop}
            onOpen={handleOpen}
            onOpenChat={handleOpenChat}
            onMove={setMoveTarget}
          />
        </div>
      )}

      <ChatPanel
        chatId={openChatId}
        funnelId={funnelId}
        board={board}
        onClose={closeChat}
        onMove={(chat, toStageId) => void move(chat, toStageId)}
        onPatch={(chatId, patch) => void patchChat(chatId, patch)}
        onCatalogChange={() => void reload()}
      />

      {board ? (
        <MoveChatDialog
          chat={shownMoveTarget}
          chatLabel={shownMoveTarget ? chatName(shownMoveTarget, noName) : ""}
          columns={board.columns}
          open={Boolean(moveTarget)}
          onOpenChange={(open) => {
            if (!open) setMoveTarget(null)
          }}
          onMove={(chat, toStageId) => void move(chat, toStageId)}
        />
      ) : null}

      {shownStageDialog ? (
        <StageNameDialog
          key={stageDialogKey}
          mode={shownStageDialog.mode}
          initialName={shownStageDialog.mode === "rename" ? shownStageDialog.column.stageName : ""}
          otherNames={stageColumns
            .filter((column) => shownStageDialog.mode !== "rename" || column.stageId !== shownStageDialog.column.stageId)
            .map((column) => column.stageName)}
          open={Boolean(stageDialog)}
          onOpenChange={(open) => {
            if (!open) setStageDialog(null)
          }}
          onSubmit={submitStageDialog}
        />
      ) : null}
    </div>
  )
}
