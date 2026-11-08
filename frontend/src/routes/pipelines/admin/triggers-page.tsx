import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useSearchParams } from "@/lib/router"
import { CircleAlert, Plus, Sparkles, Zap } from "lucide-react"
import { toast } from "sonner"

import {
  Callout,
  EmptyState,
  ErrorState,
  FilterBar,
  ListSkeleton,
  SegmentedControl,
  SortMenu,
  useConfirm,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { BoardFrame } from "@/components/pipelines-admin/board-frame"
import { ExecutionsView } from "@/components/pipelines-admin/triggers/executions-view"
import { TriggerCard } from "@/components/pipelines-admin/triggers/trigger-card"
import { TriggerPanel } from "@/components/pipelines-admin/triggers/trigger-panel"
import { useOpenCount, useRetained } from "@/hooks/use-panel-session"
import {
  TriggerContextProvider,
  useTriggerContext,
  useTriggerContextValue,
} from "@/hooks/pipelines-admin/use-trigger-context"
import {
  useTriggerAlerts,
  useTriggerExecutions,
  useTriggerMutations,
  useTriggers,
} from "@/hooks/pipelines-admin/use-triggers"
import { useLanguage } from "@/lib/i18n"
import { adminErrorMessage } from "@/lib/pipelines-admin/error-message"
import { TOKEN_VALUES } from "@/lib/pipelines-admin/trigger-catalog"
import {
  exampleDraft,
  isEnqueuedOnly,
  runsCode,
  triggerToDraft,
  type TriggerExampleKey,
} from "@/lib/pipelines-admin/trigger-form"
import { plainSentence, sentenceParts } from "@/lib/pipelines-admin/trigger-sentence"
import type { Board, ExecutionStatus, Trigger, TriggerExecution } from "@/lib/pipelines-admin/types"
import { matchesSearch } from "@/lib/search-text"

const NEW_TRIGGER = "new"
const STATS_WINDOW = 100

type StatusFilter = "all" | "on" | "off"
type SortOrder = "created" | "name" | "lastFailed"
type HistoryStatus = "all" | ExecutionStatus

export default function TriggersPage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()

  const openNew = () =>
    setParams((current) => {
      const next = new URLSearchParams(current)
      next.set("trigger", NEW_TRIGGER)
      next.delete("example")
      return next
    })

  return (
    <BoardFrame
      area="triggers"
      skeleton={
        <div className="flex flex-col gap-4" aria-hidden>
          <Skeleton className="h-10 w-full max-w-xl" />
          <Skeleton className="h-9 w-56" />
          <ListSkeleton rows={5} />
        </div>
      }
      header={() => ({
        description: t("pipelinesAdmin.triggers.description"),
        actions: (
          <Button onClick={openNew} className="pointer-coarse:h-10">
            <Plus />
            {t("pipelinesAdmin.triggers.create")}
          </Button>
        ),
        mobilePlacement: "inline",
        mobileActions: (
          <Button onClick={openNew} aria-label={t("pipelinesAdmin.triggers.create")} className="pointer-coarse:h-10">
            <Plus />
            {t("pipelinesAdmin.common.new")}
          </Button>
        ),
      })}
    >
      {(board) => <TriggersContent board={board} params={params} setParams={setParams} />}
    </BoardFrame>
  )
}

