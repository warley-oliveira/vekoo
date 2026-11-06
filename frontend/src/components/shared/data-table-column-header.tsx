import type { Column } from "@tanstack/react-table"
import { useTranslation } from "react-i18next"
import { ArrowDown, ArrowUp, ChevronsUpDown, ListFilter } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { columnLabel } from "./data-table-utils"
import { DateRangePicker } from "./date-range-picker"
import type { DateRangeValue } from "./date-range-presets"
import { FacetedFilter } from "./faceted-filter"
import { FilterLayoutContext } from "./filter-layout-context"
import { SearchInput } from "./search-input"

/** O controle de filtro de uma coluna, no popover do cabeçalho e na Sheet do celular. */
export function ColumnFilterControl<TData>({ column }: { column: Column<TData, unknown> }) {
  const { t } = useTranslation()
  const config = column.columnDef.meta?.filter
  const label = columnLabel(column)
  const value = column.getFilterValue()

  if (!config) return null

  if (config.type === "select") {
    return (
      <FacetedFilter
        title={label}
        options={config.options}
        value={(value as string[] | undefined) ?? []}
        onChange={(next) => column.setFilterValue(next.length > 0 ? next : undefined)}
      />
    )
  }

  if (config.type === "dateRange") {
    return (
      <DateRangePicker
        label={label}
        value={(value as DateRangeValue | undefined) ?? null}
        onChange={(next) => column.setFilterValue(next ?? undefined)}
      />
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <SearchInput
        shortcut={false}
        debounce={200}
        value={(value as string | undefined) ?? ""}
        placeholder={config.placeholder ?? t("kit.filters.searchIn", { title: label })}
        onChange={(next) => column.setFilterValue(next || undefined)}
      />
    </div>
  )
}

/** Cabeçalho de coluna: ordena ao clicar e abre o filtro no ícone ao lado. */
export function DataTableColumnHeader<TData>({
  column,
}: {
  column: Column<TData, unknown>
}) {
  const { t } = useTranslation()
  const label = columnLabel(column)
  const sorted = column.getIsSorted()
  const align = column.columnDef.meta?.align
  const filter = column.columnDef.meta?.filter && column.getCanFilter()
  const filtered = column.getIsFiltered()

  return (
    <div
      className={cn(
        "flex items-center gap-1",
        align === "right" && "flex-row-reverse",
        align === "center" && "justify-center"
      )}
    >
      {column.getCanSort() ? (
        <button
          type="button"
          onClick={column.getToggleSortingHandler()}
          aria-label={t("kit.table.sortBy", { column: label })}
          className={cn(
            "-mx-1 flex items-center gap-1 rounded px-1 py-0.5 outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
            align === "right" && "flex-row-reverse",
            sorted && "text-foreground"
          )}
        >
          {label}
          {sorted === "asc" ? (
            <ArrowUp aria-hidden className="size-3.5" />
          ) : sorted === "desc" ? (
            <ArrowDown aria-hidden className="size-3.5" />
          ) : (
            <ChevronsUpDown aria-hidden className="size-3.5 opacity-40" />
          )}
        </button>
      ) : (
        <span>{label}</span>
      )}

      {filter ? (
        <Popover>
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={t("kit.table.filterBy", { column: label })}
                className={cn("relative", filtered ? "text-primary" : "opacity-60 hover:opacity-100")}
              />
            }
          >
            <ListFilter />
            {filtered ? (
              <span aria-hidden className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-primary" />
            ) : null}
          </PopoverTrigger>
          <PopoverContent
            align={align === "right" ? "end" : "start"}
            className="w-64 font-normal"
          >
            <FilterLayoutContext.Provider value="stacked">
              <ColumnFilterControl column={column} />
            </FilterLayoutContext.Provider>
            {filtered ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => column.setFilterValue(undefined)}
              >
                {t("kit.filters.clearFilter")}
              </Button>
            ) : null}
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  )
}
