import type { PaginationMeta } from "@/lib/api"

// Os tipos do catálogo de produtos, no formato em que a API responde. Contrato em
// docs/migration/api/products.md. O nome é "products" no código porque `lib/catalog.tsx`
// é outra coisa: o acervo da ferramenta de carrosséis. Na tela, a palavra é "Catálogo".

export const FIELD_VALUE_TYPES = [
  "text",
  "number",
  "list",
  "checkbox",
  "date",
  "url",
] as const

export type FieldValueType = (typeof FIELD_VALUE_TYPES)[number]

export type ProductImage = {
  id: string
  /** Relativa à API quando `hosted`; a URL externa quando não. */
  url: string
  /** Miniatura WebP de até 400 px quando `hosted`; a mesma externa quando não. */
  thumbUrl: string
  alt: string | null
  /** A menor é a principal. */
  position: number
  hosted: boolean
  createdAt: number
}

export type ProductItem = {
  id: string
  title: string
  summary: string | null
  /** Começando com `auto:` é chave interna da importação, não um código para mostrar. */
  externalId: string | null
  url: string | null
  active: boolean
  tags: string[]
  customFields: Record<string, unknown>
  images: ProductImage[]
  createdAt: number
  updatedAt: number
}

export type ProductCategoryRef = { id: string; name: string; path: string }

/** O item completo, da tela de edição. */
export type ProductItemDetail = ProductItem & {
  description: string | null
  categories: ProductCategoryRef[]
}

export type ProductItemsResponse = { items: ProductItem[]; meta: PaginationMeta }

export type ProductCategory = {
  id: string
  name: string
  slug: string
  /** O filtro da grade usa o caminho; o `categoryIds` do item usa o id. */
  path: string
  parentId: string | null
  position: number
  /** Só os vínculos diretos, sem os das categorias de dentro. */
  itemsCount: number
  depth: number
  createdAt: number
  updatedAt: number
}

export type ProductField = {
  id: string
  name: string
  /** Nasce do nome e nunca muda: é a chave em `customFields`. */
  key: string
  description: string | null
  valueType: FieldValueType
  optionValues: string[]
  /** A API guarda e não aplica: quem aplica é a tela do item. */
  defaultValue: string | null
  /** A API guarda e não aplica: quem aplica é a tela do item. */
  required: boolean
  searchable: boolean
  position: number
  createdAt: number
  updatedAt: number
}

export type SearchStrategy = "exact" | "hybrid" | "lexical" | "text" | "browse" | "none"

export type ProductSearchResponse = {
  items: ProductItem[]
  meta: { total: number; strategy: SearchStrategy }
}

export type ProductImportStatus = "pending" | "ready" | "processing" | "completed" | "failed"

export type ProductImportError = { line: number | null; message: string }

export type ProductImport = {
  id: string
  status: ProductImportStatus
  filename: string | null
  delimiter: string | null
  mapping: Record<string, string>
  options: { dedupeByTitle?: boolean; mirrorImages?: boolean }
  totalRows: number
  processedRows: number
  createdCount: number
  updatedCount: number
  errorCount: number
  percentage: number
  createdAt: number
  startedAt: number | null
  completedAt: number | null
  /** Só em `GET /products/imports/:id`, com até 50 erros. */
  errorSample?: ProductImportError[]
}

export type ProductImportsResponse = { imports: ProductImport[]; meta: PaginationMeta }

export type ProductImportTarget = {
  value: string
  label: string
  kind: "native" | "custom"
  valueType?: FieldValueType
}

/** O que `POST /products/imports` devolve: o servidor é quem leu o arquivo. */
export type ProductImportPreview = ProductImport & {
  headers: string[]
  sampleRows: Record<string, string | null>[]
  suggestedMapping: Record<string, string>
  targets: ProductImportTarget[]
}

/** Os eventos de `ProductImportChannel`. A stream é da organização: filtre por `importId`. */
export type ProductImportEvent =
  | {
      action: "progress" | "completed"
      data: {
        importId: string
        status: ProductImportStatus
        processed: number
        total: number
        created: number
        updated: number
        errors: number
        percentage: number
      }
    }
  | {
      action: "error"
      data: {
        importId: string
        code: "importFailed" | "importInterrupted" | (string & {})
        message: string
      }
    }
