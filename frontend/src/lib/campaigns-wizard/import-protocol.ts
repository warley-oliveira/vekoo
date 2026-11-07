import type {
  ImportIssue,
  ImportPreviewRow,
  ImportRow,
  ImportSummary,
} from "@/lib/contacts/import-parser"

// A conversa entre a tela e o worker que lê a planilha. O arquivo inteiro fica lá: aqui só chegam o
// resumo e o que a tela mostra, e é isso que deixa um arquivo de centenas de milhares de linhas sem
// travar nada.

export type ImportContact = {
  userName: string
  externalId: string
  contactMetadata?: Record<string, string>
}

export type ColumnChoice = { name: string | null; phone: string | null }

export type ImportVariable = { column: string; key: string }

export type WorkerRequest =
  | { id: number; type: "read"; file: File }
  | { id: number; type: "load"; headers: string[]; rows: ImportRow[] }
  | { id: number; type: "map"; columns: ColumnChoice; includeCountryCode: boolean }
  | { id: number; type: "batch"; offset: number; size: number }

export type ParsedSummary = {
  fileType: "csv" | "json" | null
  headers: string[]
  rowCount: number
  issues: ImportIssue[]
  suggested: ColumnChoice
}

export type MappedSummary = {
  summary: ImportSummary
  /** As primeiras linhas, para reconhecer o arquivo. */
  sample: ImportPreviewRow[]
  /** As primeiras que ficam de fora, com o motivo. */
  ignored: ImportPreviewRow[]
  variables: ImportVariable[]
}

export type WorkerResponse =
  | { id: number; type: "progress"; phase: "reading" | "organizing"; fraction: number | null }
  | { id: number; type: "parsed"; result: ParsedSummary }
  | { id: number; type: "mapped"; result: MappedSummary }
  | { id: number; type: "batch"; contacts: ImportContact[] }
  | { id: number; type: "error"; code: string }
