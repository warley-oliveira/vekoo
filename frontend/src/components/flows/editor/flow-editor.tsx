import { lazy, Suspense, useEffect, useMemo, useState } from "react"
import { ReactFlowProvider } from "@xyflow/react"
import { useTranslation } from "react-i18next"
import { RefreshCw, Sparkles, X } from "lucide-react"
import { toast } from "sonner"
import { useSearchParams } from "react-router"

import { Callout, ConfirmDialog, EmptyState } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useFlowExecution } from "@/hooks/flows/use-flows"
import { useIsMobile } from "@/hooks/use-is-mobile"
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import { prepareDefinition } from "@/lib/flows/fields"
import { contactLabel } from "@/lib/flows/execution-steps"
import type { FlowDefinition, FlowDetail } from "@/lib/flows/types"

import { BasePromptDialog } from "./base-prompt-dialog"
import { BlockPicker } from "./block-picker"
import { FlowDetailsDialog } from "./details-dialog"
import { FieldsPanel } from "./fields-panel"
import { FlowCanvas } from "./flow-canvas"
import { FlowContext, useFlowContext } from "./flow-context"
import { Inspector } from "./inspector/inspector"
import { OutlineList, OutlinePanel } from "./outline-panel"
import { PublishDialog } from "./publish-dialog"
import { createRunStore, RunStoreContext, useRun, useRunApi, type RunStep } from "./run-store"
import { StartFlowDialog } from "./start-dialog"
import { createEditorStore, EditorStoreContext, useEditor, useEditorApi } from "./store"
import { TestPanel } from "./test-panel"
import { useEditorUi } from "./ui-store"
import { useAutosave } from "./use-autosave"
import { useEditorHeader } from "./use-editor-header"
import { useEditorShortcuts } from "./use-editor-shortcuts"
import { VersionsPanel } from "./versions-panel"

// A montagem do editor: um store por fluxo aberto e os painéis em volta do quadro. No celular o quadro fica
// só de leitura, com a lista como visão principal. Editar nós num visor de 390 px não ajudaria ninguém.

const CodeToolPanel = lazy(() => import("./code-tool-panel"))

const EMPTY: FlowDefinition = { nodes: [], edges: [] }

export function FlowEditor({
  flow,
  reload,
  demo = false,
}: {
  flow: FlowDetail
  reload: () => Promise<unknown>
  /** Sem salvar nem validar no servidor: é a tela de medição, em `routes/dev`. */
  demo?: boolean
}) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()

  const [store] = useState(() =>
    createEditorStore(
      prepareDefinition(flow.draft?.definition ?? flow.publishedVersion?.definition ?? EMPTY),
      isMobile,
      { block: t("flows.canvas.a11y.blockRole"), link: t("flows.canvas.a11y.linkRole") }
    )
  )
  const [runStore] = useState(createRunStore)
  const context = useMemo(() => ({ flow, reload }), [flow, reload])

  useEffect(() => () => useEditorUi.getState().reset(), [])

  // A largura mudou com o editor aberto (girou o tablet): só leitura acompanha.
  useEffect(() => {
    store.setState({ readOnly: isMobile })
  }, [isMobile, store])

  return (
    <EditorStoreContext.Provider value={store}>
      <RunStoreContext.Provider value={runStore}>
        <FlowContext.Provider value={context}>
          <ReactFlowProvider>
            <TooltipProvider>
              <EditorSurface demo={demo} />
            </TooltipProvider>
          </ReactFlowProvider>
        </FlowContext.Provider>
      </RunStoreContext.Provider>
    </EditorStoreContext.Provider>
  )
}