function TriggersContent({
  board,
  params,
  setParams,
}: {
  board: Board
  params: URLSearchParams
  setParams: ReturnType<typeof useSearchParams>[1]
}) {
  const { t } = useTranslation()
  const context = useTriggerContextValue(board)

  const view = params.get("view") === "history" ? "history" : "list"
  const { triggers, error, isLoading, reload } = useTriggers(board.id)

  function setParam(updates: Record<string, string | null>, replace = false) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        for (const [key, value] of Object.entries(updates)) {
          if (value) next.set(key, value)
          else next.delete(key)
        }
        return next
      },
      { replace }
    )
  }

  const selected = params.get("trigger")
  const example = params.get("example") as TriggerExampleKey | null
  const panelOpen = Boolean(selected)
  const panelKey = useOpenCount(panelOpen)
  const shown = useRetained(selected)
  const editing = useMemo(() => triggers?.find((trigger) => trigger.id === shown) ?? null, [shown, triggers])
  const lastEditing = useRetained(editing)
  const shownTrigger = shown === NEW_TRIGGER ? null : lastEditing
  // Pelo endereço, a lista pode ainda estar a caminho: o formulário nasce com o que tiver, então espera.
  // Gatilho com código, sem a permissão `flows`, não abre: a API recusaria gravar.
  const canShowPanel =
    shown === NEW_TRIGGER ||
    (shownTrigger !== null && (context.canUseCode || !runsCode(shownTrigger)))

  const seed = useMemo(
    () =>
      example
        ? exampleDraft(example, board, t(`pipelinesAdmin.triggers.examples.${example}.message`, TOKEN_VALUES))
        : null,
    [board, example, t]
  )

  return (
    <TriggerContextProvider value={context}>
      <div className="flex flex-col gap-4">
        <SegmentedControl
          aria-label={t("pipelinesAdmin.triggers.viewLabel")}
          className="self-start"
          value={view}
          onChange={(value) => setParam({ view: value === "history" ? "history" : null, status: null, of: null })}
          options={[
            { value: "list", label: t("pipelinesAdmin.triggers.viewList") },
            { value: "history", label: t("pipelinesAdmin.triggers.viewHistory") },
          ]}
        />

        {error && !triggers ? (
          <ErrorState error={error} onRetry={() => void reload()} />
        ) : isLoading || !triggers ? (
          <ListSkeleton rows={5} />
        ) : view === "history" ? (
          <ExecutionsView
            triggers={triggers}
            status={(params.get("status") as HistoryStatus) ?? "all"}
            triggerId={params.get("of")}
            onStatusChange={(status) => setParam({ status: status === "all" ? null : status }, true)}
            onTriggerChange={(id) => setParam({ of: id }, true)}
          />
        ) : (
          <TriggerList
            board={board}
            triggers={triggers}
            onNew={(key) => setParam({ trigger: NEW_TRIGGER, example: key ?? null })}
            onEdit={(id) => setParam({ trigger: id, example: null })}
            onHistory={(id, status) =>
              setParam({ view: "history", of: id, status: status ?? null, trigger: null, example: null })
            }
          />
        )}

        {shown && canShowPanel ? (
          <TriggerPanel
            key={panelKey}
            trigger={shownTrigger}
            seed={seed}
            open={panelOpen}
            onOpenChange={(open) => {
              if (!open) setParam({ trigger: null, example: null }, true)
            }}
          />
        ) : null}
      </div>
    </TriggerContextProvider>
  )
}

