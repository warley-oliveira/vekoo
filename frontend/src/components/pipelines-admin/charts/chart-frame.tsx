import { useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { BarChart3, Table2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export type ChartTableData = {
  columns: string[]
  /** A primeira célula de cada linha é o cabeçalho da linha. */
  rows: { id: string; cells: ReactNode[] }[]
}

type ChartFrameProps = {
  title: string
  description?: string
  legend?: ReactNode
  /** O gêmeo em tabela: tudo o que o gráfico mostra, para quem não enxerga cor nem mira no mouse. */
  table: ChartTableData
  /** Logo abaixo do título: o seletor de indicador, por exemplo. */
  actions?: ReactNode
  children: ReactNode
}

/** A moldura de todo gráfico: título, legenda e a alternativa em tabela, sempre a um clique. */
export function ChartFrame({ title, description, legend, table, actions, children }: ChartFrameProps) {
  const { t } = useTranslation()
  const [asTable, setAsTable] = useState(false)

  return (
    <figure className="m-0 flex min-w-0 flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <figcaption className="min-w-0 flex-1 space-y-0.5">
          <h3 className="font-heading text-sm font-medium">{title}</h3>
          {description ? (
            <p className="text-xs text-pretty text-muted-foreground">{description}</p>
          ) : null}
        </figcaption>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={asTable}
          className="shrink-0 text-muted-foreground pointer-coarse:h-10"
          onClick={() => setAsTable((current) => !current)}
        >
          {asTable ? <BarChart3 /> : <Table2 />}
          {asTable ? t("pipelinesAdmin.charts.showChart") : t("pipelinesAdmin.charts.showTable")}
        </Button>
      </div>

      {actions}

      {asTable ? (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {table.columns.map((column, index) => (
                  <TableHead key={column} className={index > 0 ? "text-right" : undefined}>
                    {column}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {table.rows.map((row) => (
                <TableRow key={row.id}>
                  {row.cells.map((cell, index) => (
                    <TableCell key={index} className={index > 0 ? "text-right tabular-nums" : "font-medium"}>
                      {cell}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <>
          {legend}
          {children}
        </>
      )}
    </figure>
  )
}

/** Legenda: o traço imita a marca do gráfico, e o texto nunca veste a cor da série. */
export function ChartLegend({
  items,
}: {
  items: { id: string; label: string; mark: "bar" | "tick"; className: string }[]
}) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((item) => (
        <li key={item.id} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={
              item.mark === "bar"
                ? `size-2.5 rounded-[2px] ${item.className}`
                : `h-0.5 w-3.5 rounded-full ${item.className}`
            }
          />
          {item.label}
        </li>
      ))}
    </ul>
  )
}
