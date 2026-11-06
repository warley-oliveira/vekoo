import { memo, useEffect, useMemo } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { useTranslation } from "react-i18next"
import {
  Archive,
  ArrowRightLeft,
  Check,
  Columns3,
  PanelRightOpen,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react"

import {
  DataTable,
  Money,
  ResponsivePopover,
  StatusBadge,
  TagChip,
  UserAvatar,
  type RowAction,
  type StatusTone,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Separator } from "@/components/ui/separator"
import { useApi } from "@/hooks/use-api"
import type { BoardFiltersApi } from "@/hooks/pipelines/use-board-filters"
import { useBoardUi } from "@/hooks/pipelines/use-board-ui"
import { useCardActions } from "@/hooks/pipelines/use-card-actions"
import { useLocalStorage } from "@/hooks/use-local-storage"
import { apiAssetUrl, type PaginationMeta } from "@/lib/api"
import { formatDate } from "@/lib/date-format"
import { useLanguage } from "@/lib/i18n"
import {
  dealStatusOf,
  isCloseOverdue,
  isOverdue,
  leadScoreOf,
  parseDayKey,
  type LeadScoreConfig,
} from "@/lib/pipelines/card-meta"
import {
  compileFilters,
  type AdvancedFilter,
  type FilterContext,
} from "@/lib/pipelines/filters"
import { cardsPath } from "@/lib/pipelines/paths"
import type {
  BoardDetail,
  Card,
  CardPriority,
  CustomField,
  PresetFilter,
  SavedFilter,
  Stage,
} from "@/lib/pipelines/types"
import { cn } from "@/lib/utils"

const COLUMNS_KEY = "vekoo.pipelines.columns.v1"
const PER_PAGE_OPTIONS = [25, 50, 100]
const DEFAULT_PER_PAGE = 25

const BASE_COLUMNS = [
  "stage",
  "assignee",
  "priority",
  "labels",
  "dueDate",
  "value",
  "probability",
  "expectedClose",
  "company",
  "leadScore",
  "createdAt",
  "updatedAt",
] as const

type BaseColumn = (typeof BASE_COLUMNS)[number]

const DEFAULT_COLUMNS: string[] = ["stage", "assignee", "priority", "labels", "dueDate", "value", "createdAt"]
const STANDARD_HIDDEN = new Set<BaseColumn>(["probability", "expectedClose", "company", "leadScore"])

const customColumnId = (key: string) => `cf:${key}`

const PRIORITY_TONE: Record<CardPriority, StatusTone> = {
  urgent: "danger",
  high: "warning",
  medium: "neutral",
  low: "neutral",
}

function ColumnOption({
  label,
  checked,
  onToggle,
}: {
  label: string
  checked: boolean
  onToggle: () => void
}) {
  return (
    <label className="flex min-h-8 cursor-pointer items-center gap-2.5 rounded-md px-1 text-sm hover:bg-muted/50 pointer-coarse:min-h-10">
      <Checkbox
        className="border-muted-foreground/40"
        checked={checked}
        onCheckedChange={onToggle}
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </label>
  )
}

/** Cada um compara o que interessa: a escolha de colunas fica neste navegador. */
function ColumnPicker({
  visible,
  onChange,
  columns,
  customFields,
}: {
  visible: string[]
  onChange: (next: string[]) => void
  columns: readonly BaseColumn[]
  customFields: CustomField[]
}) {
  const { t } = useTranslation()
  const toggle = (id: string) =>
    onChange(visible.includes(id) ? visible.filter((item) => item !== id) : [...visible, id])

  const isDefault =
    visible.length === DEFAULT_COLUMNS.length &&
    DEFAULT_COLUMNS.every((id) => visible.includes(id))

  return (
    <ResponsivePopover
      title={t("pipelines.list.columns")}
      align="end"
      className="w-64 gap-0 overflow-hidden p-0"
      sheetClassName="px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      trigger={
        <Button type="button" variant="outline" className="pointer-coarse:h-10">
          <Columns3 />
          {t("pipelines.list.columns")}
        </Button>
      }
    >
      <div
        role="group"
        aria-label={t("pipelines.list.columns")}
        className="flex max-h-[min(60dvh,26rem)] flex-col overflow-y-auto md:p-2"
      >
        {columns.map((id) => (
          <ColumnOption
            key={id}
            label={t(`pipelines.list.column.${id}`)}
            checked={visible.includes(id)}
            onToggle={() => toggle(id)}
          />
        ))}
        {customFields.length > 0 ? (
          <>
            <Separator className="my-1.5" />
            <p className="px-1 py-1 text-xs font-medium text-muted-foreground">
              {t("pipelines.filters.customFields")}
            </p>
            {customFields.map((field) => {
              const id = customColumnId(field.key)
              return (
                <ColumnOption
                  key={field.id}
                  label={field.name}
                  checked={visible.includes(id)}
                  onToggle={() => toggle(id)}
                />
              )
            })}
          </>
        ) : null}
      </div>
      <div className="border-t pt-1 md:p-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isDefault}
          className="w-full pointer-coarse:h-10"
          onClick={() => onChange(DEFAULT_COLUMNS)}
        >
          {t("pipelines.list.columnsReset")}
        </Button>
      </div>
    </ResponsivePopover>
  )
}

