import { memo, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link, useParams, useSearchParams } from "react-router"
import { ChevronRight, Play, Waypoints } from "lucide-react"

import { ExecutionPanel } from "@/components/flows/execution-panel"
import { StartExecutionButton } from "@/components/flows/start-execution"
import {
  EmptyState,
  ErrorState,
  ListSkeleton,
  PageBody,
  PageHeader,
  RelativeTime,
  SegmentedControl,
  StatusBadge,
  TablePagination,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useFlow, useFlowExecutions } from "@/hooks/flows/use-flows"
import { useIsMobile } from "@/hooks/use-is-mobile"
import { ApiError } from "@/lib/api"
import { contactLabel, contactPhone, EXECUTION_TONES } from "@/lib/flows/execution-steps"
import type { FlowExecution, FlowExecutionStatus } from "@/lib/flows/types"

// O histórico de um fluxo: quem passou por ele, quem ainda está esperando, e o que deu errado. Abre o passo a passo
// num painel, pelo endereço (`?execution=`): o link pode ser mandado para alguém, e o voltar funciona.

type Filter = "all" | "waiting_for_message" | "failed" | "completed"

const FILTERS: Filter[] = ["all", "waiting_for_message", "failed", "completed"]

export default function FlowExecutionsPage() {
  const { t } = useTranslation()
  const { flowId } = useParams()
  const isMobile = useIsMobile()
  const { flow, error: flowError } = useFlow(flowId)
  const [params, setParams] = useSearchParams()
  const [page, setPage] = useState(1)

  const filter = (params.get("status") as Filter | null) ?? "all"
  const openId = params.get("execution")

  const { executions, counts, meta, error, isLoading, reload } = useFlowExecutions(flowId ?? null, {
    status: filter === "all" ? null : (filter as FlowExecutionStatus),
    page,
  })

  const update = (change: (next: URLSearchParams) => void) =>
    setParams(
      (current) => {
        const copy = new URLSearchParams(current)
        change(copy)
        return copy
      },
      { replace: false }
    )

  const total = useMemo(() => Object.values(counts ?? {}).reduce((sum, value) => sum + (value ?? 0), 0), [counts])
  const options = FILTERS.map((value) => ({
    value,
    label: t(`flows.executions.filter.${value}`),
    count: value === "all" ? total : (counts?.[value as FlowExecutionStatus] ?? 0),
  }))

  // Fluxo excluído, ou link errado: o erro das execuções diria que foi a conexão.
  if (flowError instanceof ApiError && flowError.status === 404) {
    return (
      <PageBody>
        <PageHeader backTo="/flows" title={t("flows.executions.routeTitle")} />
        <EmptyState title={t("flows.editor.notFound")} description={t("flows.editor.notFoundHint")} />
      </PageBody>
    )
  }

  return (
    <PageBody>
      <PageHeader
        title={flow ? t("flows.executions.title", { name: flow.name }) : t("flows.executions.routeTitle")}
        backTo={`/flows/${flowId}`}
        parentTitle={t("navigation.flows")}
        description={t("flows.executions.description")}
        actions={
          <div className="flex items-center gap-1.5">
            {flow?.triggerType === "manual" && flow.published ? (
              <StartExecutionButton flowId={flow.id} flowName={flow.name} />
            ) : null}
            <Button variant="outline" size="sm" nativeButton={false} render={<Link to={`/flows/${flowId}`} />}>
              <Waypoints />
              {t("flows.executions.openFlow")}
            </Button>
          </div>
        }
        mobilePlacement="hidden"
      />

      <div className={isMobile ? "-mx-4 overflow-x-auto px-4" : undefined}>
        <SegmentedControl
          aria-label={t("flows.executions.filterLabel")}
          value={filter}
          onChange={(next) => {
            setPage(1)
            update((copy) => {
              if (next === "all") copy.delete("status")
              else copy.set("status", next)
            })
          }}
          options={options}
        />
      </div>

      {error && !executions ? (
        <ErrorState error={error} onRetry={() => void reload()} />
      ) : isLoading && !executions ? (
        <ListSkeleton rows={8} avatar />
      ) : !executions?.length ? (
        <EmptyState
          icon={<Play className="size-5" />}
          title={t(`flows.executions.empty.${filter}`)}
          description={filter === "all" ? t("flows.executions.emptyHint") : undefined}
        />
      ) : (
        <>
          <ul className="flex flex-col divide-y rounded-xl border bg-card">
            {executions.map((execution) => (
              <ExecutionRow
                key={execution.id}
                execution={execution}
                onOpen={() => update((copy) => copy.set("execution", execution.id))}
              />
            ))}
          </ul>
          {meta && meta.totalPages > 1 ? (
            <TablePagination
              page={meta.page}
              totalPages={meta.totalPages}
              total={meta.total}
              perPage={meta.perPage}
              onPageChange={setPage}
            />
          ) : null}
        </>
      )}

      {flowId ? (
        <ExecutionPanel
          flowId={flowId}
          executionId={openId}
          definition={flow?.draft?.definition}
          onClose={() => update((copy) => copy.delete("execution"))}
        />
      ) : null}
    </PageBody>
  )
}

const ExecutionRow = memo(function ExecutionRow({ execution, onOpen }: { execution: FlowExecution; onOpen: () => void }) {
  const { t } = useTranslation()
  const name = contactLabel(execution, t)
  const phone = execution.contactName ? contactPhone(execution) : null

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:px-4"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {phone ? `${phone} · ` : ""}
            <RelativeTime value={execution.startedAt} />
          </span>
        </span>
        <StatusBadge tone={EXECUTION_TONES[execution.status]}>{t(`flows.executions.status.${execution.status}`)}</StatusBadge>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>
    </li>
  )
})

