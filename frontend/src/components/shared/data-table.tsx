import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type FilterFn,
  type OnChangeFn,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
  type Updater,
} from "@tanstack/react-table"
import { useTranslation } from "react-i18next"
import { Rows3, Rows4 } from "lucide-react"

import { EmptyState } from "@/components/empty-state"
import { ErrorState, InlineError } from "@/components/error-state"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useIsMobile } from "@/hooks/use-is-mobile"
import { useLocalStorage } from "@/hooks/use-local-storage"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { ActionsMenu } from "./actions-menu"
import { BulkActionsBar } from "./bulk-actions-bar"
import { ColumnFilterControl, DataTableColumnHeader } from "./data-table-column-header"
import { DataTableMobileList } from "./data-table-mobile-list"
import type { DataTableProps, TableDensity } from "./data-table-types"
import {
  ACTIONS_COLUMN_ID,
  DEFAULT_PER_PAGE_OPTIONS,
  SELECT_COLUMN_ID,
  columnLabel,
  dateRangeFilter,
  facetFilter,
  ignoresRowClick,
  localeSorting,
  textFilter,
} from "./data-table-utils"
import { FilterPopover } from "./filter-popover"
import { ListSkeleton } from "./list-skeleton"
import { LoadingRegion } from "./loading-region"
import { SortMenu } from "./sort-menu"
import { TablePagination } from "./table-pagination"

const DENSITY_KEY = "vekoo.table.density"
const DEFAULT_PAGE_SIZE = 25
const SKELETON_ROWS = 8
const CELL_WIDTHS = ["w-2/3", "w-1/2", "w-3/4", "w-2/5", "w-3/5"]
// O mesmo array sempre: `data={x ?? []}` criaria um novo a cada render e faria a tabela
// recalcular tudo sem necessidade.
const NO_ROWS: never[] = []

const FILTER_FNS = {
  text: textFilter,
  select: facetFilter,
  dateRange: dateRangeFilter,
} as const

function resolve<T>(updater: Updater<T>, current: T): T {
  return typeof updater === "function" ? (updater as (old: T) => T)(current) : updater
}

/** Estado que a tela pode controlar ou deixar por conta do componente. */
function useTableState<T>(
  controlled: T | undefined,
  onChange: ((value: T) => void) | undefined,
  initial: T
): [T, OnChangeFn<T>] {
  const [internal, setInternal] = useState(initial)
  const value = controlled ?? internal

  const set = useCallback<OnChangeFn<T>>(
    (updater) => {
      const next = resolve(updater, value)
      setInternal(next)
      onChange?.(next)
    },
    [onChange, value]
  )

  return [value, set]
}

/**
 * Tabela completa. Com `meta` a paginação, a ordem e os filtros são do servidor; sem,
 * tudo acontece no navegador. No celular vira lista empilhada. Antes de usar, confirme
 * que tabela é mesmo a melhor forma: lista densa e cards costumam ser melhores.
 */
