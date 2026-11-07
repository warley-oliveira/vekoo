/// <reference lib="webworker" />

import {
  EMPTY_MAPPING,
  buildPreview,
  decodeImportFile,
  parseImport,
  suggestMapping,
  summarizePreview,
  type ImportFileType,
  type ImportPreviewRow,
  type ImportRow,
} from "@/lib/contacts/import-parser"
import type {
  ColumnChoice,
  ImportContact,
  ImportVariable,
  WorkerRequest,
  WorkerResponse,
} from "./import-protocol"
import { variablesFromColumns } from "./variables"

// Lê, confere e fatia a planilha fora da thread da tela. A leitura é a mesma da importação de contatos
// (`lib/contacts/import-parser`): aspas com quebra de linha, BOM e arquivo em Latin-1 do Excel.

const SAMPLE_ROWS = 5
const IGNORED_ROWS = 50
const scope = self as unknown as DedicatedWorkerGlobalScope

let rows: ImportRow[] = []
let fileType: ImportFileType | null = null
let headers: string[] = []
let ready: { row: ImportRow; preview: ImportPreviewRow }[] = []
let variables: ImportVariable[] = []

function reply(message: WorkerResponse) {
  scope.postMessage(message)
}

/** Aos pedaços, para dizer quanto já foi: o `arrayBuffer()` de um arquivo grande é um salto mudo. */
async function readBytes(id: number, file: File): Promise<ArrayBuffer> {
  if (file.size === 0) return new ArrayBuffer(0)

  const reader = file.stream().getReader()
  const buffer = new Uint8Array(file.size)
  let loaded = 0
  let reported = 0

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer.set(value, loaded)
    loaded += value.length

    if (loaded - reported > file.size / 50) {
      reported = loaded
      reply({ id, type: "progress", phase: "reading", fraction: loaded / file.size })
    }
  }
  return buffer.buffer
}

function reset(nextHeaders: string[], nextRows: ImportRow[], nextType: ImportFileType | null) {
  headers = nextHeaders
  rows = nextRows
  fileType = nextType
  ready = []
  variables = []
}

function suggested(): ColumnChoice {
  const mapping = suggestMapping(headers)
  return { name: mapping.name, phone: mapping.phone }
}

async function read(id: number, file: File) {
  const content = decodeImportFile(await readBytes(id, file))
  reply({ id, type: "progress", phase: "organizing", fraction: null })

  const parsed = parseImport(content)
  reset(parsed.headers, parsed.rows, parsed.fileType)
  reply({
    id,
    type: "parsed",
    result: {
      fileType,
      headers,
      rowCount: rows.length,
      issues: parsed.issues,
      suggested: suggested(),
    },
  })
}

function map(id: number, columns: ColumnChoice, includeCountryCode: boolean) {
  const preview = buildPreview(
    { rows, fileType },
    { ...EMPTY_MAPPING, name: columns.name, phone: columns.phone },
    includeCountryCode
  )
  const others = headers.filter((header) => header !== columns.name && header !== columns.phone)

  variables = variablesFromColumns(others)
  ready = []
  const ignored: ImportPreviewRow[] = []

  preview.forEach((row, index) => {
    if (!row.issue) ready.push({ row: rows[index], preview: row })
    else if (ignored.length < IGNORED_ROWS) ignored.push(row)
  })

  reply({
    id,
    type: "mapped",
    result: {
      summary: summarizePreview(preview),
      sample: preview.slice(0, SAMPLE_ROWS),
      ignored,
      variables,
    },
  })
}

function batch(id: number, offset: number, size: number) {
  const contacts = ready.slice(offset, offset + size).map(({ row, preview }): ImportContact => {
    const metadata: Record<string, string> = {}
    for (const { column, key } of variables) {
      const value = row[column]?.trim()
      if (value) metadata[key] = value
    }

    return {
      userName: preview.name,
      externalId: preview.finalPhone,
      ...(Object.keys(metadata).length > 0 ? { contactMetadata: metadata } : {}),
    }
  })

  reply({ id, type: "batch", contacts })
}

scope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data

  try {
    switch (request.type) {
      case "read":
        await read(request.id, request.file)
        break
      case "load":
        reset(request.headers, request.rows, "csv")
        reply({
          id: request.id,
          type: "parsed",
          result: {
            fileType,
            headers,
            rowCount: rows.length,
            issues: [],
            suggested: suggested(),
          },
        })
        break
      case "map":
        map(request.id, request.columns, request.includeCountryCode)
        break
      case "batch":
        batch(request.id, request.offset, request.size)
        break
    }
  } catch {
    reply({ id: request.id, type: "error", code: "unknownFormat" })
  }
}
