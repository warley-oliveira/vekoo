import { useState } from "react"
import { useTranslation } from "react-i18next"
import { RotateCcw } from "lucide-react"
import { toast } from "sonner"

import { ErrorState, ListSkeleton, RelativeTime, ResponsiveDialog, StatusBadge, useConfirm } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useFlowVersions } from "@/hooks/flows/use-flows"
import { apiGet } from "@/lib/api"
import { prepareDefinition } from "@/lib/flows/fields"
import type { FlowVersion, FlowVersionSummary } from "@/lib/flows/types"

import { useFlowContext } from "./flow-context"
import { useEditorApi } from "./store"
import { useEditorUi } from "./ui-store"

// As versões do fluxo. Publicar congela o rascunho e abre o próximo, e cada publicação fica aqui. Restaurar traz
// aquela versão para o rascunho: nada vai para o ar sem publicar, e dá para desfazer como qualquer alteração.

export function VersionsPanel() {
  const { t } = useTranslation()
  const open = useEditorUi((state) => state.dialog === "versions")
  const setDialog = useEditorUi((state) => state.setDialog)
  const { flow } = useFlowContext()
  const { versions, isLoading, error, reload } = useFlowVersions(flow.id, open)

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => setDialog(next ? "versions" : null)}
      title={t("flows.versions.title")}
      description={t("flows.versions.description")}
      size="md"
    >
      {error ? (
        <ErrorState error={error} onRetry={() => void reload()} />
      ) : isLoading ? (
        <ListSkeleton rows={4} />
      ) : (
        <ul className="flex flex-col gap-2">
          {versions.map((version) => (
            <VersionRow key={version.id} version={version} />
          ))}
        </ul>
      )}
    </ResponsiveDialog>
  )
}

function VersionRow({ version }: { version: FlowVersionSummary }) {
  const { t } = useTranslation()
  const api = useEditorApi()
  const confirm = useConfirm()
  const { flow } = useFlowContext()
  const setDialog = useEditorUi((state) => state.setDialog)
  const [busy, setBusy] = useState(false)

  const isDraft = !version.publishedAt
  const isLive = flow.publishedVersion?.id === version.id && flow.status === "published"

  const restore = async () => {
    const confirmed = await confirm({
      title: t("flows.versions.restoreTitle", { number: version.versionNumber }),
      description: t("flows.versions.restoreDescription"),
      confirmLabel: t("flows.versions.restore"),
    })
    if (!confirmed) return
    setBusy(true)
    try {
      const { version: full } = await apiGet<{ version: FlowVersion }>(`/flows/${flow.id}/versions/${version.id}`)
      api.getState().replaceDefinition(prepareDefinition(full.definition), { track: true })
      setDialog(null)
      toast.success(t("flows.versions.restored", { number: version.versionNumber }), {
        action: { label: t("flows.toolbar.undo"), onClick: () => api.getState().undo() },
      })
    } catch {
      toast.error(t("flows.versions.restoreFailed"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-medium">
          {t("flows.versions.number", { number: version.versionNumber })}
          {isDraft ? <StatusBadge tone="neutral">{t("flows.versions.draft")}</StatusBadge> : null}
          {isLive ? <StatusBadge tone="success">{t("flows.versions.live")}</StatusBadge> : null}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {isDraft ? t("flows.versions.savedAt") : t("flows.versions.publishedAt")}{" "}
          <RelativeTime value={version.publishedAt ?? version.updatedAt} />
        </p>
      </div>
      {!isDraft ? (
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void restore()}>
          <RotateCcw />
          {t("flows.versions.restore")}
        </Button>
      ) : null}
    </li>
  )
}
