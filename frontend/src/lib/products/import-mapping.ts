import type { ProductImportPreview } from "./types"

// Regras do mapeamento de colunas, iguais às de `Products::ImportMapper`.

/** Estes somam vários valores: "Foto 1" e "Foto 2" podem ir ambas para Imagens. */
const MULTI_VALUE_TARGETS = new Set(["categories", "tags", "images"])

export const TITLE_TARGET = "title"
export const SKU_TARGET = "external_id"

export type ImportMapping = Record<string, string>

/** O cabeçalho pode repetir nome, mas o mapeamento é por nome: uma linha para cada nome. */
export function uniqueHeaders(preview: Pick<ProductImportPreview, "headers">): string[] {
  return [...new Set(preview.headers)]
}

/** O destino da coluna, ou vazio. `Object.hasOwn`: a planilha pode ter a coluna "constructor". */
export function mappedTarget(mapping: ImportMapping, header: string): string {
  return Object.hasOwn(mapping, header) ? mapping[header] : ""
}

/**
 * Liga uma coluna a um destino. O servidor leria duas colunas no mesmo destino de um
 * valor só, e a última venceria em silêncio; aqui a escolha nova tira a anterior, e a
 * pessoa vê. Destino vazio é "ignorar": a chave some do mapeamento.
 */
export function assignColumn(
  mapping: ImportMapping,
  header: string,
  target: string
): ImportMapping {
  const next: ImportMapping = {}
  Object.entries(mapping).forEach(([column, current]) => {
    if (column === header) return
    if (current === target && !MULTI_VALUE_TARGETS.has(target)) return
    next[column] = current
  })
  if (target) next[header] = target
  return next
}

export function isTargetMapped(mapping: ImportMapping, target: string): boolean {
  return Object.values(mapping).includes(target)
}

/** O primeiro valor preenchido da coluna, na amostra: a primeira linha pode estar vazia. */
export function sampleValue(
  preview: Pick<ProductImportPreview, "sampleRows">,
  header: string
): string | null {
  for (const row of preview.sampleRows) {
    const value = Object.hasOwn(row, header) ? row[header] : null
    if (value?.trim()) return value
  }
  return null
}
