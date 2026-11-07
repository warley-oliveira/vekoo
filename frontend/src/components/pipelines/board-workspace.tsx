import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router"
import { useReducedMotion } from "motion/react"
import { useTranslation } from "react-i18next"
import { RefreshCw, Settings2 } from "lucide-react"
import { useSWRConfig } from "swr"

import { Callout, EmptyState, ErrorState } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { BoardHandleContext, type BoardHandle } from "@/hooks/pipelines/board-handle"
import { useBoardDetail } from "@/hooks/pipelines/use-board-detail"
import { useBoardDrag } from "@/hooks/pipelines/use-board-drag"
import { useBoardFilters } from "@/hooks/pipelines/use-board-filters"
import { useBoardRealtime } from "@/hooks/pipelines/use-board-realtime"
import { useBoardUi } from "@/hooks/pipelines/use-board-ui"
import { CardActionsProvider, useCreateCardActions } from "@/hooks/pipelines/use-card-actions"
import { useSavedFilters } from "@/hooks/pipelines/use-saved-filters"
import { useFullBleed } from "@/hooks/use-app-shell"
import { useHeaderSlot, usePageTitle } from "@/hooks/use-header-slot"
import { useIsMobile } from "@/hooks/use-is-mobile"
import { ApiError } from "@/lib/api"
import { useSession } from "@/lib/auth"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { leadScoreConfigOf } from "@/lib/pipelines/card-meta"
import {
  advancedQuery,
  hasAnyFilter,
  labelOfAdvanced,
  matchesFilters,
  type AdvancedFilter,
  type BoardFilters,
  type FilterContext,
} from "@/lib/pipelines/filters"
import type { BoardView } from "@/lib/pipelines/paths"
import type {
  BoardDetail,
  FilterDefinition,
  SavedFilter,
  StageWithCards,
} from "@/lib/pipelines/types"
import { ActiveFilterChips } from "./active-filter-chips"
import { BoardCanvas } from "./board-canvas"
import {
  BoardBulkBar,
  BulkFieldDialog,
  DealRequiredFieldsDialog,
  LostReasonDialog,
  MoveCardDialog,
  NewCardDialog,
  RenameBoardDialog,
} from "./board-dialogs"
import { BoardFilterBar } from "./board-filter-bar"
import { BoardForecast } from "./board-forecast"
import { BoardHeaderActions, BoardViewToggle } from "./board-header-actions"
import { BoardList, ListColumnPicker } from "./board-list"
import { BoardSkeleton } from "./board-skeleton"
import { BoardSummaryStrip } from "./board-summary"
import { CardMenu } from "./card-menu"
import type { BoardMeta } from "./pipeline-card"
import { SavedFiltersMenu } from "./saved-filters-menu"

const CardPanel = lazy(() => import("./card-panel/card-panel"))
const FilterBuilderDialog = lazy(() => import("./filter-builder-dialog"))

/**
 * As etapas com o filtro da barra aplicado. Cada etapa guarda o último resultado: filtro igual e
 * etapa igual devolvem o mesmo objeto, e o `memo` da coluna segura o resto.
 */
function useVisibleStages(
  stages: StageWithCards[] | undefined,
  filters: BoardFilters,
  context: FilterContext
) {
  const cache = useRef(
    new WeakMap<
      StageWithCards,
      { filters: BoardFilters; context: FilterContext; result: StageWithCards }
    >()
  )

  return useMemo(() => {
    if (!stages) return []
    const picked =
      filters.stages.length > 0
        ? stages.filter((stage) => filters.stages.includes(stage.id))
        : stages
    if (!hasAnyFilter({ ...filters, stages: [] })) return picked

    return picked.map((stage) => {
      const known = cache.current.get(stage)
      if (known && known.filters === filters && known.context === context) return known.result
      const result = {
        ...stage,
        cards: stage.cards.filter((card) => matchesFilters(card, filters, context)),
      }
      cache.current.set(stage, { filters, context, result })
      return result
    })
  }, [context, filters, stages])
}

type BuilderState = {
  editing: SavedFilter | null
  initial: { definition: FilterDefinition; name: string | null } | null
}