function customValueText(field: CustomField, value: unknown, language: string, yes: string, no: string) {
  if (value === null || value === undefined || value === "") return null
  if (field.fieldType === "checkbox") return value === true || value === "true" ? yes : no
  if (field.fieldType === "date") return formatDate(parseDayKey(String(value).slice(0, 10)), language, "short")
  return String(value)
}

function useListColumns({
  visible,
  stages,
  customFields,
  leadScore,
}: {
  visible: string[]
  stages: Stage[]
  customFields: CustomField[]
  leadScore: LeadScoreConfig | null
}) {
  const { t } = useTranslation()
  const language = useLanguage()

  return useMemo<ColumnDef<Card, unknown>[]>(() => {
    const stageById = new Map(stages.map((stage) => [stage.id, stage]))

    const available: Record<BaseColumn, ColumnDef<Card, unknown>> = {
      stage: {
        id: "stage",
        header: t("pipelines.list.column.stage"),
        enableSorting: true,
        meta: { label: t("pipelines.list.column.stage"), mobile: "secondary", className: "w-44" },
        cell: ({ row }) => {
          const stage = stageById.get(row.original.stageId)
          return (
            <span className="inline-flex max-w-44 items-center gap-1.5">
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full bg-muted-foreground/40"
                style={stage?.color ? { backgroundColor: stage.color } : undefined}
              />
              <span className="truncate">{stage?.name ?? "—"}</span>
            </span>
          )
        },
      },
      assignee: {
        id: "assignee",
        header: t("pipelines.list.column.assignee"),
        enableSorting: true,
        meta: { label: t("pipelines.list.column.assignee"), className: "w-44" },
        cell: ({ row }) => {
          const person = row.original.assignedTo
          return person ? (
            <span className="inline-flex max-w-44 items-center gap-1.5">
              <UserAvatar
                size="sm"
                name={person.name}
                src={person.avatarUrl ? apiAssetUrl(person.avatarUrl) : null}
              />
              <span className="truncate">{person.name}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{t("pipelines.card.noAssignee")}</span>
          )
        },
      },
      priority: {
        id: "priority",
        header: t("pipelines.list.column.priority"),
        enableSorting: true,
        meta: { label: t("pipelines.list.column.priority"), className: "w-28" },
        cell: ({ row }) => {
          const { priority } = row.original
          return priority ? (
            <StatusBadge tone={PRIORITY_TONE[priority]} dot={false}>
              {t(`pipelines.priority.${priority}`)}
            </StatusBadge>
          ) : (
            <span className="text-muted-foreground">{t("pipelines.list.empty")}</span>
          )
        },
      },
      labels: {
        id: "labels",
        header: t("pipelines.list.column.labels"),
        enableSorting: false,
        meta: { label: t("pipelines.list.column.labels"), className: "w-52" },
        cell: ({ row }) => (
          <span className="flex max-w-52 flex-wrap gap-1">
            {row.original.labels.slice(0, 2).map((label) => (
              <TagChip key={label.id} color={label.color} className="h-5 max-w-24 px-1.5 text-[0.6875rem]">
                {label.name}
              </TagChip>
            ))}
            {row.original.labels.length > 2 ? (
              <TagChip className="h-5 px-1.5 text-[0.6875rem]">+{row.original.labels.length - 2}</TagChip>
            ) : null}
          </span>
        ),
      },
      dueDate: {
        id: "dueDate",
        header: t("pipelines.list.column.dueDate"),
        enableSorting: true,
        meta: {
          label: t("pipelines.list.column.dueDate"),
          className: "w-28",
          sortLabels: { asc: t("pipelines.list.sortOldest"), desc: t("pipelines.list.sortNewest") },
        },
        cell: ({ row }) =>
          row.original.dueDate ? (
            <span className={cn(isOverdue(row.original) && "font-medium text-status-danger")}>
              {formatDate(row.original.dueDate, language, "short")}
            </span>
          ) : (
            <span className="text-muted-foreground">{t("pipelines.list.empty")}</span>
          ),
      },
      value: {
        id: "value",
        header: t("pipelines.list.column.value"),
        enableSorting: true,
        meta: { label: t("pipelines.list.column.value"), align: "right", className: "w-32" },
        cell: ({ row }) => {
          const { dealValue } = row.original
          const status = dealStatusOf(row.original)
          return dealValue ? (
            <Money
              value={dealValue}
              className={cn(
                status === "won" && "text-status-success",
                status === "lost" && "text-muted-foreground line-through"
              )}
            />
          ) : (
            <span className="text-muted-foreground">{t("pipelines.list.empty")}</span>
          )
        },
      },
      probability: {
        id: "probability",
        header: t("pipelines.list.column.probability"),
        enableSorting: true,
        meta: { label: t("pipelines.list.column.probability"), align: "right", className: "w-24" },
        cell: ({ row }) =>
          row.original.dealProbability !== null ? (
            <span className="tabular-nums">{row.original.dealProbability}%</span>
          ) : (
            <span className="text-muted-foreground">{t("pipelines.list.empty")}</span>
          ),
      },
      expectedClose: {
        id: "expectedClose",
        header: t("pipelines.list.column.expectedClose"),
        enableSorting: true,
        meta: { label: t("pipelines.list.column.expectedClose"), className: "w-32" },
        cell: ({ row }) =>
          row.original.expectedCloseDate ? (
            <span className={cn(isCloseOverdue(row.original) && "font-medium text-status-danger")}>
              {formatDate(parseDayKey(row.original.expectedCloseDate), language, "short")}
            </span>
          ) : (
            <span className="text-muted-foreground">{t("pipelines.list.empty")}</span>
          ),
      },
      company: {
        id: "company",
        header: t("pipelines.list.column.company"),
        enableSorting: true,
        meta: { label: t("pipelines.list.column.company"), className: "w-44" },
        cell: ({ row }) => (
          <span className="block max-w-44 truncate">
            {row.original.companyName ?? t("pipelines.list.empty")}
          </span>
        ),
      },
      leadScore: {
        id: "leadScore",
        header: t("pipelines.list.column.leadScore"),
        enableSorting: true,
        meta: { label: t("pipelines.list.column.leadScore"), align: "right", className: "w-24" },
        cell: ({ row }) => {
          const score = leadScoreOf(row.original, leadScore)
          return score !== null ? (
            <span className="tabular-nums">{Math.round(score)}</span>
          ) : (
            <span className="text-muted-foreground">{t("pipelines.list.empty")}</span>
          )
        },
      },
      createdAt: {
        id: "createdAt",
        header: t("pipelines.list.column.createdAt"),
        enableSorting: true,
        meta: {
          label: t("pipelines.list.column.createdAt"),
          className: "w-28",
          sortLabels: { asc: t("pipelines.list.sortOldest"), desc: t("pipelines.list.sortNewest") },
        },
        cell: ({ row }) => formatDate(row.original.createdAt, language, "short"),
      },
      updatedAt: {
        id: "updatedAt",
        header: t("pipelines.list.column.updatedAt"),
        enableSorting: true,
        meta: {
          label: t("pipelines.list.column.updatedAt"),
          className: "w-28",
          sortLabels: { asc: t("pipelines.list.sortOldest"), desc: t("pipelines.list.sortNewest") },
        },
        cell: ({ row }) => formatDate(row.original.updatedAt, language, "short"),
      },
    }

    const title: ColumnDef<Card, unknown> = {
      id: "title",
      accessorKey: "title",
      header: t("pipelines.list.column.title"),
      enableSorting: true,
      meta: {
        label: t("pipelines.list.column.title"),
        mobile: "primary",
        className: "min-w-64 whitespace-normal",
      },
      cell: ({ row }) => {
        const status = dealStatusOf(row.original)
        return (
          <span className="flex min-w-0 items-center gap-2">
            {status !== "open" ? (
              <StatusBadge tone={status === "won" ? "success" : "danger"} className="shrink-0">
                {t(`pipelines.deal.${status}`)}
              </StatusBadge>
            ) : null}
            <span className="line-clamp-2 font-medium">{row.original.title}</span>
          </span>
        )
      },
    }

    const custom = customFields
      .filter((field) => visible.includes(customColumnId(field.key)))
      .map(
        (field): ColumnDef<Card, unknown> => ({
          id: customColumnId(field.key),
          header: field.name,
          enableSorting: false,
          meta: { label: field.name, className: "max-w-48" },
          cell: ({ row }) => (
            <span className="block max-w-48 truncate">
              {customValueText(
                field,
                row.original.customFieldValues?.[field.key],
                language,
                t("pipelines.filters.yes"),
                t("pipelines.filters.no")
              ) ?? t("pipelines.list.empty")}
            </span>
          ),
        })
      )

    return [
      title,
      ...BASE_COLUMNS.filter((id) => visible.includes(id)).map((id) => available[id]),
      ...custom,
    ]
  }, [customFields, language, leadScore, stages, t, visible])
}

