import { useTranslation } from "react-i18next"
import { useParams } from "@/lib/router"

import { FlowEditor } from "@/components/flows/editor/flow-editor"
import { EmptyState, ErrorState, PageBody, PageHeader } from "@/components/shared"
import { Skeleton } from "@/components/ui/skeleton"
import { useFlow } from "@/hooks/flows/use-flows"
import { useFullBleed } from "@/hooks/use-app-shell"
import { ApiError } from "@/lib/api"

// O editor entra aqui: o quadro e o Monaco moram neste chunk (e no seguinte), fora das outras telas.

export default function FlowEditorPage() {
  const { t } = useTranslation()
  const { flowId } = useParams()
  const { flow, error, isLoading, reload } = useFlow(flowId)
  useFullBleed(true)

  if (error && !flow) {
    const notFound = error instanceof ApiError && error.status === 404
    return (
      <PageBody>
        <PageHeader backTo="/flows" title={t("navigation.routes.flow")} />
        {notFound ? (
          <EmptyState title={t("flows.editor.notFound")} description={t("flows.editor.notFoundHint")} />
        ) : (
          <ErrorState error={error} onRetry={() => void reload()} />
        )}
      </PageBody>
    )
  }

  if (!flow || isLoading) return <EditorSkeleton />

  return <FlowEditor key={flow.id} flow={flow} reload={reload} />
}

/** O desenho do quadro: dois blocos e o que vem em volta, em vez de um giro solto no meio da tela. */
function EditorSkeleton() {
  const { t } = useTranslation()
  return (
    <div className="relative h-full overflow-hidden bg-muted/30" role="status" aria-label={t("flows.editor.loading")}>
      <div className="absolute top-1/3 left-[18%] flex w-66 gap-2.5 rounded-xl border bg-card p-3">
        <Skeleton className="size-7 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-2/3" />
          <Skeleton className="h-3 w-full" />
        </div>
      </div>
      <div className="absolute top-1/2 left-[48%] flex w-66 gap-2.5 rounded-xl border bg-card p-3">
        <Skeleton className="size-7 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-1/2" />
          <Skeleton className="h-3 w-5/6" />
        </div>
      </div>
      <Skeleton className="absolute bottom-4 left-4 h-10 w-115 max-w-[calc(100%-2rem)] rounded-xl" />
    </div>
  )
}
