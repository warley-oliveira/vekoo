import type { MouseEvent } from "react"
import type { Column, FilterFn, RowData, SortingFn } from "@tanstack/react-table"

import { toDate, isValidDate } from "@/lib/date-format"
import { matchesSearch } from "@/lib/search-text"
import type { DateRangeValue } from "./date-range-presets"

export const SELECT_COLUMN_ID = "__select"
export const ACTIONS_COLUMN_ID = "__actions"
export const DEFAULT_PER_PAGE_OPTIONS = [10, 25, 50, 100]

/** O nome da coluna: `meta.label` ou o cabeçalho, quando é texto. */
export function columnLabel<TData>(column: Column<TData, unknown>): string {
  const { meta, header } = column.columnDef
  return meta?.label ?? (typeof header === "string" ? header : column.id)
}

/** Clique em controle dentro da linha, ou vindo de um portal dela, não abre a linha. */
export function ignoresRowClick(event: MouseEvent<HTMLElement>): boolean {
  const target = event.target as HTMLElement
  return (
    !event.currentTarget.contains(target) ||
    Boolean(
      target.closest(
        "a, button, input, select, textarea, label, [role='checkbox'], [role='switch'], [role='menuitem']"
      )
    )
  )
}

function textOf(value: unknown): string {
  return value === null || value === undefined ? "" : String(value)
}

/** Contém, ignorando acento e caixa: "joao" encontra "João". */
export const textFilter: FilterFn<RowData> = (row, columnId, query) =>
  matchesSearch(textOf(row.getValue(columnId)), String(query ?? ""))
textFilter.autoRemove = (value) => !value

/** Alguma das opções marcadas, em coluna de valor único ou de lista. */
export const facetFilter: FilterFn<RowData> = (row, columnId, selected: string[]) => {
  const value = row.getValue(columnId)
  return Array.isArray(value)
    ? value.some((item) => selected.includes(String(item)))
    : selected.includes(textOf(value))
}
facetFilter.autoRemove = (value) => !value?.length

export const dateRangeFilter: FilterFn<RowData> = (row, columnId, range: DateRangeValue) => {
  const value = row.getValue(columnId) as number | string | Date | null | undefined
  if (value === null || value === undefined) return false

  const date = toDate(value)
  return isValidDate(date) && date >= range.from && date <= range.to
}
dateRangeFilter.autoRemove = (value) => !value

/**
 * Ordem do idioma ativo: "Ágata" antes de "Bruno", "item 2" antes de "item 10". O padrão
 * da biblioteca compara por código de caractere e joga os acentuados para o fim.
 */
export function localeSorting<TData>(language: string): SortingFn<TData> {
  const collator = new Intl.Collator(language, { numeric: true, sensitivity: "base" })

  return (a, b, columnId) => {
    const first = a.getValue(columnId)
    const second = b.getValue(columnId)

    if (typeof first === "number" && typeof second === "number") return first - second
    if (first instanceof Date && second instanceof Date) {
      return first.getTime() - second.getTime()
    }
    return collator.compare(textOf(first), textOf(second))
  }
}
