import { useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { useTranslation } from "react-i18next"
import { useNavigate } from "@/lib/router"
import { Archive, ArchiveRestore, ExternalLink, RotateCcw, ThumbsDown, Trash2, Trophy } from "lucide-react"
import { toast } from "sonner"

import {
  DataTable,
  FilterBar,
  Money,
  RelativeTime,
  SegmentedControl,
  StatusBadge,
  TableSkeleton,
  UserAvatar,
  useConfirm,
  type RowAction,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { BoardFrame } from "@/components/pipelines-admin/board-frame"
import { StageDot } from "@/components/pipelines-admin/settings/stages-section"
import {
  useArchivedCardMutations,
  useArchivedCards,
} from "@/hooks/pipelines-admin/use-archived-cards"
import { apiAssetUrl } from "@/lib/api"
import { adminErrorMessage } from "@/lib/pipelines-admin/error-message"
import type { ArchivedCard, ArchivedStatus, Board } from "@/lib/pipelines-admin/types"

const PER_PAGE = 25

export default function ArchivedPage() {
  const { t } = useTranslation()

  return (
    <BoardFrame
      area="archived"
      skeleton={
        <div className="flex flex-col gap-4" aria-hidden>
          <Skeleton className="h-10 w-full max-w-xl" />
          <TableSkeleton rows={8} columns={5} />
        </div>
      }
      header={() => ({ description: t("pipelinesAdmin.archived.description") })}
    >
      {(board) => <ArchivedContent board={board} />}
    </BoardFrame>
  )
}

function statusOf(card: ArchivedCard): "won" | "lost" | "archived" {
  if (card.wonAt) return "won"
  if (card.lostAt) return "lost"
  return "archived"
}

function ArchivedContent({ board }: { board: Board }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const confirm = useConfirm()

  const [status, setStatus] = useState<ArchivedStatus>("all")
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(PER_PAGE)

  const { cards, meta, error, isLoading, isValidating, reload } = useArchivedCards(board.id, {
    status,
    search: query,
    page,
    perPage,
  })
  const { restoreCard, restoreCards, reopenCard, deleteCard, deleteCards } =
    useArchivedCardMutations(board.id)

  const isCrm = board.boardType === "crm"
  const isFiltered = Boolean(query) || status !== "all"

  function clearFilters() {
    setQuery("")
    setStatus("all")
    setPage(1)
  }

  const openCard = (card: ArchivedCard) => navigate(`/pipelines/${board.id}/board?card=${card.id}`)

  async function restore(card: ArchivedCard) {
    try {
      await restoreCard(card.id)
      toast.success(t("pipelinesAdmin.archived.restored", { title: card.title }), {
        action: {
          label: t("pipelinesAdmin.archived.seeOnBoard"),
          onClick: () => openCard(card),
        },
      })
    } catch (cause) {
      toast.error(adminErrorMessage(t, cause))
    }
  }

  async function reopen(card: ArchivedCard) {
    const confirmed = await confirm({
      title: t("pipelinesAdmin.archived.reopen.title", { title: card.title }),
      description: t("pipelinesAdmin.archived.reopen.description"),
      confirmLabel: t("pipelinesAdmin.archived.reopen.confirm"),
      onConfirm: () => reopenCard(card.id),
    })
    if (confirmed) toast.success(t("pipelinesAdmin.archived.reopen.done", { title: card.title }))
  }

  async function remove(card: ArchivedCard) {
    const confirmed = await confirm({
      title: t("pipelinesAdmin.archived.delete.title", { title: card.title }),
      description: t("pipelinesAdmin.archived.delete.description"),
      confirmLabel: t("pipelinesAdmin.archived.delete.confirm"),
      destructive: true,
      onConfirm: () => deleteCard(card.id),
    })
    if (confirmed) toast.success(t("pipelinesAdmin.archived.delete.done", { title: card.title }))
  }

  async function restoreMany(ids: string[], clear: () => void) {
    try {
      await restoreCards(ids)
      clear()
      toast.success(t("pipelinesAdmin.archived.bulk.restored", { count: ids.length }))
    } catch (cause) {
      toast.error(adminErrorMessage(t, cause))
    }
  }

  async function removeMany(ids: string[], clear: () => void) {
    const confirmed = await confirm({
      title: t("pipelinesAdmin.archived.bulk.deleteTitle", { count: ids.length }),
      description: t("pipelinesAdmin.archived.delete.description"),
      confirmLabel: t("pipelinesAdmin.archived.delete.confirm"),
      destructive: true,
      onConfirm: async () => {
        const failed = await deleteCards(ids)
        clear()
        if (failed > 0) toast.error(t("pipelinesAdmin.archived.bulk.deleteFailed", { count: failed }))
        else toast.success(t("pipelinesAdmin.archived.bulk.deleted", { count: ids.length }))
      },
    })
    return confirmed
  }

  const columns = useMemo<ColumnDef<ArchivedCard, unknown>[]>(
    () => [
      {
        accessorKey: "title",
        header: t("pipelinesAdmin.archived.columns.title"),
        enableSorting: false,
        meta: {
          label: t("pipelinesAdmin.archived.columns.title"),
          mobile: "primary",
          className: "min-w-56 whitespace-normal",
        },
        cell: ({ row }) => {
          const card = row.original
          return (
            <div className="flex min-w-0 items-center gap-2">
              {card.colorLabel ? (
                <span aria-hidden className="h-6 w-1 shrink-0 rounded-full" style={{ backgroundColor: card.colorLabel }} />
              ) : null}
              <div className="min-w-0">
                <p className="truncate font-medium">{card.title}</p>
                {card.companyName && card.companyName !== card.title ? (
                  <p className="truncate text-xs text-muted-foreground">{card.companyName}</p>
                ) : null}
              </div>
            </div>
          )
        },
      },
      {
        id: "stage",
        accessorKey: "stageName",
        header: t("pipelinesAdmin.archived.columns.stage"),
        enableSorting: false,
        meta: { label: t("pipelinesAdmin.archived.columns.stage") },
        cell: ({ row }) =>
          row.original.stageName ? (
            <span className="inline-flex items-center gap-2 text-sm">
              <StageDot color={row.original.stageColor} />
              {row.original.stageName}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: "status",
        header: t("pipelinesAdmin.archived.columns.status"),
        enableSorting: false,
        meta: { label: t("pipelinesAdmin.archived.columns.status"), mobile: "secondary" },
        cell: ({ row }) => {
          const value = statusOf(row.original)
          return (
            <div className="flex flex-col items-start gap-0.5">
              {value === "won" ? (
                <StatusBadge tone="success" icon={<Trophy />}>
                  {t("pipelinesAdmin.archived.status.won")}
                </StatusBadge>
              ) : value === "lost" ? (
                <StatusBadge tone="danger" icon={<ThumbsDown />}>
                  {t("pipelinesAdmin.archived.status.lost")}
                </StatusBadge>
              ) : (
                <StatusBadge tone="neutral" icon={<Archive />}>
                  {t("pipelinesAdmin.archived.status.archived")}
                </StatusBadge>
              )}
              {row.original.lostReason ? (
                <span className="max-w-48 truncate text-xs text-muted-foreground">{row.original.lostReason}</span>
              ) : null}
            </div>
          )
        },
      },
      ...(isCrm
        ? [
            {
              accessorKey: "dealValue",
              header: t("pipelinesAdmin.archived.columns.value"),
              enableSorting: false,
              meta: { label: t("pipelinesAdmin.archived.columns.value"), align: "right" as const },
              cell: ({ row }: { row: { original: ArchivedCard } }) =>
                row.original.dealValue ? (
                  <Money value={row.original.dealValue} />
                ) : (
                  <span className="text-muted-foreground">—</span>
                ),
            } satisfies ColumnDef<ArchivedCard, unknown>,
          ]
        : []),
      {
        id: "assignedTo",
        header: t("pipelinesAdmin.archived.columns.assignedTo"),
        enableSorting: false,
        meta: { label: t("pipelinesAdmin.archived.columns.assignedTo") },
        cell: ({ row }) =>
          row.original.assignedTo?.name ? (
            <span className="inline-flex min-w-0 items-center gap-2 text-sm">
              <UserAvatar
                name={row.original.assignedTo.name}
                src={row.original.assignedTo.avatarUrl ? apiAssetUrl(row.original.assignedTo.avatarUrl) : undefined}
                size="sm"
              />
              <span className="truncate">{row.original.assignedTo.name}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: "date",
        header: t("pipelinesAdmin.archived.columns.date"),
        enableSorting: false,
        meta: { label: t("pipelinesAdmin.archived.columns.date") },
        cell: ({ row }) => (
          <RelativeTime
            value={row.original.wonAt ?? row.original.lostAt ?? row.original.updatedAt}
            className="text-sm text-muted-foreground"
          />
        ),
      },
    ],
    [isCrm, t]
  )

  const rowActions = (card: ArchivedCard): RowAction[] => [
    {
      label: t("pipelinesAdmin.archived.open"),
      icon: <ExternalLink />,
      onSelect: () => openCard(card),
    },
    {
      label: t("pipelinesAdmin.archived.restore"),
      icon: <ArchiveRestore />,
      hidden: !card.archived,
      onSelect: () => void restore(card),
    },
    {
      label: t("pipelinesAdmin.archived.reopen.action"),
      icon: <RotateCcw />,
      hidden: !card.wonAt && !card.lostAt,
      onSelect: () => void reopen(card),
    },
    {
      label: t("pipelinesAdmin.archived.delete.action"),
      icon: <Trash2 />,
      destructive: true,
      separatorBefore: true,
      onSelect: () => void remove(card),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <FilterBar
        search={{
          value: query,
          onChange: (value) => {
            setQuery(value)
            setPage(1)
          },
          loading: isValidating && Boolean(query),
          placeholder: t("pipelinesAdmin.archived.search"),
        }}
        activeCount={status === "all" ? 0 : 1}
        onClear={clearFilters}
        resultLabel={meta ? t("pipelinesAdmin.archived.count", { count: meta.total }) : undefined}
        actions={
          isCrm ? (
            <SegmentedControl<ArchivedStatus>
              aria-label={t("pipelinesAdmin.archived.filterStatus")}
              value={status}
              onChange={(value) => {
                setStatus(value)
                setPage(1)
              }}
              options={[
                { value: "all", label: t("pipelinesAdmin.archived.filters.all") },
                { value: "archived", label: t("pipelinesAdmin.archived.filters.archived") },
                { value: "won", label: t("pipelinesAdmin.archived.filters.won") },
                { value: "lost", label: t("pipelinesAdmin.archived.filters.lost") },
              ]}
            />
          ) : undefined
        }
      />

      <DataTable
        aria-label={t("pipelinesAdmin.archived.tableLabel")}
        columns={columns}
        data={cards ?? []}
        meta={meta}
        isLoading={isLoading}
        isFetching={isValidating}
        error={error}
        onRetry={() => void reload()}
        onPageChange={setPage}
        onPerPageChange={(value) => {
          setPerPage(value)
          setPage(1)
        }}
        isFiltered={isFiltered}
        onClearFilters={clearFilters}
        empty={{
          icon: <Archive className="size-5" />,
          title: t("pipelinesAdmin.archived.empty.title"),
          description: t("pipelinesAdmin.archived.empty.description"),
        }}
        selectable
        getRowId={(card) => card.id}
        rowActions={rowActions}
        onRowClick={openCard}
        bulkLabel={(amount) => t("pipelines.bulk.selected", amount)}
        bulkActions={({ ids, clear }) => (
          <>
            <Button variant="ghost" size="sm" onClick={() => void restoreMany(ids, clear)}>
              <ArchiveRestore />
              {t("pipelinesAdmin.archived.restore")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void removeMany(ids, clear)}>
              <Trash2 />
              {t("pipelinesAdmin.archived.delete.action")}
            </Button>
          </>
        )}
      />
    </div>
  )
}