export function DataTable<TData>({
  columns,
  data: rawData,
  getRowId,
  isLoading = false,
  isFetching = false,
  error,
  onRetry,
  empty,
  isFiltered = false,
  onClearFilters,
  meta,
  onPageChange,
  onPerPageChange,
  pageSize = DEFAULT_PAGE_SIZE,
  perPageOptions = DEFAULT_PER_PAGE_OPTIONS,
  sorting: sortingProp,
  onSortingChange,
  defaultSorting = NO_ROWS,
  columnFilters: columnFiltersProp,
  onColumnFiltersChange,
  globalFilter,
  selectable = false,
  rowSelection: rowSelectionProp,
  onRowSelectionChange,
  canSelectRow,
  bulkActions,
  bulkLabel,
  selectAllMatching = false,
  rowActions,
  onRowClick,
  rowClassName,
  density: densityProp,
  maxHeight = "min(70dvh, 52rem)",
  "aria-label": ariaLabel,
  className,
}: DataTableProps<TData>) {
  const { t } = useTranslation()
  const language = useLanguage()
  const isMobile = useIsMobile()
  const isServer = meta !== undefined || onPageChange !== undefined
  const data = rawData.length === 0 ? (NO_ROWS as TData[]) : rawData

  const [storedDensity, setStoredDensity] = useLocalStorage<TableDensity>(
    DENSITY_KEY,
    "comfortable"
  )
  const density = densityProp ?? storedDensity

  const [localPagination, setLocalPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize,
  })
  const pagination = useMemo<PaginationState>(
    () =>
      isServer
        ? { pageIndex: (meta?.page ?? 1) - 1, pageSize: meta?.perPage ?? pageSize }
        : localPagination,
    [isServer, localPagination, meta?.page, meta?.perPage, pageSize]
  )

  const [sorting, setSortingState] = useTableState<SortingState>(
    sortingProp,
    onSortingChange,
    defaultSorting
  )
  const [columnFilters, setColumnFiltersState] = useTableState<ColumnFiltersState>(
    columnFiltersProp,
    onColumnFiltersChange,
    NO_ROWS
  )
  const [rowSelection, setRowSelectionState] = useTableState<RowSelectionState>(
    rowSelectionProp,
    onRowSelectionChange,
    {}
  )
  const [allMatching, setAllMatching] = useState(false)

  // Na API, a volta à página 1 espera o commit. Chamar `onPageChange` junto com
  // `onSortingChange` entrega à tela dois callbacks do mesmo render: quem guarda a
  // consulta num objeto só sobrescreveria a ordem nova com o estado antigo, sem erro.
  const firstPagePending = useRef(false)
  useLayoutEffect(() => {
    if (!firstPagePending.current) return

    firstPagePending.current = false
    if ((meta?.page ?? 1) !== 1) onPageChange?.(1)
  })

  const goToFirstPage = useCallback(() => {
    if (isServer) {
      firstPagePending.current = true
    } else {
      setLocalPagination((current) => ({ ...current, pageIndex: 0 }))
    }
  }, [isServer])

  // Mudar a ordem ou um filtro sempre volta à primeira página; as linhas de "agora" não
  // têm nada a ver com a página em que a pessoa estava.
  const setSorting = useCallback<OnChangeFn<SortingState>>(
    (updater) => {
      setSortingState(updater)
      goToFirstPage()
    },
    [goToFirstPage, setSortingState]
  )
  const setColumnFilters = useCallback<OnChangeFn<ColumnFiltersState>>(
    (updater) => {
      setColumnFiltersState(updater)
      setAllMatching(false)
      goToFirstPage()
    },
    [goToFirstPage, setColumnFiltersState]
  )
  const setRowSelection = useCallback<OnChangeFn<RowSelectionState>>(
    (updater) => {
      setRowSelectionState(updater)
      setAllMatching(false)
    },
    [setRowSelectionState]
  )

  useEffect(() => {
    if (!isServer) {
      setLocalPagination((current) =>
        current.pageIndex === 0 ? current : { ...current, pageIndex: 0 }
      )
    }
    setAllMatching(false)
  }, [globalFilter, isServer])

  const allColumns = useMemo<ColumnDef<TData, any>[]>(() => {
    const withFilters = columns.map((column) => {
      const type = column.meta?.filter?.type
      return {
        ...column,
        enableColumnFilter: Boolean(type),
        ...(type && !column.filterFn
          ? { filterFn: FILTER_FNS[type] as unknown as FilterFn<TData> }
          : {}),
      }
    })

    const selectColumn: ColumnDef<TData, any> = {
      id: SELECT_COLUMN_ID,
      enableSorting: false,
      enableHiding: false,
      meta: { mobile: "hidden", className: "w-10" },
      header: ({ table }) => {
        const all = table.getIsAllPageRowsSelected()
        const some = table.getIsSomePageRowsSelected()
        return (
          <Checkbox
            aria-label={t("kit.table.selectPage")}
            checked={all}
            indeterminate={!all && some}
            className="data-indeterminate:border-primary data-indeterminate:bg-primary data-indeterminate:text-primary-foreground"
            onCheckedChange={(checked) => table.toggleAllPageRowsSelected(Boolean(checked))}
          />
        )
      },
      cell: ({ row }) => (
        <Checkbox
          aria-label={t("kit.table.selectRow")}
          checked={row.getIsSelected()}
          disabled={!row.getCanSelect()}
          onCheckedChange={(checked) => row.toggleSelected(Boolean(checked))}
        />
      ),
    }

    const actionsColumn: ColumnDef<TData, any> = {
      id: ACTIONS_COLUMN_ID,
      enableSorting: false,
      enableHiding: false,
      meta: { label: t("kit.table.actions"), mobile: "hidden", align: "right", className: "w-10" },
      header: () => <span className="sr-only">{t("kit.table.actions")}</span>,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <ActionsMenu
            actions={rowActions?.(row.original) ?? []}
            label={t("kit.table.rowActions")}
          />
        </div>
      ),
    }

    return [
      ...(selectable ? [selectColumn] : []),
      ...withFilters,
      ...(rowActions ? [actionsColumn] : []),
    ]
  }, [columns, rowActions, selectable, t])

  const defaultColumn = useMemo(
    () => ({ sortingFn: localeSorting<TData>(language), sortUndefined: "last" as const }),
    [language]
  )

  const table = useReactTable<TData>({
    data,
    columns: allColumns,
    defaultColumn,
    getRowId: (row, index) =>
      getRowId?.(row) ?? (row as { id?: string }).id ?? String(index),
    state: { sorting, columnFilters, rowSelection, pagination, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setLocalPagination,
    enableRowSelection: canSelectRow ? (row) => canSelectRow(row.original) : selectable,
    // Na API, só ordena e filtra o que a tela liga a uma consulta no servidor.
    enableSorting: !isServer || Boolean(onSortingChange),
    enableFilters: !isServer || Boolean(onColumnFiltersChange),
    globalFilterFn: textFilter as unknown as FilterFn<TData>,
    getCoreRowModel: getCoreRowModel(),
    ...(isServer
      ? {
          manualPagination: true,
          manualSorting: true,
          manualFiltering: true,
          rowCount: meta?.total ?? 0,
        }
      : {
          getSortedRowModel: getSortedRowModel(),
          getFilteredRowModel: getFilteredRowModel(),
          getPaginationRowModel: getPaginationRowModel(),
          // Por padrão voltaria à primeira página a cada revalidação do SWR. A volta só
          // acontece quando a pessoa mexe em ordem ou filtro, nos `set*` acima.
          autoResetPageIndex: false,
        }),
  })

  const pageCount = table.getPageCount()
  useEffect(() => {
    // O filtro encolheu a lista e a página atual deixou de existir.
    if (!isServer && pageCount > 0 && pagination.pageIndex >= pageCount) {
      setLocalPagination((current) => ({ ...current, pageIndex: pageCount - 1 }))
    }
  }, [isServer, pageCount, pagination.pageIndex])

  const rows = table.getRowModel().rows
  const leafColumns = table.getVisibleLeafColumns()
  const hasColumnFilters = columnFilters.length > 0
  const showingNothing = rows.length === 0
  const filteredOut =
    hasColumnFilters || isFiltered || Boolean(globalFilter) || (!isServer && data.length > 0)

  const clearFilters = () => {
    setColumnFilters([])
    onClearFilters?.()
  }

  /* ---------- seleção ---------- */

  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id])
  const selectedRows = table.getSelectedRowModel().rows.map((row) => row.original)
  const total = isServer ? (meta?.total ?? 0) : table.getFilteredRowModel().rows.length
  const clearSelection = () => {
    setRowSelection({})
    setAllMatching(false)
  }

  const bulkBar = selectable && bulkActions ? (
    <BulkActionsBar
      count={allMatching ? total : selectedIds.length}
      onClear={clearSelection}
      label={bulkLabel}
      selectAll={
        selectAllMatching && isServer && !allMatching
          ? { total, onSelect: () => setAllMatching(true) }
          : undefined
      }
    >
      {bulkActions({
        ids: selectedIds,
        rows: selectedRows,
        allMatching,
        clear: clearSelection,
      })}
    </BulkActionsBar>
  ) : null

  /* ---------- rodapé ---------- */

  const densityToggle =
    densityProp || isMobile ? null : (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-pressed={density === "compact"}
              aria-label={t("kit.table.compactDensity")}
              className="text-muted-foreground"
              onClick={() =>
                setStoredDensity(density === "compact" ? "comfortable" : "compact")
              }
            />
          }
        >
          {density === "compact" ? <Rows4 /> : <Rows3 />}
        </TooltipTrigger>
        <TooltipContent>
          {density === "compact"
            ? t("kit.table.useComfortable")
            : t("kit.table.useCompact")}
        </TooltipContent>
      </Tooltip>
    )

  const page = pagination.pageIndex + 1
  const totalPages = isServer ? (meta?.totalPages ?? 1) : Math.max(1, pageCount)

  const footer =
    isLoading || total === 0 ? null : (
      <TablePagination
        page={page}
        totalPages={totalPages}
        total={total}
        perPage={pagination.pageSize}
        perPageOptions={perPageOptions}
        extra={densityToggle}
        onPageChange={(next) => {
          if (isServer) onPageChange?.(next)
          else setLocalPagination((current) => ({ ...current, pageIndex: next - 1 }))
        }}
        onPerPageChange={
          isServer
            ? onPerPageChange
              ? (next) => {
                  goToFirstPage()
                  onPerPageChange(next)
                }
              : undefined
            : (next) => setLocalPagination({ pageIndex: 0, pageSize: next })
        }
      />
    )

  /* ---------- estados sem linhas ---------- */

  if (error && data.length === 0) {
    return <ErrorState error={error} onRetry={onRetry} className={className} />
  }

  if (!isLoading && showingNothing && !filteredOut) {
    return (
      <EmptyState
        title={t("kit.table.emptyTitle")}
        {...empty}
        className={cn(className, empty?.className)}
      />
    )
  }

  const filteredEmpty = (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <p className="text-sm font-medium">{t("kit.table.noResultsTitle")}</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        {t("kit.table.noResultsDescription")}
      </p>
      <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
        {t("kit.filters.clear")}
      </Button>
    </div>
  )

  const staleError =
    error && data.length > 0 ? (
      <div className="rounded-lg border border-dashed">
        <InlineError onRetry={onRetry} />
      </div>
    ) : null

  /* ---------- celular ---------- */

  if (isMobile) {
    const sortable = table.getAllLeafColumns().filter((column) => column.getCanSort())
    const filterable = table
      .getAllLeafColumns()
      .filter((column) => column.columnDef.meta?.filter && column.getCanFilter())

    const sortOptions = sortable.flatMap((column) => {
      const label = columnLabel(column)
      const custom = column.columnDef.meta?.sortLabels
      return [
        {
          value: `${column.id}:desc`,
          label: custom?.desc ?? t("kit.table.sortDesc", { column: label }),
        },
        {
          value: `${column.id}:asc`,
          label: custom?.asc ?? t("kit.table.sortAsc", { column: label }),
        },
      ]
    })
    const currentSort = sorting[0]

    return (
      <div className={cn("flex flex-col gap-3", className)}>
        {staleError}
        {sortOptions.length > 0 || filterable.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {filterable.length > 0 ? (
              <FilterPopover activeCount={columnFilters.length} onClear={clearFilters}>
                {filterable.map((column) => (
                  <ColumnFilterControl key={column.id} column={column} />
                ))}
              </FilterPopover>
            ) : null}
            {sortOptions.length > 0 ? (
              <SortMenu
                options={sortOptions}
                value={
                  currentSort
                    ? `${currentSort.id}:${currentSort.desc ? "desc" : "asc"}`
                    : ""
                }
                onChange={(next) => {
                  const [id, direction] = next.split(":")
                  setSorting([{ id, desc: direction === "desc" }])
                }}
              />
            ) : null}
          </div>
        ) : null}
        {isLoading ? (
          <div className="rounded-lg border px-3">
            <ListSkeleton rows={SKELETON_ROWS} />
          </div>
        ) : showingNothing ? (
          <div className="rounded-lg border">{filteredEmpty}</div>
        ) : (
          <DataTableMobileList
            rows={rows}
            selectable={selectable}
            rowActions={rowActions}
            onRowClick={onRowClick}
            rowClassName={rowClassName}
            className={cn(isFetching && "opacity-60 transition-opacity")}
          />
        )}
        {footer}
        {bulkBar}
      </div>
    )
  }

  /* ---------- desktop ---------- */

  const cellPadding = density === "compact" ? "px-3 py-1.5" : "px-3 py-3"

  return (
    <div className={cn("flex min-w-0 flex-col gap-3", className)}>
      {staleError}
      <div
        // Cabeçalho fixo precisa de um rolável próprio: o `Table` da primitiva tem um
        // `overflow-x-auto` que cortaria o `sticky`.
        role="region"
        aria-label={ariaLabel}
        tabIndex={0}
        style={{ maxHeight }}
        className="overflow-auto rounded-lg border outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <table
          data-slot="table"
          aria-label={ariaLabel}
          aria-busy={isLoading || isFetching}
          className="w-full caption-bottom text-sm"
        >
          <TableHeader className="sticky top-0 z-10 bg-background shadow-[inset_0_-1px_0_var(--border)] [&_tr]:border-b-0">
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id} className="hover:bg-transparent">
                {group.headers.map((header) => {
                  const columnMeta = header.column.columnDef.meta
                  const sorted = header.column.getIsSorted()
                  const custom =
                    header.column.id === SELECT_COLUMN_ID ||
                    header.column.id === ACTIONS_COLUMN_ID

                  return (
                    <TableHead
                      key={header.id}
                      aria-sort={
                        sorted === "asc"
                          ? "ascending"
                          : sorted === "desc"
                            ? "descending"
                            : undefined
                      }
                      className={cn(
                        "px-3 text-xs text-muted-foreground",
                        columnMeta?.align === "right" && "text-right",
                        columnMeta?.align === "center" && "text-center",
                        columnMeta?.className
                      )}
                    >
                      {header.isPlaceholder ? null : custom ? (
                        flexRender(header.column.columnDef.header, header.getContext())
                      ) : (
                        <DataTableColumnHeader column={header.column} />
                      )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody className={cn(isFetching && "opacity-60 transition-opacity")}>
            {isLoading ? (
              Array.from({ length: SKELETON_ROWS }, (_, rowIndex) => (
                <TableRow key={rowIndex} className="hover:bg-transparent">
                  {leafColumns.map((column, columnIndex) => (
                    <TableCell key={column.id} className={cellPadding}>
                      {column.id === SELECT_COLUMN_ID ? (
                        <Skeleton className="size-4 rounded-[4px]" />
                      ) : column.id === ACTIONS_COLUMN_ID ? (
                        <Skeleton className="ml-auto size-5" />
                      ) : (
                        <Skeleton
                          className={cn(
                            "h-3.5",
                            CELL_WIDTHS[(rowIndex + columnIndex) % CELL_WIDTHS.length]
                          )}
                        />
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : showingNothing ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={leafColumns.length} className="whitespace-normal">
                  {filteredEmpty}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onClick={
                    onRowClick
                      ? (event) => {
                          if (!ignoresRowClick(event)) onRowClick(row.original)
                        }
                      : undefined
                  }
                  onKeyDown={
                    onRowClick
                      ? (event) => {
                          if (event.key === "Enter" && event.target === event.currentTarget) {
                            onRowClick(row.original)
                          }
                        }
                      : undefined
                  }
                  className={cn(
                    "data-[state=selected]:bg-accent/60",
                    onRowClick &&
                      "cursor-pointer outline-none focus-visible:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset",
                    rowClassName?.(row.original)
                  )}
                >
                  {row.getVisibleCells().map((cell) => {
                    const columnMeta = cell.column.columnDef.meta
                    return (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          cellPadding,
                          columnMeta?.align === "right" && "text-right tabular-nums",
                          columnMeta?.align === "center" && "text-center",
                          columnMeta?.className
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))
            )}
          </TableBody>
        </table>
      </div>
      {isLoading ? <LoadingRegion className="sr-only" /> : null}
      {footer}
      {bulkBar}
    </div>
  )
}
