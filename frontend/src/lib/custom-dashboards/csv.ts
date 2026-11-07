import { triggerBlobDownload } from "@/lib/file-utils"

import type { ChartModel, TableColumn, TableModel } from "./chart-model"

// O CSV sai do que o card está mostrando: fórmula e coluna calculada só existem na tela, e os nomes já estão resolvidos.
// A mesma proteção da API: o nome do contato vem de fora, e `=HYPERLINK(...)` viraria fórmula na planilha.

const FORMULA_START = /^[=+\-@\t\r]/

function cell(value: unknown): string {
  if (value === null || value === undefined) return ""
  const text = typeof value === "number" ? String(value) : String(value)
  const safe = typeof value !== "number" && FORMULA_START.test(text) ? `'${text}` : text
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}

function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((row) => row.map(cell).join(",")).join("\n")
}

export function chartModelCsv(model: ChartModel): string {
  const header = [model.dimensionLabel, ...model.series.map((series) => series.label)]
  const rows = model.categories.map((category, index) => [
    category.title,
    ...model.series.map((series) => series.values[index]),
  ])
  return toCsv(header, rows)
}

export function tableModelCsv(columns: TableColumn[], rows: TableModel["rows"]): string {
  return toCsv(
    columns.map((column) => column.label),
    rows.map((row) => columns.map((column) => row[column.key]))
  )
}

/** Com a marca de UTF-8: sem ela, o Excel embaralha os acentos. */
export function downloadCsv(csv: string, title: string) {
  const name = title.trim().replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, "_") || "card"
  triggerBlobDownload(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }), `${name}.csv`)
}
