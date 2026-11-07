import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { AlertTriangle, ArrowRight, CheckCircle2, CircleAlert, Loader2, Rocket } from "lucide-react"
import { toast } from "sonner"
import { useShallow } from "zustand/react/shallow"

import { ResponsiveDialog } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useFlowMutations } from "@/hooks/flows/use-flows"
import { ApiError } from "@/lib/api"
import { isTrigger } from "@/lib/flows/catalog"
import type { ServerPublishIssue } from "@/lib/flows/types"
import { issuesFromServer, validateFlow, type FlowIssue } from "@/lib/flows/validate"
import { cn } from "@/lib/utils"

import { useFlowContext } from "./flow-context"
import { useEditorApi } from "./store"
import { useEditorUi } from "./ui-store"
import { useFocusBlock } from "./use-editor-shortcuts"

// A conferência antes de publicar. Cada problema leva ao bloco que resolve. Erro impede publicar, aviso não:
// um caminho sem saída pode ser exatamente o que a pessoa quer.

export function PublishDialog() {
  const open = useEditorUi((state) => state.dialog === "publish")
  const setDialog = useEditorUi((state) => state.setDialog)
  return open ? <PublishBody onClose={() => setDialog(null)} /> : null
}

function PublishBody({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const api = useEditorApi()
  const { flow, reload } = useFlowContext()
  const { publishFlow } = useFlowMutations()
  const focusBlock = useFocusBlock()
  const liveIssues = useEditorUi((state) => state.issues)
  const [serverIssues, setServerIssues] = useState<FlowIssue[]>([])
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  // Ao abrir, confere o que está no quadro agora, e não o resultado da última pausa.
  useEffect(() => {
    const { nodes, edges } = api.getState()
    useEditorUi.setState({ issues: validateFlow(nodes, edges) })
  }, [api])

  const issues = useMemo(() => [...serverIssues, ...liveIssues], [liveIssues, serverIssues])
  const errors = issues.filter((issue) => issue.severity === "error")
  const warnings = issues.filter((issue) => issue.severity === "warning")

  const triggerType = useEditorApi().getState().nodes.find((node) => isTrigger(node.type))?.type

  const publish = async () => {
    setBusy(true)
    setFailure(null)
    setServerIssues([])
    try {
      const saved = await useEditorUi.getState().flush()
      if (!saved) {
        setFailure(t("flows.publish.saveFailed"))
        return
      }
      const published = await publishFlow(flow.id)
      useEditorUi.getState().acceptDraft(published.draft)
      useEditorUi.setState({ unpublished: false })
      await reload()
      toast.success(t("flows.publish.done", { name: flow.name }))
      onClose()
    } catch (error) {
      if (error instanceof ApiError && error.code === "invalidDefinition") {
        const details = error.details as { issues?: ServerPublishIssue[] } | undefined
        setServerIssues(issuesFromServer(details?.issues ?? []))
      } else {
        setFailure(error instanceof ApiError ? error.message : t("flows.publish.failed"))
      }
    } finally {
      setBusy(false)
    }
  }

  const goTo = (issue: FlowIssue) => {
    if (!issue.nodeId) return
    onClose()
    focusBlock(issue.nodeId)
  }

  return (
    <ResponsiveDialog
      open
      onOpenChange={(next) => {
        if (!next && !busy) onClose()
      }}
      title={t("flows.publish.title", { name: flow.name })}
      description={
        flow.publishedVersion
          ? t("flows.publish.descriptionUpdate", { version: flow.publishedVersion.versionNumber })
          : t("flows.publish.descriptionFirst")
      }
      size="md"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            {t("flows.publish.cancel")}
          </Button>
          <Button type="button" onClick={() => void publish()} disabled={busy || errors.length > 0}>
            {busy ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Rocket />}
            {t("flows.publish.confirm")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {triggerType ? (
          <p className="text-sm text-pretty">
            {t("flows.publish.starts")}{" "}
            <span className="font-medium">{t(`flows.blocks.${triggerType}.label`)}</span>
          </p>
        ) : null}

        {issues.length === 0 ? (
          <p className="flex items-center gap-2 rounded-lg bg-status-success-soft px-3 py-2.5 text-sm text-status-success">
            <CheckCircle2 className="size-4 shrink-0" aria-hidden />
            {t("flows.publish.allGood")}
          </p>
        ) : null}

        <IssueList
          title={t("flows.publish.errorsTitle", { count: errors.length })}
          issues={errors}
          tone="error"
          onPick={goTo}
        />
        <IssueList
          title={t("flows.publish.warningsTitle", { count: warnings.length })}
          issues={warnings}
          tone="warning"
          onPick={goTo}
        />

        {failure ? (
          <p role="alert" className="rounded-lg bg-status-danger-soft px-3 py-2 text-sm text-status-danger">
            {failure}
          </p>
        ) : null}
      </div>
    </ResponsiveDialog>
  )
}

function IssueList({
  title,
  issues,
  tone,
  onPick,
}: {
  title: string
  issues: FlowIssue[]
  tone: "error" | "warning"
  onPick: (issue: FlowIssue) => void
}) {
  const { t } = useTranslation()
  const nodes = useEditorApi().getState().nodes
  // Nomes dos blocos só para o texto da linha; não precisa seguir o quadro em tempo real.
  const names = useEditorUi(useShallow(() => nodes.map((node) => node.id)))
  void names

  if (issues.length === 0) return null
  const Icon = tone === "error" ? CircleAlert : AlertTriangle

  return (
    <section className="flex flex-col gap-1.5">
      <h3 className={cn("text-sm font-medium", tone === "error" ? "text-status-danger" : "text-status-warning")}>{title}</h3>
      <ul className="flex flex-col gap-1">
        {issues.map((issue) => {
          const node = nodes.find((item) => item.id === issue.nodeId)
          const blockName =
            (typeof node?.data.label === "string" && node.data.label.trim()) ||
            (node ? t(`flows.blocks.${node.type}.label`, { defaultValue: node.type ?? "" }) : "")
          const message = t(issue.messageKey, issue.params)
          const content = (
            <>
              <Icon
                className={cn("mt-0.5 size-4 shrink-0", tone === "error" ? "text-status-danger" : "text-status-warning")}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                {blockName ? <span className="block truncate text-sm font-medium">{blockName}</span> : null}
                <span className="block text-sm text-pretty text-muted-foreground">{message}</span>
              </span>
              {issue.nodeId ? <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden /> : null}
            </>
          )
          return (
            <li key={issue.id}>
              {issue.nodeId ? (
                <button
                  type="button"
                  onClick={() => onPick(issue)}
                  className="flex w-full items-start gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  {content}
                </button>
              ) : (
                <div className="flex items-start gap-2.5 rounded-lg border px-3 py-2">{content}</div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