type BoardListProps = {
  board: BoardDetail
  api: BoardFiltersApi
  context: FilterContext
  savedFilters: SavedFilter[]
  presets: PresetFilter[]
  onCreateCard: () => void
}

/** Os cards em lista, para comparar e agir em muitos. Paginada e ordenada no servidor. */
export const BoardList = memo(function BoardList({
  board,
  api,
  context,
  savedFilters,
  presets,
  onCreateCard,
}: BoardListProps) {
  const { t } = useTranslation()
  const actions = useCardActions()
  const { filters, advanced, searchParams, setParams, clearAll } = api
  const selected = useBoardUi((state) => state.selected)
  const setSelected = useBoardUi((state) => state.setSelected)
  const requestMove = useBoardUi((state) => state.requestMove)
  const requestLost = useBoardUi((state) => state.requestLost)

  const isCrm = board.boardType === "crm"
  const columnChoices = useMemo(
    () =>
      BASE_COLUMNS.filter(
        (id) => (isCrm || !STANDARD_HIDDEN.has(id)) && (id !== "leadScore" || context.leadScore)
      ),
    [context.leadScore, isCrm]
  )

  const [visible, setVisible] = useLocalStorage<string[]>(COLUMNS_KEY, DEFAULT_COLUMNS)
  const columns = useListColumns({
    visible,
    stages: board.stages,
    customFields: board.customFields,
    leadScore: context.leadScore,
  })

  /* ---------- consulta ---------- */

  const page = Number(searchParams.get("page")) || 1
  const perPage = Number(searchParams.get("perPage")) || DEFAULT_PER_PAGE
  const sortId = searchParams.get("sort") ?? "stage"
  const sortDesc = searchParams.get("direction") === "desc"

  const path = useMemo(
    () =>
      buildListPath(board.id, {
        filters,
        advanced,
        context,
        savedFilters,
        presets,
        page,
        perPage,
        sortId,
        sortDesc,
      }),
    [advanced, board.id, context, filters, page, perPage, presets, savedFilters, sortDesc, sortId]
  )

  const { data, error, isLoading, isValidating, mutate } = useApi<{
    cards: Card[]
    meta: PaginationMeta
  }>(path, { keepPreviousData: true, revalidateOnFocus: false })

  const rows = data?.cards ?? []
  const meta = data?.meta
  const firstLoad = isLoading && !data

  // Filtro e lote podem encolher a lista: a página em que a pessoa estava deixou de existir.
  useEffect(() => {
    if (!meta || isValidating) return
    if (meta.page > 1 && meta.page > Math.max(meta.totalPages, 1)) {
      setParams({ page: String(Math.max(meta.totalPages, 1)) }, { replace: true })
    }
  }, [isValidating, meta, setParams])

  const sorting = useMemo(() => [{ id: sortId, desc: sortDesc }], [sortDesc, sortId])

  const rowSelection = selected as Record<string, boolean>

  const rowActions = (card: Card): RowAction[] => {
    const open = !card.wonAt && !card.lostAt
    return [
      {
        label: t("pipelines.card.open"),
        icon: <PanelRightOpen />,
        onSelect: () => actions.open(card.id),
      },
      {
        label: t("pipelines.move.action"),
        icon: <ArrowRightLeft />,
        onSelect: () => requestMove([card.id]),
      },
      {
        label: t("pipelines.deal.markWon"),
        icon: <Check />,
        hidden: !isCrm || !open,
        separatorBefore: true,
        onSelect: () => void actions.closeDeal(card.id, "won"),
      },
      {
        label: t("pipelines.deal.markLost"),
        icon: <X />,
        hidden: !isCrm || !open,
        onSelect: () => requestLost(card.id),
      },
      {
        label: t("pipelines.deal.reopen"),
        icon: <RotateCcw />,
        hidden: !isCrm || open,
        separatorBefore: true,
        onSelect: () => void actions.reopen(card.id),
      },
      {
        label: t("pipelines.card.archive"),
        icon: <Archive />,
        separatorBefore: true,
        onSelect: () => void actions.archive(card.id),
      },
      {
        label: t("pipelines.card.delete"),
        icon: <Trash2 />,
        destructive: true,
        onSelect: () => void actions.remove(card),
      },
    ]
  }

  const filtered = Boolean(filters.q) || advanced !== null || path.includes("filter=")

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 pb-[calc(1rem+var(--app-bottom-nav-total))] md:px-6">
      <div className="flex justify-end">
        <ColumnPicker
          visible={visible}
          onChange={setVisible}
          columns={columnChoices}
          customFields={board.customFields}
        />
      </div>

      <DataTable
        aria-label={t("pipelines.list.label")}
        columns={columns}
        data={rows}
        meta={meta}
        maxHeight="calc(100dvh - 20rem)"
        isLoading={firstLoad}
        isFetching={isValidating && !firstLoad}
        error={error}
        onRetry={() => void mutate()}
        onPageChange={(next) => setParams({ page: String(next) })}
        onPerPageChange={(next) => setParams({ perPage: String(next), page: "1" })}
        perPageOptions={PER_PAGE_OPTIONS}
        sorting={sorting}
        onSortingChange={(next) => {
          const first = next[0]
          setParams({
            sort: first ? first.id : sortId,
            direction: (first ? first.desc : !sortDesc) ? "desc" : "asc",
            page: "1",
          })
        }}
        isFiltered={filtered}
        onClearFilters={clearAll}
        selectable
        rowSelection={rowSelection}
        onRowSelectionChange={(next) => setSelected(Object.keys(next).filter((id) => next[id]))}
        rowActions={rowActions}
        onRowClick={(card) => actions.open(card.id)}
        empty={{
          title: t("pipelines.list.emptyTitle"),
          description: t("pipelines.list.emptyHint"),
          action: { label: t("pipelines.card.new"), onClick: onCreateCard },
        }}
      />
    </div>
  )
})

