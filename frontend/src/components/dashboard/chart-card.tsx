import { useId, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { ChartColumn, Table2 } from "lucide-react"

import { SectionCard } from "@/components/shared"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

export type ChartTableColumn = { key: string; label: string; align?: "left" | "right" }
export type ChartTableRow = { id: string; cells: Record<string, ReactNode> }
export type ChartTableData = { columns: ChartTableColumn[]; rows: ChartTableRow[] }

type ChartCardProps = {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  /** A tabela gêmea do gráfico: quem não enxerga cor, ou quer o número exato, lê aqui. */
  table?: ChartTableData
  /** O gráfico em uma frase, para leitor de tela. */
  summary?: string
  className?: string
  contentClassName?: string
  children: ReactNode
}

/** Card de gráfico: título, alternância para tabela e resumo em texto. */
export function ChartCard({
  title,
  description,
  actions,
  table,
  summary,
  className,
  contentClassName,
  children,
}: ChartCardProps) {
  const { t } = useTranslation()
  const [view, setView] = useState<"chart" | "table">("chart")
  const captionId = useId()
  const showingTable = view === "table" && Boolean(table)

  const toggle = table ? (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-pressed={showingTable}
      aria-label={t(showingTable ? "dashboard.chart.showChart" : "dashboard.chart.showTable")}
      title={t(showingTable ? "dashboard.chart.showChart" : "dashboard.chart.showTable")}
      className="text-muted-foreground"
      onClick={() => setView(showingTable ? "chart" : "table")}
    >
      {showingTable ? <ChartColumn /> : <Table2 />}
    </Button>
  ) : null

  const cardActions =
    actions || toggle ? (
      <div className="flex items-center gap-1">
        {actions}
        {toggle}
      </div>
    ) : undefined

  return (
    <SectionCard
      title={<h3>{title}</h3>}
      description={description}
      actions={cardActions}
      className={cn("h-full", className)}
      contentClassName={cn("flex-1", contentClassName)}
    >
      {showingTable && table ? (
        <ChartTable table={table} />
      ) : (
        <figure aria-describedby={summary ? captionId : undefined} className="m-0 h-full">
          {summary ? (
            <figcaption id={captionId} className="sr-only">
              {summary}
            </figcaption>
          ) : null}
          {children}
        </figure>
      )}
    </SectionCard>
  )
}

function ChartTable({ table }: { table: ChartTableData }) {
  return (
    <div className="max-h-72 overflow-auto [scrollbar-width:thin]">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-card">
          <TableRow>
            {table.columns.map((column) => (
              <TableHead
                key={column.key}
                className={cn("h-8 px-2 text-xs", column.align === "right" && "text-right")}
              >
                {column.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {table.rows.map((row) => (
            <TableRow key={row.id}>
              {table.columns.map((column) => (
                <TableCell
                  key={column.key}
                  className={cn(
                    "px-2 py-1.5 text-xs",
                    column.align === "right" && "text-right tabular-nums"
                  )}
                >
                  {row.cells[column.key]}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export type LegendItem = {
  key: string
  label: string
  color: string
  /** Espelha a marca do gráfico: linha para linha, retângulo para barra. */
  mark?: "bar" | "line"
  value?: string
}

/** Legenda em texto: a identidade nunca depende só da cor, e o total de cada série vem junto. */
export function ChartLegend({ items, className }: { items: LegendItem[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground", className)}>
      {items.map((item) => (
        <li key={item.key} className="flex min-w-0 items-center gap-1.5">
          <span
            aria-hidden
            className={cn("shrink-0 rounded-[2px]", item.mark === "line" ? "h-0.5 w-3" : "size-2.5")}
            style={{ backgroundColor: item.color }}
          />
          <span>{item.label}</span>
          {item.value ? (
            <span className="font-medium text-foreground tabular-nums">{item.value}</span>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

/** Vazio dentro de um card: o card fica no lugar, e a grade não muda de forma quando o dado chega. */
export function CardEmpty({
  title,
  description,
  className,
}: {
  title: string
  description?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex h-full min-h-32 flex-col items-center justify-center gap-1 rounded-lg bg-muted/40 px-4 py-6 text-center",
        className
      )}
    >
      <p className="text-sm font-medium">{title}</p>
      {description ? <p className="max-w-xs text-xs text-muted-foreground">{description}</p> : null}
    </div>
  )
}
