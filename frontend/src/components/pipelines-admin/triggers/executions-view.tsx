import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router"
import {
  CircleAlert,
  CircleCheck,
  CircleMinus,
  Clock3,
  ChevronDown,
  ExternalLink,
  History,
  RefreshCw,
} from "lucide-react"

import {
  Callout,
  CopyButton,
  EmptyState,
  ErrorState,
  FilterBar,
  ListSkeleton,
  RelativeTime,
  SegmentedControl,
  SelectInput,
  StatusBadge,
  TablePagination,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useTriggerExecutions } from "@/hooks/pipelines-admin/use-triggers"
import { useTriggerContext } from "@/hooks/pipelines-admin/use-trigger-context"
import { formatFullDateTime } from "@/lib/date-format"
import { useLanguage } from "@/lib/i18n"
import { isEnqueuedOnly } from "@/lib/pipelines-admin/trigger-form"
import type {
  ExecutedAction,
  ExecutionStatus,
  Trigger,
  TriggerExecution,
} from "@/lib/pipelines-admin/types"
import { cn } from "@/lib/utils"

const PER_PAGE = 30

type StatusFilter = "all" | ExecutionStatus

type ExecutionsViewProps = {
  triggers: Trigger[]
  status: StatusFilter
  triggerId: string | null
  onStatusChange: (status: StatusFilter) => void
  onTriggerChange: (triggerId: string | null) => void
}

/**
 * O que aconteceu, gatilho a gatilho: cada ação diz como terminou. Falha é para ser lida por quem
 * tem que resolver, não por quem programou: o texto vem traduzido do servidor, e o erro de um código
 * aparece como veio, para copiar e mandar para quem escreveu.
 */