function buildListPath(
  boardId: string,
  {
    filters,
    advanced,
    context,
    savedFilters,
    presets,
    page,
    perPage,
    sortId,
    sortDesc,
  }: {
    filters: BoardFiltersApi["filters"]
    advanced: AdvancedFilter | null
    context: FilterContext
    savedFilters: SavedFilter[]
    presets: PresetFilter[]
    page: number
    perPage: number
    sortId: string
    sortDesc: boolean
  }
) {
  const params = new URLSearchParams({
    page: String(page),
    perPage: String(perPage),
    sort: sortId,
    direction: sortDesc ? "desc" : "asc",
  })
  if (filters.q) params.set("search", filters.q)
  if (filters.chat) params.set("chatId", filters.chat)

  // A barra e o filtro avançado valem juntos: a API aceita um filtro só, então vão somados.
  let base = null
  if (advanced?.kind === "inline") base = advanced.definition
  else if (advanced?.kind === "saved") {
    base = savedFilters.find((filter) => filter.id === advanced.id)?.definition ?? null
  } else if (advanced?.kind === "preset") {
    base = presets.find((preset) => preset.key === advanced.key)?.definition ?? null
  }

  const compiled = compileFilters(filters, context, base)
  const isOnlyAdvanced = compiled !== null && base !== null && compiled.all.length === base.all.length && compiled.any.length === base.any.length

  if (advanced?.kind === "saved" && (isOnlyAdvanced || !base)) {
    params.set("savedFilterId", advanced.id)
  } else if (advanced?.kind === "preset" && (isOnlyAdvanced || !base)) {
    params.set("presetKey", advanced.key)
  } else if (compiled) {
    params.set("filter", JSON.stringify(compiled))
  }

  return `${cardsPath(boardId)}?${params}`
}
