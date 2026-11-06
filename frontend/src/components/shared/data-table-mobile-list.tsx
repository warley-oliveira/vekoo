import { flexRender, type Cell, type Row } from "@tanstack/react-table"
import { useTranslation } from "react-i18next"

import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import type { RowAction } from "./actions-menu"
import { ActionsMenu } from "./actions-menu"
import { columnLabel } from "./data-table-column-header"
import { SELECT_COLUMN_ID, ignoresRowClick } from "./data-table-utils"

type MobileListProps<TData> = {
  rows: Row<TData>[]
  selectable: boolean
  rowActions?: (row: TData) => RowAction[]
  onRowClick?: (row: TData) => void
  rowClassName?: (row: TData) => string | undefined
  className?: string
}

/**
 * A tabela no celular: cada linha vira um item empilhado. Título e apoio vêm das colunas
 * marcadas (`meta.mobile`); o resto entra como pares de rótulo e valor.
 */
export function DataTableMobileList<TData>({
  rows,
  selectable,
  rowActions,
  onRowClick,
  rowClassName,
  className,
}: MobileListProps<TData>) {
  const { t } = useTranslation()

  return (
    <ul className={cn("flex flex-col divide-y rounded-lg border", className)}>
      {rows.map((row) => {
        const cells = row
          .getVisibleCells()
          .filter((cell) => cell.column.id !== SELECT_COLUMN_ID)
        const role = (cell: Cell<TData, unknown>) =>
          cell.column.columnDef.meta?.mobile ?? "meta"

        const primary = cells.find((cell) => role(cell) === "primary") ?? cells[0]
        const secondary = cells.filter((cell) => role(cell) === "secondary" && cell !== primary)
        const details = cells.filter((cell) => role(cell) === "meta" && cell !== primary)
        const actions = rowActions?.(row.original)

        return (
          <li
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
              "flex gap-3 p-3 outline-none first:rounded-t-lg last:rounded-b-lg data-[state=selected]:bg-accent/60",
              onRowClick &&
                "cursor-pointer active:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset",
              rowClassName?.(row.original)
            )}
          >
            {selectable ? (
              <Checkbox
                className="mt-0.5 border-muted-foreground/40"
                checked={row.getIsSelected()}
                disabled={!row.getCanSelect()}
                aria-label={t("kit.table.selectRow")}
                onCheckedChange={(checked) => row.toggleSelected(Boolean(checked))}
              />
            ) : null}
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1 text-sm font-medium wrap-anywhere">
                  {primary
                    ? flexRender(primary.column.columnDef.cell, primary.getContext())
                    : null}
                </div>
                {actions ? (
                  <ActionsMenu
                    actions={actions}
                    label={t("kit.table.rowActions")}
                    className="-my-1 -mr-1 shrink-0"
                  />
                ) : null}
              </div>
              {secondary.length > 0 ? (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                  {secondary.map((cell) => (
                    <span key={cell.id} className="min-w-0">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </span>
                  ))}
                </div>
              ) : null}
              {details.length > 0 ? (
                <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  {details.map((cell) => (
                    <div key={cell.id} className="min-w-0">
                      <dt className="truncate text-xs text-muted-foreground">
                        {columnLabel(cell.column)}
                      </dt>
                      <dd className="min-w-0 wrap-anywhere">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
