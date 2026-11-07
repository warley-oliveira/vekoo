import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router"
import { ChevronRight, MessageCircle, Waypoints } from "lucide-react"

import { Callout, DetailSkeleton, ErrorState, RelativeTime, ResponsiveDialog, StatusBadge, Timeline, type TimelineItem } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useCan } from "@/hooks/use-can"
import { useFlowExecution } from "@/hooks/flows/use-flows"
import { useRetained } from "@/hooks/use-panel-session"
import { blockIcon } from "@/lib/flows/catalog"
import { contactLabel, contactPhone, describeStep, EXECUTION_TONES } from "@/lib/flows/execution-steps"
import type { FlowDefinition, FlowExecutionDetail, FlowExecutionLog } from "@/lib/flows/types"
import { cn } from "@/lib/utils"

// O passo a passo de uma execução, em frases. O dado cru continua a um clique, porque é o que resolve quando alguém
// técnico vai olhar. A falha aparece no topo, explicada; e quem espera resposta diz em qual bloco parou.

export function ExecutionPanel({
  flowId,
  executionId,
  definition,
  onClose,
}: {
  flowId: string
  executionId: string | null
  definition?: FlowDefinition
  onClose: () => void
}) {
  const { t } = useTranslation()
  const shownId = useRetained(executionId)
  const { execution, error, isLoading, reload } = useFlowExecution(flowId, shownId)

  return (
    <ResponsiveDialog
      open={Boolean(executionId)}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      size="lg"
      title={execution ? contactLabel(execution, t) : t("flows.executions.detailTitle")}
      description={execution?.contactName ? (contactPhone(execution) ?? undefined) : undefined}
    >
      {error ? (
        <ErrorState error={error} onRetry={() => void reload()} />
      ) : isLoading || !execution ? (
        <DetailSkeleton rows={6} />
      ) : (
        <ExecutionBody flowId={flowId} execution={execution} definition={definition} />
      )}
    </ResponsiveDialog>
  )
}

function ExecutionBody({
  flowId,
  execution,
  definition,
}: {
  flowId: string
  execution: FlowExecutionDetail
  definition?: FlowDefinition
}) {
  const { t } = useTranslation()
  const canChat = useCan("chat")

  const nodes = useMemo(() => new Map((definition?.nodes ?? []).map((node) => [node.id, node])), [definition])
  const blockName = (log: { nodeId: string; nodeType: string }) => {
    const custom = nodes.get(log.nodeId)?.data?.label
    return (typeof custom === "string" && custom.trim()) || t(`flows.blocks.${log.nodeType}.label`, { defaultValue: log.nodeType })
  }

  const current = execution.currentNodeId
    ? execution.logs.findLast((log) => log.nodeId === execution.currentNodeId)
    : undefined

  const items = useMemo<TimelineItem[]>(
    () =>
      execution.logs.map((log) => {
        const step = describeStep(log, t)
        const Icon = blockIcon(log.nodeType)
        return {
          id: log.id,
          icon: <Icon />,
          tone: step.tone,
          title: (
            <span>
              <span className="font-medium">{step.title}</span>
              <span className="text-muted-foreground"> · {blockName(log)}</span>
            </span>
          ),
          description: step.detail ? <span className="break-words whitespace-pre-wrap">{step.detail}</span> : undefined,
          time: log.executedAt,
          content: <RawLog log={log} />,
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [execution.logs, nodes, t]
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={EXECUTION_TONES[execution.status]}>{t(`flows.executions.status.${execution.status}`)}</StatusBadge>
        <span className="text-xs text-muted-foreground">
          {t("flows.executions.startedAt")} <RelativeTime value={execution.startedAt} />
        </span>
      </div>

      {execution.status === "failed" ? (
        <Callout tone="danger" role="alert" title={t("flows.executions.failedTitle")}>
          {execution.errorMessage || t("flows.executions.failedUnknown")}
        </Callout>
      ) : null}

      {execution.status === "waiting_for_message" ? (
        <Callout tone="warning" title={t("flows.executions.waitingTitle", { name: contactLabel(execution, t) })}>
          {current ? t("flows.executions.waitingAt", { name: blockName(current) }) : t("flows.executions.waitingHint")}
        </Callout>
      ) : null}

      {execution.status === "waiting" ? (
        <Callout title={t("flows.executions.waitingTimeTitle")}>{t("flows.executions.waitingTimeHint")}</Callout>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link to={`/flows/${flowId}?execution=${execution.id}`} />}
        >
          <Waypoints />
          {t("flows.executions.seeInFlow")}
        </Button>
        {execution.chatId && canChat ? (
          <Button variant="outline" size="sm" nativeButton={false} render={<Link to={`/chat/${execution.chatId}`} />}>
            <MessageCircle />
            {t("flows.executions.openChat")}
          </Button>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("flows.executions.noSteps")}</p>
      ) : (
        <Timeline items={items} />
      )}
    </div>
  )
}

function RawLog({ log }: { log: FlowExecutionLog }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const raw = useMemo(
    () => (open ? JSON.stringify({ input: log.input, output: log.output, durationMs: log.durationMs }, null, 2) : ""),
    [log, open]
  )
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        render={
          <button
            type="button"
            className="mt-0.5 inline-flex items-center gap-0.5 rounded text-xs text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          />
        }
      >
        <ChevronRight className={cn("size-3 transition-transform motion-reduce:transition-none", open && "rotate-90")} aria-hidden />
        {t("flows.executions.rawDetails")}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="mt-1 max-h-72 overflow-auto rounded-md bg-muted p-2 font-mono text-[11px] whitespace-pre-wrap">{raw}</pre>
      </CollapsibleContent>
    </Collapsible>
  )
}
