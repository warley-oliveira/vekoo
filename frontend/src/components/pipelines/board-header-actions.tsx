import { Link, useNavigate } from "react-router"
import { useTranslation } from "react-i18next"
import {
  Archive,
  ArchiveRestore,
  BarChart3,
  Columns3,
  LayoutGrid,
  List,
  MoreHorizontal,
  Pencil,
  Plus,
  Settings2,
  TrendingUp,
} from "lucide-react"
import { toast } from "sonner"

import { SegmentedControl, useConfirm, type SegmentedOption } from "@/components/shared"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useBoardMutations } from "@/hooks/pipelines/use-boards"
import { useIsMobile } from "@/hooks/use-is-mobile"
import { pipelineErrorText } from "@/lib/pipelines/errors"
import { boardViewUrl, type BoardView } from "@/lib/pipelines/paths"
import type { Board } from "@/lib/pipelines/types"

/** Quadro, lista e previsão. A previsão só existe em pipeline de vendas. */
export function BoardViewToggle({
  boardId,
  view,
  isCrm,
  iconsOnly = false,
}: {
  boardId: string
  view: BoardView
  isCrm: boolean
  iconsOnly?: boolean
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const option = (
    value: BoardView,
    icon: React.ReactNode,
    label: string
  ): SegmentedOption<BoardView> =>
    iconsOnly
      ? { value, label: icon, "aria-label": label }
      : { value, icon, label }

  return (
    <SegmentedControl<BoardView>
      aria-label={t("pipelines.views.label")}
      value={view}
      onChange={(next) =>
        navigate({ pathname: boardViewUrl(boardId, next), search: window.location.search })
      }
      options={[
        option("board", <Columns3 />, t("pipelines.views.board")),
        option("list", <List />, t("pipelines.views.list")),
        ...(isCrm ? [option("forecast", <TrendingUp />, t("pipelines.views.forecast"))] : []),
      ]}
    />
  )
}

/** O menu do pipeline. Ajustes, métricas e arquivados são telas à parte, com endereço próprio. */
export function BoardMenu({ board, onRename }: { board: Board; onRename: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const { archiveBoard } = useBoardMutations()

  async function toggleArchive() {
    if (board.archived) {
      try {
        await archiveBoard(board.id, true)
        toast.success(t("pipelines.boards.restored"))
      } catch (error) {
        toast.error(pipelineErrorText(t, error, "pipelines.errors.saveFailed"))
      }
      return
    }

    const confirmed = await confirm({
      title: t("pipelines.boards.archiveTitle", { name: board.name }),
      description: t("pipelines.boards.archiveHint"),
      confirmLabel: t("pipelines.boards.archive"),
      destructive: true,
      onConfirm: () => archiveBoard(board.id),
    })
    if (confirmed) {
      toast.success(t("pipelines.boards.archived"))
      navigate("/pipelines?all=1")
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted-foreground pointer-coarse:size-10"
            aria-label={t("pipelines.boards.menu")}
          />
        }
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={onRename}>
          <Pencil />
          {t("pipelines.boards.rename")}
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link to={`/pipelines/${board.id}/settings`} />}>
          <Settings2 />
          {t("pipelines.boards.settings")}
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link to={`/pipelines/${board.id}/metrics`} />}>
          <BarChart3 />
          {t("pipelines.boards.metrics")}
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link to={`/pipelines/${board.id}/archived`} />}>
          <Archive />
          {t("pipelines.boards.archivedCards")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link to="/pipelines?all=1" />}>
          <LayoutGrid />
          {t("pipelines.boards.all")}
        </DropdownMenuItem>
        <DropdownMenuItem
          variant={board.archived ? "default" : "destructive"}
          onClick={() => void toggleArchive()}
        >
          {board.archived ? <ArchiveRestore /> : <Archive />}
          {board.archived ? t("pipelines.boards.restore") : t("pipelines.boards.archive")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** O que vai na barra superior. No celular, a troca de visão desce para a linha de filtros. */
export function BoardHeaderActions({
  board,
  view,
  onCreateCard,
  onRename,
}: {
  board: Board
  view: BoardView
  onCreateCard: () => void
  onRename: () => void
}) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()

  return (
    <>
      {isMobile ? null : (
        <BoardViewToggle boardId={board.id} view={view} isCrm={board.boardType === "crm"} />
      )}
      <Button
        type="button"
        className="pointer-coarse:h-10"
        aria-label={isMobile ? t("pipelines.card.new") : undefined}
        onClick={onCreateCard}
      >
        <Plus />
        {isMobile ? null : t("pipelines.card.new")}
      </Button>
      <BoardMenu board={board} onRename={onRename} />
    </>
  )
}
