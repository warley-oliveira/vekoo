import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "@/lib/router"
import {
  AlertTriangle,
  Check,
  CloudOff,
  Copy,
  Database,
  History,
  ListChecks,
  Loader2,
  Pause,
  Pencil,
  Play,
  Power,
  Rocket,
  ScrollText,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

import { ActionsMenu, StatusBadge, useConfirm, type RowAction } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { flowKey, useFlowMutations } from "@/hooks/flows/use-flows"
import { STATUS_TONES } from "@/components/flows/flow-status"

import { useEditorUi } from "./ui-store"
import { useSWRConfig } from "swr"

// O que o editor põe na barra superior: situação, salvamento e as ações do fluxo. O elemento monta dentro do
// cabeçalho, fora da árvore do editor; por isso só lê stores globais e o que recebe por prop.

function SaveIndicator() {
  const { t } = useTranslation()
  const status = useEditorUi((state) => state.saveStatus)
  const flush = useEditorUi((state) => state.flush)

  return (
    <span aria-live="polite" className="inline-flex items-center gap-1.5 px-1 text-xs text-muted-foreground md:px-0">
      {status === "saving" ? (
        <>
          <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
          <span className="max-md:sr-only">{t("flows.save.saving")}</span>
        </>
      ) : status === "dirty" ? (
        <>
          <Pencil className="size-3.5" aria-hidden />
          <span className="max-md:sr-only">{t("flows.save.dirty")}</span>
        </>
      ) : status === "error" ? (
        <button
          type="button"
          onClick={() => void flush()}
          className="inline-flex items-center gap-1.5 rounded text-status-danger underline-offset-2 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none pointer-coarse:min-h-10 pointer-coarse:min-w-10 pointer-coarse:justify-center"
        >
          <CloudOff className="size-3.5" aria-hidden />
          <span className="max-md:sr-only">{t("flows.save.failed")}</span>
        </button>
      ) : status === "conflict" ? (
        <span className="inline-flex items-center gap-1.5 text-status-warning">
          <AlertTriangle className="size-3.5" aria-hidden />
          <span className="max-md:sr-only">{t("flows.save.conflict")}</span>
        </span>
      ) : (
        <>
          <Check className="size-3.5" aria-hidden />
          <span className="max-md:sr-only">{t("flows.save.saved")}</span>
        </>
      )}
    </span>
  )
}

export function HeaderActions({
  flowId,
  flowName,
  status,
  published,
  triggerType,
  draftVersion,
  publishedVersion,
  compact,
}: {
  flowId: string
  flowName: string
  status: "draft" | "published" | "archived"
  published: boolean
  triggerType: string
  draftVersion?: number
  publishedVersion?: number
  compact: boolean
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const { mutate } = useSWRConfig()
  const { archiveFlow, unarchiveFlow, deleteFlow, duplicateFlow } = useFlowMutations()
  const setDialog = useEditorUi((state) => state.setDialog)
  const testOpen = useEditorUi((state) => state.testOpen)
  const setTestOpen = useEditorUi((state) => state.setTestOpen)
  const unpublished = useEditorUi((state) => state.unpublished)
  const errors = useEditorUi((state) => state.issues.filter((issue) => issue.severity === "error").length)

  const refresh = () => mutate(flowKey(flowId))

  const toggleOn = async () => {
    if (status === "archived") {
      const updated = await unarchiveFlow(flowId)
      await refresh()
      toast.success(updated.status === "published" ? t("flows.toggle.turnedOn", { name: flowName }) : t("flows.list.restored"))
      return
    }
    const confirmed = await confirm({
      title: t("flows.toggle.confirmTitle", { name: flowName }),
      description: t("flows.toggle.confirmDescription"),
      confirmLabel: t("flows.toggle.confirmAction"),
      destructive: true,
      onConfirm: async () => {
        await archiveFlow(flowId)
        await refresh()
      },
    })
    if (confirmed) toast.success(t("flows.toggle.turnedOff", { name: flowName }))
  }

  const actions = useMemo<RowAction[]>(
    () => [
      { label: t("flows.menu.details"), icon: <Pencil />, onSelect: () => setDialog("details") },
      { label: t("flows.menu.fields"), icon: <Database />, onSelect: () => setDialog("fields") },
      { label: t("flows.menu.basePrompt"), icon: <ScrollText />, onSelect: () => setDialog("basePrompt") },
      { label: t("flows.menu.versions"), icon: <History />, onSelect: () => setDialog("versions") },
      {
        label: t("flows.menu.executions"),
        icon: <ListChecks />,
        onSelect: () => navigate(`/flows/${flowId}/executions`),
      },
      {
        label: t("flows.start.action"),
        icon: <Play />,
        hidden: triggerType !== "manual" || !published,
        onSelect: () => setDialog("start"),
      },
      {
        label: t("flows.menu.duplicate"),
        icon: <Copy />,
        separatorBefore: true,
        onSelect: () => {
          void duplicateFlow(flowId, t("flows.list.copyName", { name: flowName }))
            .then((copy) => {
              toast.success(t("flows.list.duplicated"))
              navigate(`/flows/${copy.id}`)
            })
            .catch(() => toast.error(t("flows.list.actionFailed")))
        },
      },
      {
        label: status === "archived" ? t("flows.toggle.on") : t("flows.toggle.off"),
        icon: status === "archived" ? <Power /> : <Pause />,
        hidden: status === "draft",
        onSelect: () => {
          void toggleOn().catch(() => toast.error(t("flows.list.actionFailed")))
        },
      },
      {
        label: t("flows.menu.delete"),
        icon: <Trash2 />,
        destructive: true,
        separatorBefore: true,
        onSelect: () => {
          void (async () => {
            const confirmed = await confirm({
              title: t("flows.list.deleteTitle", { name: flowName }),
              description: t("flows.list.deleteDescription"),
              confirmLabel: t("flows.list.deleteAction"),
              destructive: true,
              onConfirm: () => deleteFlow(flowId),
            })
            if (confirmed) {
              useEditorUi.setState({ saveStatus: "saved" })
              toast.success(t("flows.list.deleted", { name: flowName }))
              navigate("/flows")
            }
          })()
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [flowId, flowName, published, status, t, triggerType]
  )

  const canPublish = status !== "published" || unpublished
  const versionLine = [
    draftVersion ? t("flows.versions.lineDraft", { number: draftVersion }) : null,
    publishedVersion ? t("flows.versions.linePublished", { number: publishedVersion }) : null,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <div className="flex items-center gap-1.5">
      <SaveIndicator />
      <StatusBadge tone={STATUS_TONES[status]} className="hidden md:inline-flex" title={versionLine}>
        {status === "published" && unpublished ? t("flows.status.publishedChanged") : t(`flows.status.${status}`)}
      </StatusBadge>

      <ActionsMenu label={t("flows.menu.label")} actions={actions} />

      <Button
        type="button"
        variant={testOpen ? "secondary" : "outline"}
        size={compact ? "icon-sm" : "sm"}
        aria-label={t("flows.test.open")}
        aria-pressed={testOpen}
        onClick={() => setTestOpen(!testOpen)}
        className="pointer-coarse:h-10"
      >
        <Play />
        {compact ? null : t("flows.test.open")}
      </Button>

      <Button
        type="button"
        size={compact ? "icon-sm" : "sm"}
        onClick={() => setDialog("publish")}
        disabled={!canPublish}
        aria-label={t("flows.publish.action")}
        title={canPublish ? undefined : t("flows.publish.nothing")}
        className="pointer-coarse:h-10"
      >
        <Rocket />
        {compact ? null : t("flows.publish.action")}
        {errors > 0 && !compact && canPublish ? (
          <span className="ml-0.5 rounded-full bg-primary-foreground/20 px-1.5 text-xs tabular-nums">{errors}</span>
        ) : null}
      </Button>
    </div>
  )
}
