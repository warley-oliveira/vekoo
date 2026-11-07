import { memo } from "react"
import { flexRender, type Cell } from "@tanstack/react-table"

function CellContentBase<TData>({ cell }: { cell: Cell<TData, unknown> }) {
  return flexRender(cell.column.columnDef.cell, cell.getContext())
}

/**
 * O conteúdo de uma célula de dados, que só se desenha de novo quando muda o registro, a coluna ou
 * o valor. Seleção e ações ficam de fora: dependem de estado de fora da célula.
 */
export const CellContent = memo(
  CellContentBase,
  (previous, next) =>
    previous.cell.row.original === next.cell.row.original &&
    previous.cell.column.columnDef.cell === next.cell.column.columnDef.cell &&
    previous.cell.getValue() === next.cell.getValue()
) as typeof CellContentBase
