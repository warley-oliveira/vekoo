import { memo, useMemo } from "react"
import { useTranslation } from "react-i18next"
import type { ColumnDef } from "@tanstack/react-table"

import { DataTable } from "@/components/shared"
import { useLanguage } from "@/lib/i18n"
import type { TableModel, TableRowData } from "@/lib/custom-dashboards/chart-model"
import { formatValue } from "@/lib/custom-dashboards/format"
import type { VisualConfig } from "@/lib/custom-dashboards/types"

type TableWidgetProps = {
  title: string
  table: TableModel
  config: VisualConfig
}

/**
 * A tabela do card é a do kit: cabeçalho fixo, ordem, paginação e lista empilhada no celular. Ordena no navegador, sobre
 * o que veio da consulta, e a soma fica logo abaixo: o kit não tem linha de total.
 */
export const TableWidget = memo(function TableWidget({ title, table, config }: TableWidgetProps) {
  const { t } = useTranslation()
  const language = useLanguage()

  const columns = useMemo<ColumnDef<TableRowData, unknown>[]>(
    () =>
      table.columns.map((column, index) => ({
        id: column.key,
        header: column.label,
        // Data aparece em texto e ordena pelo número por trás dele.
        accessorFn: (row) => (column.kind === "date" ? row[`${column.key}__sort`] : row[column.key]),
        meta: {
          label: column.label,
          align: column.kind === "number" ? ("right" as const) : undefined,
          mobile: index === 0 ? ("primary" as const) : ("meta" as const),
        },
        cell: ({ row }) => {
          const value = row.original[column.key]
          if (column.kind === "number") {
            return column.metric || typeof value === "number"
              ? formatValue(value as number | null, column.metric ? config : {}, language)
              : "—"
          }
          return value === null || value === undefined || value === "" ? "—" : String(value)
        },
      })),
    [config, language, table.columns]
  )

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <DataTable
        aria-label={title}
        columns={columns}
        data={table.rows}
        density="compact"
        pageSize={25}
        maxHeight="none"
        className="min-h-0 [&>[role=region]]:min-h-0"
      />
      {table.totals ? (
        <dl className="flex shrink-0 flex-wrap items-baseline gap-x-4 gap-y-1 border-t pt-2 text-xs">
          <dt className="font-medium">{t("customDashboards.values.total")}</dt>
          {table.columns
            .filter((column) => column.kind === "number" && table.totals?.[column.key] !== undefined)
            .map((column) => (
              <div key={column.key} className="flex items-baseline gap-1.5">
                <dt className="text-muted-foreground">{column.label}</dt>
                <dd className="font-medium tabular-nums">
                  {formatValue(table.totals?.[column.key] ?? null, column.metric ? config : {}, language)}
                </dd>
              </div>
            ))}
        </dl>
      ) : null}
    </div>
  )
})