function EditorSurface({ demo }: { demo: boolean }) {
  const isMobile = useIsMobile()
  const codeTool = useEditorUi((state) => state.codeTool)
  useEditorHeader()

  return (
    <div className="relative h-full min-h-0 overflow-hidden">
      {demo ? null : <EditorEffects />}
      <ShortcutEffects />
      <ReplayFromUrl />

      {isMobile ? <MobileBody /> : <FlowCanvas />}

      <Banners />
      <EmptyCanvas />
      <FirstStepHint />
      <Inspector />
      <OutlinePanel />
      <TestPanel />
      <BlockPicker />

      <PublishDialog />
      <FlowDetailsDialog />
      <FieldsPanel />
      <BasePromptDialog />
      <VersionsPanel />
      <StartFlowDialog />
      {codeTool ? (
        <Suspense fallback={null}>
          <CodeToolPanel />
        </Suspense>
      ) : null}
    </div>
  )
}

function ShortcutEffects() {
  useEditorShortcuts()
  return null
}

function EditorEffects() {
  const { flow } = useFlowContext()
  const { loadServer, keepMine } = useAutosave(flow)
  const { t } = useTranslation()
  const status = useEditorUi((state) => state.saveStatus)
  const api = useEditorApi()

  // Excluiu um bloco: desfazer fica à mão. É por isso que excluir não pergunta nada.
  useEffect(() => {
    return api.subscribe((state, previous) => {
      if (state.deletions === previous.deletions) return
      const count = state.deletions - previous.deletions
      toast(t("flows.toast.deleted", { count }), {
        action: { label: t("flows.toolbar.undo"), onClick: () => api.getState().undo() },
      })
    })
  }, [api, t])

  const guard = useLeaveGuard()

  return (
    <>
      {status === "conflict" ? (
        <div className="absolute top-3 left-1/2 z-30 w-[min(36rem,calc(100%-2rem))] -translate-x-1/2">
          <Callout
            tone="warning"
            role="alert"
            title={t("flows.conflict.title")}
            action={
              <div className="flex gap-1.5">
                <Button type="button" variant="outline" size="sm" onClick={loadServer}>
                  <RefreshCw />
                  {t("flows.conflict.reload")}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={keepMine}>
                  {t("flows.conflict.keep")}
                </Button>
              </div>
            }
          >
            {t("flows.conflict.description")}
          </Callout>
        </div>
      ) : null}
      {guard}
    </>
  )
}

/**
 * Sair com algo pendente: grava primeiro, e só pergunta se não conseguiu gravar. Na maioria das vezes a
 * pessoa nem fica sabendo, porque o salvamento automático já cuidou.
 */
function useLeaveGuard() {
  const { t } = useTranslation()
  const status = useEditorUi((state) => state.saveStatus)
  const pending = status !== "saved"
  const { blocked, proceed, reset } = useUnsavedChanges(pending)
  const [asking, setAsking] = useState(false)

  useEffect(() => {
    if (!blocked) {
      setAsking(false)
      return
    }
    let alive = true
    void useEditorUi
      .getState()
      .flush()
      .then((saved) => {
        if (!alive) return
        if (saved) proceed()
        else setAsking(true)
      })
    return () => {
      alive = false
    }
  }, [blocked, proceed])

  return (
    <ConfirmDialog
      open={asking}
      onOpenChange={(open) => {
        if (!open) {
          setAsking(false)
          reset()
        }
      }}
      onConfirmed={proceed}
      destructive
      title={t("flows.leave.title")}
      description={t("flows.leave.description")}
      confirmLabel={t("flows.leave.confirm")}
      cancelLabel={t("flows.leave.stay")}
    />
  )
}

/* ---------- Avisos sobre o quadro ---------- */

function Banners() {
  const { t } = useTranslation()
  const replay = useEditorUi((state) => state.replay)
  const runApi = useRunApi()
  const [, setParams] = useSearchParams()

  if (!replay) return null

  return (
    <div className="pointer-events-none absolute top-3 left-1/2 z-10 flex w-max max-w-[calc(100%-2rem)] -translate-x-1/2 justify-center">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border bg-popover py-1 pr-1 pl-3 text-sm shadow-sm">
        <span className="truncate">{t("flows.replay.showing", { name: replay.label })}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="rounded-full"
          aria-label={t("flows.replay.clear")}
          title={t("flows.replay.clear")}
          onClick={() => {
            runApi.getState().reset()
            useEditorUi.setState({ replay: null })
            setParams(
              (current) => {
                const next = new URLSearchParams(current)
                next.delete("execution")
                return next
              },
              { replace: true }
            )
          }}
        >
          <X />
        </Button>
      </div>
    </div>
  )
}

