import { memo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Archive, ArrowLeft, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { EmptyState, useConfirm } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useCopilotArchives } from "@/lib/chat-details/copilot-store"
import type { CopilotArchive } from "@/lib/chat-details/copilot-types"
import { formatDateTime } from "@/lib/date-format"
import { useLanguage } from "@/lib/i18n"
import { MessageTimeline } from "./copilot-messages"

const NO_ARCHIVES: CopilotArchive[] = []

function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="-ml-1 w-fit shrink-0 text-muted-foreground pointer-coarse:h-10"
      onClick={onClick}
    >
      <ArrowLeft />
      {label}
    </Button>
  )
}

/**
 * As conversas guardadas. Moram neste navegador: no servidor o histórico é um por pessoa, e começar
 * de novo o limpa, porque é ele o contexto do modelo.
 */
export const CopilotArchives = memo(function CopilotArchives({
  accountId,
  onBack,
}: {
  accountId: string
  onBack: () => void
}) {
  const { t } = useTranslation()
  const language = useLanguage()
  const confirm = useConfirm()
  const archives = useCopilotArchives((state) => state.byAccount[accountId] ?? NO_ARCHIVES)
  const remove = useCopilotArchives((state) => state.remove)
  const [openId, setOpenId] = useState<string | null>(null)

  const open = archives.find((archive) => archive.id === openId)

  if (open) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-1.5">
          <BackButton label={t("chatDetails.copilot.archive.backToList")} onClick={() => setOpenId(null)} />
          <span className="truncate text-xs text-muted-foreground">
            {formatDateTime(open.archivedAt, language)}
          </span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 pb-4">
          <MessageTimeline messages={open.messages} />
        </div>
      </div>
    )
  }

  const deleteArchive = async (archive: CopilotArchive) => {
    const confirmed = await confirm({
      title: t("chatDetails.copilot.archive.deleteTitle"),
      description: t("chatDetails.copilot.archive.deleteHint"),
      confirmLabel: t("chatDetails.copilot.archive.deleteConfirm"),
      destructive: true,
    })
    if (confirmed) {
      remove(accountId, archive.id)
      toast.success(t("chatDetails.copilot.archive.deleted"))
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-3 py-1.5">
        <BackButton label={t("chatDetails.copilot.archive.backToChat")} onClick={onBack} />
      </div>

      {archives.length === 0 ? (
        <EmptyState
          icon={<Archive className="size-5" />}
          title={t("chatDetails.copilot.archive.empty")}
          description={t("chatDetails.copilot.archive.emptyHint")}
          className="m-4 border-0 p-6"
        />
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3">
          {archives.map((archive) => (
            <li key={archive.id} className="group/archive flex items-center gap-1">
              <button
                type="button"
                onClick={() => setOpenId(archive.id)}
                className="flex min-h-12 min-w-0 flex-1 flex-col justify-center rounded-md px-2 py-1.5 text-left outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span className="truncate text-sm">{archive.preview}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {t("chatDetails.copilot.archive.meta", {
                    count: archive.messages.length,
                    date: formatDateTime(archive.archivedAt, language),
                  })}
                </span>
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t("chatDetails.copilot.archive.delete", { name: archive.preview })}
                className="shrink-0 text-muted-foreground opacity-0 group-hover/archive:opacity-100 focus-visible:opacity-100 pointer-coarse:size-10 pointer-coarse:opacity-100"
                onClick={() => void deleteArchive(archive)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
})
