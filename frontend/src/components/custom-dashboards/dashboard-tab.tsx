import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useSearchParams } from "react-router"
import { Plus, Smartphone } from "lucide-react"
import { toast } from "sonner"

import "@/components/custom-dashboards/viz-tokens.css"
import { Callout, EmptyState, ErrorState, ResponsiveDialog, useConfirm } from "@/components/shared"
import { Button } from "@/components/ui/button"
import {
  normalizeDashboard,
  refreshWidgetData,
  storeDashboard,
  useCustomDashboard,
  useDashboardMutations,
  useDataSources,
} from "@/hooks/custom-dashboards/use-custom-dashboards"
import {
  isDirtySession,
  sameWidgets,
  snapshotToWidgets,
  toSnapshot,
  useEditorStore,
  useEditSession,
  type Snapshot,
} from "@/hooks/custom-dashboards/use-editor-store"
import type { DashboardPeriod } from "@/hooks/insights/use-dashboard-period"
import { useIsMobile } from "@/hooks/use-is-mobile"
import { useLocalStorage } from "@/hooks/use-local-storage"
import { ApiError, apiGet } from "@/lib/api"
import { WIDGET_SPECS } from "@/lib/custom-dashboards/catalog"
import { newDraft, widgetToEditor } from "@/lib/custom-dashboards/editor-model"
import { instantiateRecipe, type Recipe } from "@/lib/custom-dashboards/templates"
import type { CustomDashboard, DashboardWidget, WidgetType } from "@/lib/custom-dashboards/types"

import { DashboardCanvas, GridSkeleton } from "./dashboard-canvas"
import { DashboardDetailsDialog } from "./dashboard-details-dialog"
import type { GridApi } from "./dashboard-grid"
import { DashboardToolbar } from "./dashboard-toolbar"
import { WidgetActionsContext, type WidgetActions } from "./widget-actions"
import { WidgetCard } from "./widget-card"
import { WidgetEditorPanel, type EditorTarget } from "./widget-editor/widget-editor"
import { WidgetLibrary } from "./widget-library"

type DashboardTabProps = {
  dashboardId: string
  period: DashboardPeriod
}

const EMPTY_SNAPSHOT: Snapshot = { order: [], widgets: {}, layouts: {} }

/** Uma aba do Dashboard: um painel, lendo ou editando. O rascunho mora fora daqui, e trocar de aba não o perde. */
export default function DashboardTab({ dashboardId, period }: DashboardTabProps) {
  const { t } = useTranslation()
  const { dashboard, error, isLoading, reload } = useCustomDashboard(dashboardId)

  if (dashboard) return <LoadedDashboard key={dashboardId} dashboard={dashboard} period={period} />

  if (error) {
    if (error instanceof ApiError && error.status === 404) {
      return <EmptyState title={t("customDashboards.tab.notFound")} description={t("customDashboards.tab.notFoundHint")} />
    }
    return <ErrorState error={error} onRetry={() => void reload()} />
  }

  return isLoading ? <TabSkeleton /> : null
}

const SKELETON_SNAPSHOT: Snapshot = {
  order: ["a", "b", "c", "d", "e", "f"],
  widgets: {},
  layouts: {
    a: { x: 0, y: 0, w: 3, h: 2 },
    b: { x: 3, y: 0, w: 3, h: 2 },
    c: { x: 6, y: 0, w: 3, h: 2 },
    d: { x: 9, y: 0, w: 3, h: 2 },
    e: { x: 0, y: 2, w: 8, h: 4 },
    f: { x: 8, y: 2, w: 4, h: 4 },
  },
}

export function TabSkeleton() {
  return <GridSkeleton snapshot={SKELETON_SNAPSHOT} />
}