/** Definição sem nenhum bloco. Pela tela não acontece, porque o gatilho não sai; pela API, pode. */
function EmptyCanvas() {
  const { t } = useTranslation()
  const api = useEditorApi()
  const empty = useEditor((state) => state.nodes.length === 0)
  const readOnly = useEditor((state) => state.readOnly)
  if (!empty) return null
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-4">
      <div className="pointer-events-auto w-[min(22rem,100%)]">
        <EmptyState
          className="bg-card"
          title={t("flows.canvas.emptyTitle")}
          description={t("flows.canvas.emptyHint")}
          action={readOnly ? undefined : { label: t("flows.toolbar.add"), onClick: () => api.getState().openPicker({}) }}
        />
      </div>
    </div>
  )
}

/** A primeira coisa que alguém precisa saber, enquanto o fluxo ainda é só o gatilho. */
function FirstStepHint() {
  const { t } = useTranslation()
  const readOnly = useEditor((state) => state.readOnly)
  const lonely = useEditor((state) => state.nodes.length === 1 && state.edges.length === 0)
  const picker = useEditor((state) => Boolean(state.picker))
  if (readOnly || !lonely || picker) return null
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-4">
      <p className="flex items-center gap-2 rounded-full border bg-popover px-3 py-1.5 text-sm text-pretty shadow-sm">
        <Sparkles className="size-3.5 shrink-0 text-primary" aria-hidden />
        {t("flows.canvas.firstStep")}
      </p>
    </div>
  )
}

/* ---------- Execução do histórico acesa no quadro ---------- */

function ReplayFromUrl() {
  const { t } = useTranslation()
  const { flow } = useFlowContext()
  const [params] = useSearchParams()
  const executionId = params.get("execution")
  const { execution } = useFlowExecution(executionId ? flow.id : null, executionId)
  const runApi = useRunApi()
  const lit = useRun((state) => Object.keys(state.blocks).length > 0)

  useEffect(() => {
    if (!execution || lit) return
    const steps = execution.logs.map((log) => ({
      id: log.nodeId,
      step: (log.status === "error" ? "failed" : log.status === "suspended" ? "waiting" : "done") as RunStep,
    }))
    runApi.getState().replay(steps)
    useEditorUi.setState({ replay: { label: contactLabel(execution, t) } })
    // A execução acende uma vez. Limpar e religar o teste não pode trazer de volta.
  }, [execution]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}

/* ---------- Celular ---------- */

function MobileBody() {
  const { t } = useTranslation()
  const [view, setView] = useState<"list" | "map">("list")

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b bg-background px-4 py-2.5">
        <p className="text-xs text-pretty text-muted-foreground">{t("flows.mobile.readOnly")}</p>
        <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg bg-muted p-0.5" role="tablist" aria-label={t("flows.mobile.views")}>
          {(["list", "map"] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={view === option}
              onClick={() => setView(option)}
              className={
                view === option
                  ? "h-9 rounded-md bg-background text-sm font-medium shadow-xs"
                  : "h-9 rounded-md text-sm text-muted-foreground"
              }
            >
              {t(`flows.mobile.${option}`)}
            </button>
          ))}
        </div>
      </div>
      {view === "map" ? (
        <div className="relative min-h-0 flex-1 pb-(--app-bottom-nav-total)">
          <FlowCanvas />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto pb-[calc(var(--app-bottom-nav-total,0px)+1rem)]">
          <OutlineList />
        </div>
      )}
    </div>
  )
}
