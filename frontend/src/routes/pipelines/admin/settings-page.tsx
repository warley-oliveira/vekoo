import { useCallback, useState } from "react"
import { useTranslation } from "react-i18next"

import { ListSkeleton, UnsavedChangesDialog } from "@/components/shared"
import { Skeleton } from "@/components/ui/skeleton"
import { BoardFrame } from "@/components/pipelines-admin/board-frame"
import { ArchiveSection } from "@/components/pipelines-admin/settings/archive-section"
import { DangerSection } from "@/components/pipelines-admin/settings/danger-section"
import { DealsSection } from "@/components/pipelines-admin/settings/deals-section"
import { IdentitySection } from "@/components/pipelines-admin/settings/identity-section"
import { StagesSection } from "@/components/pipelines-admin/settings/stages-section"
import { VisibilitySection } from "@/components/pipelines-admin/settings/visibility-section"

type DirtyKey = "identity" | "deals" | "visibility" | "archive"

function SettingsSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-hidden>
      <Skeleton className="h-10 w-full max-w-xl" />
      {[0, 1, 2].map((index) => (
        <div key={index} className="grid gap-4 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] md:gap-10">
          <div className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-56" />
          </div>
          <ListSkeleton rows={3} />
        </div>
      ))}
    </div>
  )
}

/** Um salvar por assunto: mudar a cor do quadro não obriga a rever quem vê os cards. */
export default function SettingsPage() {
  const { t } = useTranslation()
  const [dirty, setDirty] = useState<Partial<Record<DirtyKey, boolean>>>({})

  const report = useCallback((key: DirtyKey, value: boolean) => {
    setDirty((current) => (Boolean(current[key]) === value ? current : { ...current, [key]: value }))
  }, [])

  const onIdentityDirty = useCallback((value: boolean) => report("identity", value), [report])
  const onDealsDirty = useCallback((value: boolean) => report("deals", value), [report])
  const onVisibilityDirty = useCallback((value: boolean) => report("visibility", value), [report])
  const onArchiveDirty = useCallback((value: boolean) => report("archive", value), [report])

  return (
    <BoardFrame
      area="settings"
      skeleton={<SettingsSkeleton />}
      header={() => ({ description: t("pipelinesAdmin.settings.pageDescription") })}
    >
      {(board) => (
        <div className="flex flex-col gap-6">
          <UnsavedChangesDialog when={Object.values(dirty).some(Boolean)} />
          <IdentitySection board={board} onDirtyChange={onIdentityDirty} />
          <StagesSection board={board} />
          <DealsSection board={board} onDirtyChange={onDealsDirty} />
          <VisibilitySection board={board} onDirtyChange={onVisibilityDirty} />
          <ArchiveSection board={board} onDirtyChange={onArchiveDirty} />
          <DangerSection board={board} />
        </div>
      )}
    </BoardFrame>
  )
}