export function ExecutionsView({
  triggers,
  status,
  triggerId,
  onStatusChange,
  onTriggerChange,
}: ExecutionsViewProps) {
  const { t } = useTranslation()
  const { board } = useTriggerContext()
  const [page, setPage] = useState(1)

  const { executions, meta, error, isLoading, isValidating, reload } = useTriggerExecutions(board.id, {
    status: status === "all" ? null : status,
    triggerId,
    page,
    perPage: PER_PAGE,
  })

  const isFiltered = status !== "all" || Boolean(triggerId)
  const hasCodeTrigger = triggers.some((trigger) => trigger.actions.some((action) => action.type === "run_code"))

  function clearFilters() {
    onStatusChange("all")
    onTriggerChange(null)
    setPage(1)
  }

  const triggerOptions = useMemo(
    () => triggers.map((trigger) => ({ value: trigger.id, label: trigger.name })),
    [triggers]
  )

  return (
    <div className="flex flex-col gap-4">
      <FilterBar
        activeCount={(status === "all" ? 0 : 1) + (triggerId ? 1 : 0)}
        onClear={clearFilters}
        resultLabel={meta ? t("pipelinesAdmin.triggers.history.count", { count: meta.total }) : undefined}
        filters={
          <>
            <SelectInput
              aria-label={t("pipelinesAdmin.triggers.history.filterTrigger")}
              options={triggerOptions}
              value={triggerId}
              placeholder={t("pipelinesAdmin.triggers.history.allTriggers")}
              clearLabel={t("pipelinesAdmin.triggers.history.allTriggers")}
              className="md:w-64"
              onChange={(value) => {
                onTriggerChange(value)
                setPage(1)
              }}
            />
            <SegmentedControl<StatusFilter>
              aria-label={t("pipelinesAdmin.triggers.history.filterStatus")}
              value={status}
              onChange={(value) => {
                onStatusChange(value)
                setPage(1)
              }}
              options={[
                { value: "all", label: t("pipelinesAdmin.triggers.history.status.all") },
                { value: "failure", label: t("pipelinesAdmin.triggers.history.status.failure") },
                { value: "success", label: t("pipelinesAdmin.triggers.history.status.success") },
              ]}
            />
          </>
        }
        actions={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("pipelinesAdmin.triggers.history.refresh")}
            className="text-muted-foreground pointer-coarse:size-10"
            onClick={() => void reload()}
          >
            <RefreshCw className={cn(isValidating && "animate-spin motion-reduce:animate-none")} />
          </Button>
        }
      />

      {hasCodeTrigger ? (
        <Callout tone="neutral" icon={<Clock3 />}>
          {t("pipelinesAdmin.triggers.history.codeNotice")}
        </Callout>
      ) : null}

      {error && !executions ? (
        <ErrorState error={error} onRetry={() => void reload()} />
      ) : isLoading || !executions ? (
        <ListSkeleton rows={6} />
      ) : executions.length === 0 ? (
        <EmptyState
          icon={<History className="size-5" />}
          title={
            isFiltered
              ? t("pipelinesAdmin.triggers.history.noResults.title")
              : t("pipelinesAdmin.triggers.history.empty.title")
          }
          description={
            isFiltered
              ? t("pipelinesAdmin.triggers.history.noResults.description")
              : t("pipelinesAdmin.triggers.history.empty.description")
          }
          action={isFiltered ? { label: t("pipelinesAdmin.triggers.history.clear"), onClick: clearFilters } : undefined}
        />
      ) : (
        <>
          <ul className={cn("flex flex-col divide-y rounded-lg ring-1 ring-foreground/10", isValidating && "opacity-70")}>
            {executions.map((execution) => (
              <ExecutionRow key={execution.id} execution={execution} />
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
    </div>
  )
}

function ExecutionRow({ execution }: { execution: TriggerExecution }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const { board } = useTriggerContext()

  const enqueued = isEnqueuedOnly(execution)
  const name = execution.triggerName ?? t("pipelinesAdmin.triggers.history.deletedTrigger")

  return (
    <li>
      <Collapsible>
        <CollapsibleTrigger
          render={
            <button
              type="button"
              className="group flex w-full items-center gap-3 px-3 py-2.5 text-left outline-none transition-colors first:rounded-t-lg hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
            />
          }
        >
          <ExecutionStatusIcon status={execution.status} enqueued={enqueued} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{name}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {execution.cardTitle ?? t("pipelinesAdmin.triggers.history.deletedCard")}
              {execution.errorMessage ? ` · ${execution.errorMessage}` : ""}
            </span>
            <RelativeTime value={execution.executedAt} className="block text-xs text-muted-foreground sm:hidden" />
          </span>
          <RelativeTime value={execution.executedAt} className="hidden shrink-0 text-xs text-muted-foreground sm:block" />
          <ChevronDown
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-180"
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="flex flex-col gap-3 border-t bg-muted/20 px-3 py-3 sm:pl-10">
            <ul className="flex flex-col gap-2">
              {execution.executedActions.map((action, index) => (
                <ActionOutcome key={index} action={action} />
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{formatFullDateTime(execution.executedAt, language)}</span>
              {execution.cardTitle ? (
                <Link
                  to={`/pipelines/${board.id}/board?card=${execution.cardId}`}
                  className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground"
                >
                  <ExternalLink aria-hidden className="size-3" />
                  {t("pipelinesAdmin.triggers.history.openCard")}
                </Link>
              ) : null}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </li>
  )
}

function ExecutionStatusIcon({ status, enqueued }: { status: ExecutionStatus; enqueued: boolean }) {
  const { t } = useTranslation()

  if (enqueued) {
    return (
      <span title={t("pipelinesAdmin.triggers.history.enqueued")} className="shrink-0 text-status-info">
        <Clock3 aria-label={t("pipelinesAdmin.triggers.history.enqueued")} className="size-4" />
      </span>
    )
  }
  if (status === "failure") {
    return (
      <span title={t("pipelinesAdmin.triggers.history.status.failure")} className="shrink-0 text-status-danger">
        <CircleAlert aria-label={t("pipelinesAdmin.triggers.history.status.failure")} className="size-4" />
      </span>
    )
  }
  if (status === "skipped") {
    return (
      <span title={t("pipelinesAdmin.triggers.history.status.skipped")} className="shrink-0 text-muted-foreground">
        <CircleMinus aria-label={t("pipelinesAdmin.triggers.history.status.skipped")} className="size-4" />
      </span>
    )
  }
  return (
    <span title={t("pipelinesAdmin.triggers.history.status.success")} className="shrink-0 text-status-success">
      <CircleCheck aria-label={t("pipelinesAdmin.triggers.history.status.success")} className="size-4" />
    </span>
  )
}

function ActionOutcome({ action }: { action: ExecutedAction }) {
  const { t, i18n } = useTranslation()
  const { lookups } = useTriggerContext()

  const labelKey = `pipelinesAdmin.triggers.actions.${action.type}.label`
  const label = i18n.exists(labelKey) ? t(labelKey) : t("pipelinesAdmin.triggers.history.unknownAction")
  const failed = action.status === "failure"

  const detail = (() => {
    if (action.enqueued) return t("pipelinesAdmin.triggers.history.outcome.enqueued")
    if (action.notified !== undefined) return t("pipelinesAdmin.triggers.history.outcome.notified", { count: action.notified })
    if (action.accountId) {
      return t("pipelinesAdmin.triggers.history.outcome.assigned", {
        name: lookups.personName(action.accountId) ?? t("pipelinesAdmin.triggers.history.outcome.someone"),
      })
    }
    if (action.statusCode !== undefined) return t("pipelinesAdmin.triggers.history.outcome.statusCode", { code: action.statusCode })
    if (action.cardId) return t("pipelinesAdmin.triggers.history.outcome.cardCreated")
    return null
  })()

  return (
    <li className="flex items-start gap-2 text-sm">
      {failed ? (
        <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0 text-status-danger" />
      ) : action.enqueued ? (
        <Clock3 aria-hidden className="mt-0.5 size-3.5 shrink-0 text-status-info" />
      ) : (
        <CircleCheck aria-hidden className="mt-0.5 size-3.5 shrink-0 text-status-success" />
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <p className="flex flex-wrap items-center gap-x-2">
          <span className="font-medium">{label}</span>
          {failed ? <StatusBadge tone="danger">{t("pipelinesAdmin.triggers.history.status.failure")}</StatusBadge> : null}
          {detail ? <span className="text-muted-foreground">{detail}</span> : null}
        </p>
        {action.error ? (
          <div className="flex items-start gap-1">
            <p className="min-w-0 flex-1 rounded-md bg-status-danger-soft px-2 py-1 text-xs break-words text-status-danger">
              {action.error}
            </p>
            <CopyButton value={action.error} className="shrink-0" />
          </div>
        ) : null}
        {action.result ? (
          <pre className="overflow-x-auto rounded-md bg-muted px-2 py-1 font-mono text-xs">
            <code>{action.result}</code>
          </pre>
        ) : null}
      </div>
    </li>
  )
}