function CardPanelHost({ board, onClose }: { board: BoardDetail; onClose: () => void }) {
  const [searchParams] = useSearchParams()
  const cardId = searchParams.get("card")

  // O painel fica montado depois de fechar, para a animação de saída ainda ter o que mostrar.
  const [retained, setRetained] = useState(cardId)
  if (cardId && cardId !== retained) setRetained(cardId)

  if (!retained) return null

  return (
    <Suspense fallback={null}>
      <CardPanel
        key={retained}
        board={board}
        cardId={retained}
        open={Boolean(cardId)}
        onClose={onClose}
      />
    </Suspense>
  )
}

type BoardWorkspaceProps = {
  boardId: string
  view: BoardView
}

/** Um pipeline aberto: dados, tempo real, filtros e a visão escolhida. */
export function BoardWorkspace({ boardId, view }: BoardWorkspaceProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const reducedMotion = useReducedMotion() ?? false
  const session = useSession()

  useFullBleed(true)

  const api = useBoardFilters()
  const { filters, advanced, setAdvanced, setFilters, clearAll } = api

  const { board, key, error, isLoading, isValidating, mutate } = useBoardDetail(boardId, advanced)

  const { presets, filters: savedFilters } = useSavedFilters(boardId)

  usePageTitle(board?.name ?? null, { color: board?.color ?? undefined })

  /* ---------- o pipeline para quem não assina ---------- */

  const { cache } = useSWRConfig()
  const keyRef = useRef(key)
  keyRef.current = key
  const lastBoard = useRef(board)
  if (board) lastBoard.current = board
  const advancedRef = useRef(advanced)
  advancedRef.current = advanced
  const mutateRef = useRef(mutate)
  mutateRef.current = mutate

  const handle = useMemo<BoardHandle>(
    () => ({
      boardId,
      getBoard: () =>
        (keyRef.current
          ? (cache.get(keyRef.current)?.data as BoardDetail | undefined)
          : undefined) ?? lastBoard.current,
      mutateBoard: (update) => {
        void mutateRef.current((current) => (current ? update(current) : current), {
          revalidate: false,
        })
      },
      revalidate: () => {
        void mutateRef.current()
      },
      isServerFiltered: () => advancedRef.current !== null,
      pending: new Map(),
    }),
    [boardId, cache]
  )

  /* ---------- abrir e fechar o card ---------- */

  // Abrir entra no histórico, para o voltar do celular fechar o card. Fechar, então, volta um passo,
  // e não deixa uma entrada a mais. Quem chegou por um link não tem de onde voltar: tira só o `card`.
  const openedHere = useRef<string | null>(null)
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate

  const navigation = useMemo(
    () => ({
      open: (cardId: string) => {
        const params = new URLSearchParams(window.location.search)
        params.set("card", cardId)
        openedHere.current = cardId
        navigateRef.current({ search: `?${params}` })
      },
      close: () => {
        const params = new URLSearchParams(window.location.search)
        const cardId = params.get("card")
        if (!cardId) return
        if (openedHere.current === cardId) {
          openedHere.current = null
          navigateRef.current(-1)
          return
        }
        params.delete("card")
        const search = params.toString()
        navigateRef.current({ search: search ? `?${search}` : "" }, { replace: true })
      },
    }),
    []
  )

  const actions = useCreateCardActions(handle, navigation)

  useBoardRealtime(handle)

  // Cada pipeline começa limpo: seleção, recusas e pedidos em aberto são da tela anterior.
  useEffect(() => {
    useBoardUi.getState().reset()
    useBoardDrag.getState().end()
  }, [boardId])

  /* ---------- filtro e o que vai para a tela ---------- */

  const leadScore = useMemo(() => (board ? leadScoreConfigOf(board) : null), [board])
  const customFields = board?.customFields
  const context = useMemo<FilterContext>(
    () => ({ accountId: session.account.id, leadScore, customFields: customFields ?? [] }),
    [customFields, leadScore, session.account.id]
  )

  const visibleStages = useVisibleStages(board?.stages, filters, context)
  const filtered = hasAnyFilter(filters) || advanced !== null

  const totalsByStage = useMemo(() => {
    const totals: Record<string, number> = {}
    for (const stage of board?.stages ?? []) totals[stage.id] = stage.cards.length
    return totals
  }, [board?.stages])

  const meta = useMemo<BoardMeta>(
    () => ({
      isCrm: board?.boardType === "crm",
      leadScore,
      language,
      reducedMotion,
    }),
    [board?.boardType, language, leadScore, reducedMotion]
  )

  const shownCount = visibleStages.reduce((sum, stage) => sum + stage.cards.length, 0)
  const totalCount = Object.values(totalsByStage).reduce((sum, count) => sum + count, 0)

  /* ---------- diálogos ---------- */

  const [newCardOpen, setNewCardOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [builder, setBuilder] = useState<BuilderState | null>(null)
  const [builderOpen, setBuilderOpen] = useState(false)

  const activeStageId = useBoardUi((state) => state.activeStageId)

  const openBuilder = useCallback((state: BuilderState) => {
    setBuilder(state)
    setBuilderOpen(true)
  }, [])

  const savedRef = useRef({ savedFilters, presets, advanced })
  savedRef.current = { savedFilters, presets, advanced }

  const editAdvanced = useCallback(() => {
    const { savedFilters: saved, presets: ready, advanced: current } = savedRef.current
    if (!current) return

    if (current.kind === "saved") {
      const filter = saved.find((item) => item.id === current.id)
      if (filter?.editable) return openBuilder({ editing: filter, initial: null })
      if (filter) {
        return openBuilder({
          editing: null,
          initial: { definition: filter.definition, name: filter.name },
        })
      }
      return
    }
    if (current.kind === "preset") {
      const preset = ready.find((item) => item.key === current.key)
      if (preset) {
        openBuilder({
          editing: null,
          initial: { definition: preset.definition, name: t(preset.nameKey) },
        })
      }
      return
    }
    openBuilder({ editing: null, initial: { definition: current.definition, name: current.name } })
  }, [openBuilder, t])

  const barApi = useMemo(
    () => ({ filters, setFilters, clearAll }),
    [clearAll, filters, setFilters]
  )
  const chipsApi = useMemo(
    () => ({ filters, advanced, setFilters, setAdvanced, clearAll }),
    [advanced, clearAll, filters, setAdvanced, setFilters]
  )

  /* ---------- barra superior ---------- */

  const openNewCard = useCallback(() => setNewCardOpen(true), [])
  const openRename = useCallback(() => setRenameOpen(true), [])

  useHeaderSlot(
    board ? (
      <BoardHeaderActions
        board={board}
        view={view}
        onCreateCard={openNewCard}
        onRename={openRename}
      />
    ) : null,
    { mobilePlacement: "inline" }
  )

  /* ---------- estados ---------- */

  const notFound = error instanceof ApiError && error.status === 404

  if (isLoading || (!board && !error)) {
    return (
      <div className="flex h-full min-h-0 flex-col pt-3">
        <BoardSkeleton />
      </div>
    )
  }

  if (!board) {
    return (
      <div className="px-4 py-6 md:px-6">
        {notFound ? (
          <EmptyState
            title={t("pipelines.boards.notFound")}
            description={t("pipelines.boards.notFoundHint")}
            action={{
              label: t("pipelines.boards.all"),
              onClick: () => navigate("/pipelines?all=1"),
            }}
          />
        ) : (
          <ErrorState error={error} onRetry={() => void mutate()} />
        )}
      </div>
    )
  }

  const resultLabel =
    filtered && advanced === null
      ? t("pipelines.board.countFiltered", {
          count: totalCount,
          shown: formatNumber(shownCount, language),
          total: formatNumber(totalCount, language),
        })
      : t("pipelines.board.count", {
          count: shownCount,
          formatted: formatNumber(shownCount, language),
        })

  const applyAdvanced = (next: AdvancedFilter) => setAdvanced(next)

  return (
    <BoardHandleContext.Provider value={handle}>
      <CardActionsProvider value={actions}>
        <div className="flex h-full min-h-0 flex-col">
          <div className="relative flex shrink-0 flex-col gap-2 px-4 pt-3 pb-3 md:px-6">
            {/* O filtro é do servidor: o quadro anterior fica na tela, e este fio diz que vem coisa nova. */}
            {isValidating && advanced !== null && view !== "list" ? (
              <div
                aria-hidden
                className="absolute inset-x-0 bottom-0 h-0.5 animate-pulse bg-primary/40 motion-reduce:animate-none"
              />
            ) : null}
            <BoardFilterBar
              api={barApi}
              stages={board.stages}
              customFields={board.customFields}
              isCrm={meta.isCrm}
              leadScore={leadScore}
              hasAdvanced={advanced !== null}
              searching={isValidating && Boolean(advancedQuery(advanced))}
              resultLabel={view === "list" || isMobile ? null : resultLabel}
              actions={
                <>
                  {isMobile ? (
                    <BoardViewToggle boardId={board.id} view={view} isCrm={meta.isCrm} iconsOnly />
                  ) : null}
                  {view === "list" ? (
                    <ListColumnPicker
                      isCrm={meta.isCrm}
                      hasLeadScore={Boolean(leadScore)}
                      customFields={board.customFields}
                    />
                  ) : null}
                  <SavedFiltersMenu
                    boardId={board.id}
                    advanced={advanced}
                    onApply={applyAdvanced}
                    onCreate={() => openBuilder({ editing: null, initial: null })}
                    onEdit={(filter) => openBuilder({ editing: filter, initial: null })}
                  />
                </>
              }
            />

            <ActiveFilterChips
              api={chipsApi}
              stages={board.stages}
              customFields={board.customFields}
              savedFilters={savedFilters}
              presets={presets}
              onEditAdvanced={editAdvanced}
            />

            {meta.isCrm && view === "board" ? (
              <BoardSummaryStrip stages={visibleStages} language={language} />
            ) : null}

            {board.archived ? (
              <Callout tone="warning">{t("pipelines.boards.archivedNotice")}</Callout>
            ) : null}
            {!board.viewerCanViewAllCards ? (
              <p className="text-xs text-muted-foreground">{t("pipelines.boards.restricted")}</p>
            ) : null}
            {error && !isValidating ? (
              <Callout
                tone="danger"
                role="alert"
                action={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="pointer-coarse:h-10"
                    onClick={() => void mutate()}
                  >
                    <RefreshCw />
                    {t("pipelines.actions.retry")}
                  </Button>
                }
              >
                {error instanceof ApiError && error.code === "invalidFilter"
                  ? t("pipelines.filters.invalid", {
                      name: advanced ? labelOfAdvanced(advanced, savedFilters, presets, t) : "",
                    })
                  : t("pipelines.errors.reloadFailed")}
              </Callout>
            ) : null}
          </div>

          {board.stages.length === 0 ? (
            <div className="px-4 md:px-6">
              <EmptyState
                icon={<Settings2 className="size-5" />}
                title={t("pipelines.board.noStagesTitle")}
                description={t("pipelines.board.noStagesHint")}
                action={{
                  label: t("pipelines.boards.settings"),
                  onClick: () => navigate(`/pipelines/${board.id}/settings`),
                }}
              />
            </div>
          ) : view === "list" ? (
            <BoardList
              board={board}
              api={api}
              context={context}
              savedFilters={savedFilters}
              presets={presets}
              onCreateCard={openNewCard}
            />
          ) : view === "forecast" ? (
            <BoardForecast stages={visibleStages} />
          ) : (
            <BoardCanvas
              stages={visibleStages}
              totalsByStage={totalsByStage}
              meta={meta}
              filtered={filtered}
            />
          )}

          <CardMenu isCrm={meta.isCrm} />
          <BoardBulkBar />
          <BulkFieldDialog />
          <MoveCardDialog stages={board.stages} />
          <LostReasonDialog />
          <DealRequiredFieldsDialog customFields={board.customFields} />
          <NewCardDialog
            open={newCardOpen}
            onOpenChange={setNewCardOpen}
            stages={board.stages}
            defaultStageId={activeStageId ?? board.stages[0]?.id ?? null}
          />
          <RenameBoardDialog board={board} open={renameOpen} onOpenChange={setRenameOpen} />
          {builder ? (
            <Suspense fallback={null}>
              <FilterBuilderDialog
                open={builderOpen}
                onOpenChange={setBuilderOpen}
                board={board}
                editing={builder.editing}
                initial={builder.initial}
                onApply={applyAdvanced}
              />
            </Suspense>
          ) : null}
          <CardPanelHost board={board} onClose={navigation.close} />
        </div>
      </CardActionsProvider>
    </BoardHandleContext.Provider>
  )
}