function LoadedDashboard({ dashboard, period }: { dashboard: CustomDashboard; period: DashboardPeriod }) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const isMobile = useIsMobile()
  const [, setSearchParams] = useSearchParams()
  const dashboardId = dashboard.id

  const session = useEditSession(dashboardId)
  const { start, discard, finish, addWidget, updateWidget, removeWidget, cloneWidget, toggleLock, undo, redo } = useEditorStore.getState()
  const { update, remove, duplicate, toggleFavorite } = useDashboardMutations()
  const { dataSources } = useDataSources()

  const [refreshSeconds, setRefreshSeconds] = useLocalStorage<number>(`vekoo.customDashboards.refresh.${dashboardId}`, 0)
  const [saving, setSaving] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [editorTarget, setEditorTarget] = useState<EditorTarget | null>(null)
  const [expanded, setExpanded] = useState<DashboardWidget | null>(null)

  const editing = Boolean(session)
  const dirty = isDirtySession(session)

  // A foto que está na tela: a da edição, ou a do servidor, reaproveitando os objetos que não mudaram. Depois de salvar, é
  // ela que evita desenhar o painel inteiro de novo.
  const lastSnapshot = useRef<Snapshot | undefined>(undefined)
  const serverSnapshot = useMemo(() => toSnapshot(dashboard, lastSnapshot.current), [dashboard])
  const snapshot = session?.present ?? serverSnapshot ?? EMPTY_SNAPSHOT
  useEffect(() => {
    lastSnapshot.current = snapshot
  }, [snapshot])

  const gridApi = useRef<GridApi | null>(null)

  const beginEditing = useCallback(() => start(dashboard), [dashboard, start])

  const actions = useMemo<WidgetActions>(
    () => ({
      edit: (widgetId) => {
        const current = useEditorStore.getState().sessions[dashboardId]?.present
        const widget = current?.widgets[widgetId]
        if (widget) setEditorTarget({ kind: "edit", widget: { ...widget, layout: current.layouts[widgetId] } })
      },
      remove: async (widget) => {
        const confirmed = await confirm({
          title: t("customDashboards.card.removeTitle", { title: widget.title }),
          description: t("customDashboards.card.removeDescription"),
          confirmLabel: t("customDashboards.card.remove"),
          destructive: true,
        })
        if (confirmed) {
          removeWidget(dashboardId, widget.id)
          toast.success(t("customDashboards.card.removed"))
        }
      },
      duplicate: (widget) => {
        cloneWidget(dashboardId, widget.id, t("customDashboards.card.copyTitle", { title: widget.title }))
        toast.success(t("customDashboards.card.duplicated"))
      },
      toggleLock: (widgetId) => toggleLock(dashboardId, widgetId),
      expand: setExpanded,
      setNotes: (widgetId, notes) => {
        const widget = useEditorStore.getState().sessions[dashboardId]?.present.widgets[widgetId]
        if (widget) updateWidget(dashboardId, widgetId, { visualConfig: { ...widget.visualConfig, annotations: notes } })
      },
      moveBy: (widgetId, dx, dy) => gridApi.current?.moveBy(widgetId, dx, dy),
      resizeBy: (widgetId, dw, dh) => gridApi.current?.resizeBy(widgetId, dw, dh),
      wasJustDragged: () => gridApi.current?.wasJustDragged() ?? false,
    }),
    [cloneWidget, confirm, dashboardId, removeWidget, t, toggleLock, updateWidget]
  )

  // Desfazer pelo teclado: Ctrl+Z, Ctrl+Shift+Z e Ctrl+Y. Dentro de um campo, o desfazer é do próprio campo; com um painel
  // aberto, a edição está lá, e não aqui.
  const panelOpen = Boolean(editorTarget) || libraryOpen || detailsOpen
  useEffect(() => {
    if (!editing || panelOpen) return

    function onKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey)) return
      const target = event.target as HTMLElement | null
      if (target?.closest("input, textarea, select, [contenteditable=true]")) return

      const key = event.key.toLowerCase()
      if (key === "z") {
        event.preventDefault()
        if (event.shiftKey) redo(dashboardId)
        else undo(dashboardId)
      } else if (key === "y") {
        event.preventDefault()
        redo(dashboardId)
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [dashboardId, editing, panelOpen, redo, undo])

  function openLibrary() {
    beginEditing()
    setLibraryOpen(true)
  }

  async function cancelEditing() {
    if (dirty) {
      const confirmed = await confirm({
        title: t("customDashboards.toolbar.discardTitle"),
        description: t("customDashboards.toolbar.discardDescription"),
        confirmLabel: t("customDashboards.toolbar.discard"),
        cancelLabel: t("customDashboards.toolbar.keepEditing"),
        destructive: true,
      })
      if (!confirmed) return
    }
    discard(dashboardId)
  }

  async function save() {
    const current = useEditorStore.getState().sessions[dashboardId]
    if (!current || saving) return

    setSaving(true)
    try {
      // A lista inteira é trocada de uma vez. Se alguém salvou enquanto isto estava aberto, salvar agora apagaria o que a
      // outra pessoa fez, sem aviso.
      const { customDashboard } = await apiGet<{ customDashboard: CustomDashboard }>(`/custom-dashboards/${dashboardId}`)
      if (!sameWidgets(toSnapshot(normalizeDashboard(customDashboard)), current.saved)) {
        // A versão nova já veio: quem desistir e descartar o rascunho cai nela, e não na que estava guardada.
        await storeDashboard(customDashboard)
        const overwrite = await confirm({
          title: t("customDashboards.toolbar.conflictTitle"),
          description: t("customDashboards.toolbar.conflictDescription"),
          confirmLabel: t("customDashboards.toolbar.overwrite"),
          destructive: true,
        })
        if (!overwrite) return
      }

      const widgets = snapshotToWidgets(current.present)
      await update(dashboardId, { widgets })
      finish(dashboardId)
      toast.success(t("customDashboards.toolbar.saved"))
    } catch (error) {
      showSaveError(error)
    } finally {
      setSaving(false)
    }
  }

  function showSaveError(error: unknown) {
    const current = useEditorStore.getState().sessions[dashboardId]
    if (error instanceof ApiError && error.code === "invalidWidget" && current) {
      // A API diz qual card recusou: abre ele, para a pessoa consertar ali.
      const position = Number((error.details as unknown as { position?: number } | undefined)?.position)
      const widget = snapshotToWidgets(current.present)[position]
      toast.error(error.serverMessage ?? t("customDashboards.toolbar.saveFailed"))
      if (widget) setEditorTarget({ kind: "edit", widget })
      return
    }
    toast.error(error instanceof ApiError && error.serverMessage ? error.serverMessage : t("customDashboards.toolbar.saveFailed"))
  }

  function applyEditor(widget: Omit<DashboardWidget, "position">, target: EditorTarget) {
    if (target.kind === "new") {
      addWidget(dashboardId, widget)
      toast.success(t("customDashboards.card.added"))
    } else {
      const { id: _id, layout: _layout, ...patch } = widget
      updateWidget(dashboardId, target.widget.id, patch)
    }
  }

  function startBlank(type: WidgetType) {
    setLibraryOpen(false)
    setEditorTarget({ kind: "new", values: newDraft(type, dataSources ?? []), size: WIDGET_SPECS[type].size })
  }

  function customizeRecipe(recipe: Recipe) {
    setLibraryOpen(false)
    const widget = instantiateRecipe(recipe, t)
    const source = dataSources?.find((item) => item.key === widget.dataSource)
    setEditorTarget({ kind: "new", values: widgetToEditor(widget, source), size: widget.layout })
  }

  async function duplicateDashboard() {
    try {
      const copy = await duplicate(dashboardId)
      toast.success(t("customDashboards.toolbar.duplicated", { name: copy.name }))
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current)
          next.set("tab", copy.id)
          return next
        },
        { replace: true }
      )
    } catch {
      toast.error(t("customDashboards.toolbar.actionFailed"))
    }
  }

  async function deleteDashboard() {
    const confirmed = await confirm({
      title: t("customDashboards.toolbar.deleteTitle", { name: dashboard.name }),
      description: t("customDashboards.toolbar.deleteDescription"),
      confirmLabel: t("customDashboards.toolbar.delete"),
      destructive: true,
      onConfirm: () => remove(dashboardId),
    })
    if (!confirmed) return

    discard(dashboardId)
    toast.success(t("customDashboards.toolbar.deleted"))
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.delete("tab")
        return next
      },
      { replace: true }
    )
  }

  async function favorite() {
    try {
      const isFavorite = await toggleFavorite(dashboardId)
      toast.success(t(isFavorite ? "customDashboards.toolbar.favorited" : "customDashboards.toolbar.unfavorited"))
    } catch {
      toast.error(t("customDashboards.toolbar.actionFailed"))
    }
  }

  const refreshInterval = editing ? 0 : refreshSeconds * 1000
  const empty = snapshot.order.length === 0

  return (
    <WidgetActionsContext.Provider value={actions}>
      <div className="flex flex-col gap-3">
        <DashboardToolbar
          dashboard={dashboard}
          editing={editing}
          dirty={dirty}
          saving={saving}
          canUndo={Boolean(session?.past.length)}
          canRedo={Boolean(session?.future.length)}
          refreshSeconds={refreshSeconds}
          onRefreshSecondsChange={setRefreshSeconds}
          onRefresh={() => void refreshWidgetData()}
          onEdit={beginEditing}
          onAddCard={() => setLibraryOpen(true)}
          onUndo={() => undo(dashboardId)}
          onRedo={() => redo(dashboardId)}
          onCancel={() => void cancelEditing()}
          onSave={() => void save()}
          onRename={() => setDetailsOpen(true)}
          onDuplicate={() => void duplicateDashboard()}
          onToggleFavorite={() => void favorite()}
          onDelete={() => void deleteDashboard()}
        />

        {editing && isMobile ? (
          <Callout tone="neutral" icon={<Smartphone className="size-4" />}>
            {t("customDashboards.tab.mobileEditHint")}
          </Callout>
        ) : null}

        {empty ? (
          <EmptyState
            title={t("customDashboards.tab.emptyTitle")}
            description={t("customDashboards.tab.emptyHint")}
            action={{ label: t("customDashboards.toolbar.addCard"), onClick: openLibrary }}
          />
        ) : (
          <DashboardCanvas
            dashboardId={dashboardId}
            snapshot={snapshot}
            editing={editing}
            period={period}
            refreshInterval={refreshInterval}
            selectedId={editorTarget?.kind === "edit" ? editorTarget.widget.id : null}
            gridApi={gridApi}
          />
        )}

        {editing && !empty ? (
          <Button
            type="button"
            variant="outline"
            className="h-16 w-full border-dashed text-muted-foreground"
            onClick={() => setLibraryOpen(true)}
          >
            <Plus />
            {t("customDashboards.toolbar.addCard")}
          </Button>
        ) : null}
      </div>

      <WidgetLibrary
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        widgetCount={snapshot.order.length}
        onAdd={(widget) => addWidget(dashboardId, widget)}
        onCustomize={customizeRecipe}
        onStartBlank={startBlank}
      />

      <WidgetEditorPanel target={editorTarget} period={period} onClose={() => setEditorTarget(null)} onApply={applyEditor} />

      <DashboardDetailsDialog dashboard={dashboard} open={detailsOpen} onOpenChange={setDetailsOpen} />

      <ResponsiveDialog
        open={Boolean(expanded)}
        onOpenChange={(open) => {
          if (!open) setExpanded(null)
        }}
        title={expanded?.title ?? ""}
        description={expanded?.visualConfig.subtitle}
        size="xl"
        className="sm:max-w-[min(90vw,72rem)]"
      >
        {expanded ? (
          <div className="h-[min(70dvh,40rem)]">
            <WidgetCard widget={expanded} period={period} presentation="expanded" className="ring-0" />
          </div>
        ) : null}
      </ResponsiveDialog>
    </WidgetActionsContext.Provider>
  )
}