function TriggerList({
  board,
  triggers,
  onNew,
  onEdit,
  onHistory,
}: {
  board: Board
  triggers: Trigger[]
  onNew: (example?: TriggerExampleKey) => void
  onEdit: (id: string) => void
  onHistory: (id: string | null, status?: ExecutionStatus) => void
}) {
  const { t } = useTranslation()
  const language = useLanguage()
  const confirm = useConfirm()
  const { lookups } = useTriggerContext()
  const { toggleTrigger, deleteTrigger } = useTriggerMutations(board.id)
  const alerts = useTriggerAlerts(board.id)
  const { executions } = useTriggerExecutions(board.id, { perPage: STATS_WINDOW })

  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<StatusFilter>("all")
  const [sort, setSort] = useState<SortOrder>("created")

  // A última execução de cada gatilho, na janela recente. Basta: o que importa é como foi da última vez.
  const lastByTrigger = useMemo(() => {
    const finished = new Map<string, TriggerExecution>()
    const any = new Map<string, TriggerExecution>()
    for (const execution of executions ?? []) {
      if (!any.has(execution.triggerId)) any.set(execution.triggerId, execution)
      if (!finished.has(execution.triggerId) && !isEnqueuedOnly(execution)) {
        finished.set(execution.triggerId, execution)
      }
    }
    return { finished, any }
  }, [executions])

  const sentences = useMemo(
    () =>
      new Map(
        triggers.map((trigger) => [
          trigger.id,
          plainSentence(
            sentenceParts(triggerToDraft(trigger), lookups),
            (key, values) => t(key, values as Record<string, string>),
            lookups
          ),
        ])
      ),
    [lookups, t, triggers]
  )

  const visible = useMemo(() => {
    const matching = triggers.filter((trigger) => {
      if (status === "on" && !trigger.active) return false
      if (status === "off" && trigger.active) return false
      return (
        !query ||
        matchesSearch(trigger.name, query) ||
        matchesSearch(sentences.get(trigger.id) ?? "", query)
      )
    })
    return [...matching].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, language)
      if (sort === "lastFailed") {
        const failed = (trigger: Trigger) =>
          lastByTrigger.finished.get(trigger.id)?.status === "failure" ? 1 : 0
        return failed(b) - failed(a) || b.createdAt - a.createdAt
      }
      return a.createdAt - b.createdAt
    })
  }, [language, lastByTrigger.finished, query, sentences, sort, status, triggers])

  async function toggle(trigger: Trigger) {
    try {
      await toggleTrigger(trigger)
      toast.success(
        t(trigger.active ? "pipelinesAdmin.triggers.turnedOff" : "pipelinesAdmin.triggers.turnedOn", {
          name: trigger.name,
        })
      )
    } catch (cause) {
      toast.error(adminErrorMessage(t, cause))
    }
  }

  async function remove(trigger: Trigger) {
    const confirmed = await confirm({
      title: t("pipelinesAdmin.triggers.delete.title", { name: trigger.name }),
      description: t(
        runsCode(trigger)
          ? "pipelinesAdmin.triggers.delete.descriptionCode"
          : "pipelinesAdmin.triggers.delete.description"
      ),
      confirmLabel: t("pipelinesAdmin.triggers.delete.confirm"),
      destructive: true,
      onConfirm: () => deleteTrigger(trigger.id),
    })
    if (confirmed) toast.success(t("pipelinesAdmin.triggers.delete.done", { name: trigger.name }))
  }

  if (triggers.length === 0) {
    const examples: TriggerExampleKey[] = [
      "notifyOnStage",
      "assignNew",
      "dueDate",
      ...(board.boardType === "crm" ? (["dealWon"] as const) : []),
    ]
    return (
      <div className="flex flex-col gap-4">
        <EmptyState
          icon={<Zap className="size-5" />}
          title={t("pipelinesAdmin.triggers.empty.title")}
          description={t("pipelinesAdmin.triggers.empty.description")}
          action={{ label: t("pipelinesAdmin.triggers.create"), onClick: () => onNew() }}
        />
        <section className="flex flex-col gap-2">
          <h2 className="flex items-center gap-1.5 text-sm font-medium">
            <Sparkles aria-hidden className="size-4 text-muted-foreground" />
            {t("pipelinesAdmin.triggers.examples.title")}
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {examples.map((key) => (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => onNew(key)}
                  className="flex h-full w-full rounded-lg p-3 text-left text-sm text-pretty ring-1 ring-foreground/10 outline-none transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {t(`pipelinesAdmin.triggers.examples.${key}.sentence`)}
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    )
  }

  const activeCount = triggers.filter((trigger) => trigger.active).length

  return (
    <div className="flex flex-col gap-4">
      {alerts.length > 0 ? (
        <Callout
          tone="warning"
          icon={<CircleAlert />}
          role="status"
          title={t("pipelinesAdmin.triggers.alert.title", { count: alerts.length })}
          action={
            <Button
              variant="outline"
              size="sm"
              className="pointer-coarse:h-10"
              onClick={() => onHistory(null, "failure")}
            >
              {t("pipelinesAdmin.triggers.alert.action")}
            </Button>
          }
        >
          {t("pipelinesAdmin.triggers.alert.description")}
        </Callout>
      ) : null}

      <FilterBar
        search={{
          value: query,
          onChange: setQuery,
          debounce: 0,
          placeholder: t("pipelinesAdmin.triggers.search"),
        }}
        activeCount={status === "all" ? 0 : 1}
        onClear={() => {
          setQuery("")
          setStatus("all")
        }}
        resultLabel={t("pipelinesAdmin.triggers.activeCount", { active: activeCount, count: triggers.length })}
        sort={
          <SortMenu
            value={sort}
            onChange={setSort}
            options={[
              { value: "created", label: t("pipelinesAdmin.triggers.sort.created") },
              { value: "name", label: t("pipelinesAdmin.triggers.sort.name") },
              { value: "lastFailed", label: t("pipelinesAdmin.triggers.sort.lastFailed") },
            ]}
          />
        }
        filters={
          <SegmentedControl<StatusFilter>
            aria-label={t("pipelinesAdmin.triggers.filterStatus")}
            value={status}
            onChange={setStatus}
            options={[
              { value: "all", label: t("pipelinesAdmin.triggers.filters.all") },
              { value: "on", label: t("pipelinesAdmin.triggers.filters.on") },
              { value: "off", label: t("pipelinesAdmin.triggers.filters.off") },
            ]}
          />
        }
      />

      {visible.length === 0 ? (
        <EmptyState
          title={t("pipelinesAdmin.triggers.noResults.title")}
          description={t("pipelinesAdmin.triggers.noResults.description")}
          action={{
            label: t("pipelinesAdmin.triggers.noResults.clear"),
            onClick: () => {
              setQuery("")
              setStatus("all")
            },
          }}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((trigger) => (
            <li key={trigger.id}>
              <TriggerCard
                trigger={trigger}
                lastFinished={lastByTrigger.finished.get(trigger.id)}
                lastAny={lastByTrigger.any.get(trigger.id)}
                onEdit={() => onEdit(trigger.id)}
                onToggle={() => void toggle(trigger)}
                onDelete={() => void remove(trigger)}
                onHistory={() => onHistory(trigger.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
