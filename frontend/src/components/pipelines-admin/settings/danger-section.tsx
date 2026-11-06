import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router"
import { Archive, ArchiveRestore, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { SettingsSection, useConfirm } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useBoardMutations } from "@/hooks/pipelines-admin/use-board"
import { adminErrorMessage } from "@/lib/pipelines-admin/error-message"
import type { Board } from "@/lib/pipelines-admin/types"

/** Tirar o quadro de cena, com volta, ou de vez. */
export function DangerSection({ board }: { board: Board }) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const { archiveBoard, deleteBoard } = useBoardMutations(board.id)

  const cards = board.stages.reduce((total, stage) => total + stage.cards.length, 0)

  async function toggleArchive() {
    // Voltar não tem nada a perder: faz na hora, como o recado do topo da tela.
    if (board.archived) {
      try {
        await archiveBoard(true)
        toast.success(t("pipelinesAdmin.settings.danger.unarchived", { name: board.name }))
      } catch (cause) {
        toast.error(adminErrorMessage(t, cause))
      }
      return
    }

    const confirmed = await confirm({
      title: t("pipelinesAdmin.settings.danger.archiveTitle", { name: board.name }),
      description: t("pipelinesAdmin.settings.danger.archiveDescription"),
      confirmLabel: t("pipelinesAdmin.settings.danger.archive"),
      onConfirm: () => archiveBoard(false),
    })
    if (confirmed) toast.success(t("pipelinesAdmin.settings.danger.archived", { name: board.name }))
  }

  async function remove() {
    const confirmed = await confirm({
      title: t("pipelinesAdmin.settings.danger.deleteTitle", { name: board.name }),
      description: t("pipelinesAdmin.settings.danger.deleteDescription", {
        stages: t("pipelinesAdmin.settings.danger.stagesCount", { count: board.stages.length }),
        cards: t("pipelinesAdmin.settings.danger.cardsCount", { count: cards }),
      }),
      confirmLabel: t("pipelinesAdmin.settings.danger.delete"),
      destructive: true,
      requireText: t("pipelinesAdmin.settings.danger.deleteWord"),
      onConfirm: deleteBoard,
    })
    if (confirmed) {
      toast.success(t("pipelinesAdmin.settings.danger.deleted", { name: board.name }))
      navigate("/pipelines", { replace: true })
    }
  }

  return (
    <SettingsSection
      title={t("pipelinesAdmin.settings.danger.title")}
      description={t("pipelinesAdmin.settings.danger.description")}
    >
      <div className="flex flex-col divide-y rounded-lg ring-1 ring-foreground/10">
        <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-medium">
              {board.archived
                ? t("pipelinesAdmin.settings.danger.unarchive")
                : t("pipelinesAdmin.settings.danger.archive")}
            </p>
            <p className="text-xs text-pretty text-muted-foreground">
              {board.archived
                ? t("pipelinesAdmin.settings.danger.unarchiveHint")
                : t("pipelinesAdmin.settings.danger.archiveHint")}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="shrink-0 pointer-coarse:h-10"
            onClick={() => void toggleArchive()}
          >
            {board.archived ? <ArchiveRestore /> : <Archive />}
            {board.archived
              ? t("pipelinesAdmin.settings.danger.unarchive")
              : t("pipelinesAdmin.settings.danger.archive")}
          </Button>
        </div>

        {/* Apagar levaria junto cards que quem está restrito não enxerga: o servidor recusa. */}
        {board.viewerCanViewAllCards ? (
          <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-medium">{t("pipelinesAdmin.settings.danger.delete")}</p>
              <p className="text-xs text-pretty text-muted-foreground">
                {t("pipelinesAdmin.settings.danger.deleteHint")}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="shrink-0 text-destructive hover:text-destructive pointer-coarse:h-10"
              onClick={() => void remove()}
            >
              <Trash2 />
              {t("pipelinesAdmin.settings.danger.delete")}
            </Button>
          </div>
        ) : null}
      </div>
    </SettingsSection>
  )
}
