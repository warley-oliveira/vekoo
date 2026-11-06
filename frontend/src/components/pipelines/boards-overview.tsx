import { useMemo, useState } from "react"
import { Link } from "react-router"
import { useTranslation } from "react-i18next"
import { Archive, ArchiveRestore, Pencil, Plus, SquareKanban } from "lucide-react"
import { toast } from "sonner"

import {
  ActionsMenu,
  CardGridSkeleton,
  EmptyState,
  ErrorState,
  PageBody,
  PageHeader,
  SearchInput,
  SegmentedControl,
  StatusBadge,
  useConfirm,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useBoardMutations, useBoards } from "@/hooks/pipelines/use-boards"
import { boardIcon } from "@/lib/pipelines/board-icons"
import { pipelineErrorText } from "@/lib/pipelines/errors"
import { boardViewUrl } from "@/lib/pipelines/paths"
import type { Board } from "@/lib/pipelines/types"
import { matchesSearch } from "@/lib/search-text"
import { BoardCreateDialog } from "./board-create-dialog"
import { RenameBoardDialog } from "./board-dialogs"

/** A partir daqui a lista ganha busca: até lá, ela cabe de uma vez na tela. */
const SEARCH_THRESHOLD = 6

function BoardTile({
  board,
  onRename,
}: {
  board: Board
  onRename: (board: Board) => void
}) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const { archiveBoard } = useBoardMutations()
  const Icon = boardIcon(board.icon)

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
    if (confirmed) toast.success(t("pipelines.boards.archived"))
  }

  return (
    <li className="group/tile relative flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/8 transition-shadow hover:shadow-sm hover:ring-foreground/15">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
          style={board.color ? { color: board.color } : undefined}
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-heading text-base font-semibold tracking-tight">
            <Link
              to={boardViewUrl(board.id)}
              className="outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
            >
              {board.name}
            </Link>
          </h3>
          {board.description ? (
            <p className="mt-0.5 line-clamp-2 text-sm text-pretty text-muted-foreground">
              {board.description}
            </p>
          ) : null}
        </div>
        <ActionsMenu
          className="relative z-10 shrink-0"
          label={t("pipelines.boards.actionsOf", { name: board.name })}
          actions={[
            {
              label: t("pipelines.boards.rename"),
              icon: <Pencil />,
              onSelect: () => onRename(board),
            },
            {
              label: board.archived ? t("pipelines.boards.restore") : t("pipelines.boards.archive"),
              icon: board.archived ? <ArchiveRestore /> : <Archive />,
              destructive: !board.archived,
              separatorBefore: true,
              onSelect: () => void toggleArchive(),
            },
          ]}
        />
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums">
        <span>{t("pipelines.boards.stagesCount", { count: board.stagesCount ?? 0 })}</span>
        <span>{t("pipelines.boards.cardsCount", { count: board.cardsCount ?? 0 })}</span>
        {board.boardType === "crm" ? (
          <StatusBadge tone="accent" dot={false}>
            {t("pipelines.boards.typeCrmShort")}
          </StatusBadge>
        ) : null}
        {board.archived ? (
          <StatusBadge tone="warning" dot={false}>
            {t("pipelines.boards.archivedBadge")}
          </StatusBadge>
        ) : null}
      </div>
    </li>
  )
}

type Tab = "active" | "archived"

/** Todos os pipelines da organização, os ativos e os arquivados. */
export function BoardsOverview({
  createOpen,
  onCreateOpenChange,
}: {
  createOpen: boolean
  onCreateOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>("active")
  const [query, setQuery] = useState("")
  const [renaming, setRenaming] = useState<Board | null>(null)
  const { boards, error, isLoading, reload } = useBoards(tab === "archived")

  const visible = useMemo(
    () => (query ? boards.filter((board) => matchesSearch(board.name, query)) : boards),
    [boards, query]
  )

  const createButton = (
    <Button type="button" className="pointer-coarse:h-10" onClick={() => onCreateOpenChange(true)}>
      <Plus />
      {t("pipelines.boards.new")}
    </Button>
  )

  return (
    <PageBody variant="wide">
      <PageHeader
        description={t("pipelines.boards.pageDescription")}
        actions={createButton}
        mobilePlacement="inline"
      />

      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl<Tab>
          aria-label={t("pipelines.boards.tabsLabel")}
          value={tab}
          onChange={setTab}
          options={[
            { value: "active", label: t("pipelines.boards.tabActive") },
            { value: "archived", label: t("pipelines.boards.tabArchived") },
          ]}
        />
        {boards.length >= SEARCH_THRESHOLD || query ? (
          <SearchInput
            className="md:w-64"
            value={query}
            debounce={0}
            onChange={setQuery}
            placeholder={t("pipelines.boards.search")}
            aria-label={t("pipelines.boards.search")}
          />
        ) : null}
      </div>

      {isLoading ? (
        <CardGridSkeleton cards={3} />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void reload()} />
      ) : visible.length === 0 ? (
        tab === "archived" ? (
          <EmptyState
            icon={<Archive className="size-5" />}
            title={t("pipelines.boards.emptyArchived")}
            description={t("pipelines.boards.emptyArchivedHint")}
          />
        ) : query ? (
          <EmptyState
            title={t("pipelines.boards.noResults")}
            action={{ label: t("pipelines.boards.clearSearch"), onClick: () => setQuery("") }}
          />
        ) : (
          <EmptyState
            icon={<SquareKanban className="size-5" />}
            title={t("pipelines.boards.emptyTitle")}
            description={t("pipelines.boards.emptyHint")}
            action={{ label: t("pipelines.boards.createFirst"), onClick: () => onCreateOpenChange(true) }}
          />
        )
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((board) => (
            <BoardTile key={board.id} board={board} onRename={setRenaming} />
          ))}
        </ul>
      )}

      <BoardCreateDialog open={createOpen} onOpenChange={onCreateOpenChange} />
      {renaming ? (
        <RenameBoardDialog
          board={renaming}
          open
          onOpenChange={(open) => {
            if (!open) setRenaming(null)
          }}
        />
      ) : null}
    </PageBody>
  )
}
