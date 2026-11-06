import { isValidPhone, onlyDigits } from "@/lib/format-phone"

// Ler uma planilha de contatos no navegador, para a pessoa mapear as colunas e conferir antes
// de enviar qualquer coisa. Veio de `importParser.ts`, da origem, com o que faltava lá: aspas
// com quebra de linha dentro, BOM do Excel e arquivo em Latin-1, que é como o Excel em
// português salva CSV. Módulo sem idioma: devolve códigos, e a tela traduz.

export type ImportRow = Record<string, string>
export type ImportFileType = "csv" | "json"

export type ImportIssueCode =
  | "empty"
  | "unknownFormat"
  | "headerOnly"
  | "noData"
  | "jsonNotArray"
  | "jsonEmpty"
  | "jsonInvalid"
  | "jsonItemInvalid"

export type ImportIssue = { code: ImportIssueCode; line?: number }

export type ParsedImport = {
  fileType: ImportFileType | null
  headers: string[]
  rows: ImportRow[]
  issues: ImportIssue[]
}

/* ---------- leitura ---------- */

/**
 * UTF-8, com ou sem BOM. O que não for UTF-8 válido é Windows-1252: é o que o Excel em
 * português salva, e lê-lo como UTF-8 transformaria "João" em "Jo�o" sem dar erro nenhum.
 */
export function decodeImportFile(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(buffer)
  } catch {
    return new TextDecoder("windows-1252").decode(buffer)
  }
}

export async function readImportFile(file: File): Promise<ParsedImport> {
  return parseImport(decodeImportFile(await file.arrayBuffer()))
}

function looksLikeJson(content: string): boolean {
  const trimmed = content.trim()
  const pair =
    (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
    (trimmed.startsWith("{") && trimmed.endsWith("}"))
  return pair
}

/** Pelo conteúdo, e não pela extensão: o Mac e o Windows não concordam nem no MIME do CSV. */
export function parseImport(content: string): ParsedImport {
  if (!content.trim()) {
    return { fileType: null, headers: [], rows: [], issues: [{ code: "empty" }] }
  }
  if (looksLikeJson(content)) return parseJson(content)
  if (/[\r\n]/.test(content.trim())) return parseCsv(content)

  return { fileType: null, headers: [], rows: [], issues: [{ code: "unknownFormat" }] }
}

/* ---------- JSON ---------- */

export function parseJson(text: string): ParsedImport {
  const result: ParsedImport = { fileType: "json", headers: [], rows: [], issues: [] }

  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    result.issues.push({ code: "jsonInvalid" })
    return result
  }

  if (!Array.isArray(data)) {
    result.issues.push({ code: "jsonNotArray" })
    return result
  }
  if (data.length === 0) {
    result.issues.push({ code: "jsonEmpty" })
    return result
  }

  const headers = new Set<string>()
  const items: Record<string, unknown>[] = []
  data.forEach((item: unknown, index) => {
    if (typeof item === "object" && item !== null && !Array.isArray(item)) {
      Object.keys(item).forEach((key) => headers.add(key))
      items.push(item as Record<string, unknown>)
    } else {
      result.issues.push({ code: "jsonItemInvalid", line: index + 1 })
    }
  })

  result.headers = [...headers]
  if (result.headers.length === 0) {
    result.issues.push({ code: "noData" })
    return result
  }

  result.rows = items.map((item) => {
    const row: ImportRow = {}
    for (const header of result.headers) {
      const value = item[header]
      row[header] = value === null || value === undefined ? "" : String(value)
    }
    return row
  })

  return result
}

/* ---------- CSV ---------- */

const DELIMITERS = [",", ";", "\t", "|"]

/** O separador que mais aparece na primeira linha, fora de aspas. */
export function detectDelimiter(text: string): string {
  const counts = new Map(DELIMITERS.map((delimiter) => [delimiter, 0]))
  let quoted = false

  for (const char of text) {
    if (char === '"') quoted = !quoted
    else if (!quoted && (char === "\n" || char === "\r")) break
    else if (!quoted && counts.has(char)) counts.set(char, (counts.get(char) ?? 0) + 1)
  }

  let best = ","
  let max = 0
  for (const [delimiter, count] of counts) {
    if (count > max) {
      max = count
      best = delimiter
    }
  }
  return best
}

/**
 * Todas as linhas de uma vez, caractere a caractere. Partir em `\n` antes de olhar as aspas,
 * como a origem fazia, quebra uma observação de duas linhas em dois contatos.
 */
function splitCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false

  const endCell = () => {
    row.push(cell.trim())
    cell = ""
  }
  const endRow = () => {
    endCell()
    if (row.some(Boolean)) rows.push(row)
    row = []
  }

  for (let index = 0; index < text.length; index++) {
    const char = text[index]

    if (quoted) {
      if (char !== '"') cell += char
      else if (text[index + 1] === '"') {
        cell += '"'
        index++
      } else quoted = false
    } else if (char === '"') {
      quoted = true
    } else if (char === delimiter) {
      endCell()
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index++
      endRow()
    } else {
      cell += char
    }
  }
  endRow()

  return rows
}

/** Coluna sem nome ou repetida precisa de um rótulo único, ou uma apagaria a outra. */
function uniqueHeaders(raw: string[]): string[] {
  const seen = new Map<string, number>()

  return raw.map((header, index) => {
    const base = header || `#${index + 1}`
    const count = (seen.get(base) ?? 0) + 1
    seen.set(base, count)
    return count === 1 ? base : `${base} (${count})`
  })
}

export function parseCsv(text: string): ParsedImport {
  const result: ParsedImport = { fileType: "csv", headers: [], rows: [], issues: [] }
  const [head, ...lines] = splitCsv(text, detectDelimiter(text))

  if (!head) {
    result.issues.push({ code: "empty" })
    return result
  }
  if (lines.length === 0) {
    result.issues.push({ code: "headerOnly" })
    return result
  }

  result.headers = uniqueHeaders(head)
  result.rows = lines.map((line) => {
    const row: ImportRow = {}
    result.headers.forEach((header, index) => {
      row[header] = line[index] ?? ""
    })
    return row
  })

  return result
}

/* ---------- colunas ---------- */

export type ImportMapping = {
  name: string | null
  phone: string | null
  assignee: string | null
  department: string | null
}

export const EMPTY_MAPPING: ImportMapping = {
  name: null,
  phone: null,
  assignee: null,
  department: null,
}

function normalizeHeader(header: string): string {
  return header
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
}

function findHeader(
  headers: string[],
  patterns: string[],
  taken: (string | null)[] = []
): string | null {
  const free = headers.filter((header) => !taken.includes(header))
  for (const pattern of patterns) {
    const found = free.find((header) => normalizeHeader(header).includes(pattern))
    if (found) return found
  }
  return null
}

/**
 * Sugere as colunas pelo nome. Responsável e departamento vêm primeiro: `assigned_user_name`
 * e `department_name` também contêm "name", e levariam a coluna do nome do contato.
 */
export function suggestMapping(headers: string[]): ImportMapping {
  const assignee = findHeader(headers, [
    "responsavel",
    "atendente",
    "assigned",
    "operador",
    "agent",
  ])
  const department = findHeader(headers, ["departamento", "department", "setor", "equipe", "team"])
  const phone = findHeader(
    headers,
    [
      "phone_number",
      "formatted_phone",
      "external_id",
      "telefone",
      "phone",
      "celular",
      "whatsapp",
      "numero",
      "fone",
    ],
    [assignee, department]
  )
  const name = findHeader(
    headers,
    ["saved_name", "public_name", "user_name", "nome", "name", "usuario"],
    [assignee, department, phone]
  )

  return { name, phone, assignee, department }
}

/* ---------- conferência ---------- */

const PHONE_CHARACTERS = /^[\d\s\-().+]+$/

/**
 * Acrescenta o 55 a um telefone brasileiro (só dígitos).
 *
 * Número nacional é DDD (2) + assinante (8 ou 9): 10 ou 11 dígitos, e 12 ou 13 com o país. Por
 * isso "começa com 55" não basta: o DDD 55 (RS) também começa assim, e `5592199570`, com 10
 * dígitos, precisa virar `555592199570`.
 */
export function withBrazilCountryCode(digits: string): string {
  const hasCountryCode = digits.startsWith("55") && digits.length >= 12
  return hasCountryCode ? digits : `55${digits}`
}

/**
 * O número final, ou `null` se não dá para ser telefone. Quem escreveu `+` já disse o país: um
 * número de fora não pode ganhar o 55.
 */
export function normalizeImportPhone(raw: string, includeCountryCode: boolean): string | null {
  const value = raw.trim().replace(/@.*$/, "")
  if (!PHONE_CHARACTERS.test(value)) return null

  const digits = onlyDigits(value)
  const explicit = value.startsWith("+")
  const final = includeCountryCode && !explicit ? withBrazilCountryCode(digits) : digits

  // Sem o código do país, número nacional de 10 ou 11 dígitos também passa pela faixa do E.164.
  return isValidPhone(final) && final.length >= 10 ? final : null
}

export type ImportRowIssue = "missingName" | "missingPhone" | "invalidPhone" | "duplicate"

export type ImportPreviewRow = {
  /** A linha do arquivo, como a pessoa a acha na planilha. */
  line: number
  name: string
  phone: string
  /** O número que vai ser enviado. Vazio se a linha fica de fora. */
  finalPhone: string
  assignee: string
  department: string
  issue: ImportRowIssue | null
  /** As primeiras colunas como vieram, para reconhecer a linha. */
  original: string
}

const ORIGINAL_COLUMNS = 3

function originalOf(row: ImportRow): string {
  const entries = Object.entries(row)
  const shown = entries
    .slice(0, ORIGINAL_COLUMNS)
    .map(([key, value]) => `${key}: ${value}`)
    .join(", ")
  return entries.length > ORIGINAL_COLUMNS ? `${shown}…` : shown
}

export function buildPreview(
  parsed: Pick<ParsedImport, "rows" | "fileType">,
  mapping: ImportMapping,
  includeCountryCode: boolean
): ImportPreviewRow[] {
  const seen = new Set<string>()
  // No CSV a primeira linha é o cabeçalho.
  const firstLine = parsed.fileType === "csv" ? 2 : 1

  return parsed.rows.map((row, index) => {
    const name = (mapping.name ? row[mapping.name] : "")?.trim() ?? ""
    const phone = (mapping.phone ? row[mapping.phone] : "")?.trim() ?? ""
    const finalPhone = phone ? normalizeImportPhone(phone, includeCountryCode) : null

    let issue: ImportRowIssue | null = null
    if (!phone) issue = "missingPhone"
    else if (!finalPhone) issue = "invalidPhone"
    else if (!name) issue = "missingName"
    else if (seen.has(finalPhone)) issue = "duplicate"

    if (!issue && finalPhone) seen.add(finalPhone)

    return {
      line: index + firstLine,
      name,
      phone,
      finalPhone: issue ? "" : (finalPhone ?? ""),
      assignee: (mapping.assignee ? row[mapping.assignee] : "")?.trim() ?? "",
      department: (mapping.department ? row[mapping.department] : "")?.trim() ?? "",
      issue,
      original: originalOf(row),
    }
  })
}

export type ImportSummary = {
  total: number
  ready: number
  ignored: number
  missingName: number
  missingPhone: number
  invalidPhone: number
  duplicate: number
}

export function summarizePreview(rows: ImportPreviewRow[]): ImportSummary {
  const summary: ImportSummary = {
    total: rows.length,
    ready: 0,
    ignored: 0,
    missingName: 0,
    missingPhone: 0,
    invalidPhone: 0,
    duplicate: 0,
  }

  for (const row of rows) {
    if (row.issue) {
      summary.ignored++
      summary[row.issue]++
    } else {
      summary.ready++
    }
  }
  return summary
}

/* ---------- envio ---------- */

/** `ContactImportsController::BATCH_SIZE`. */
export const IMPORT_BATCH_SIZE = 1000

export type ImportContactPayload = {
  externalId: string
  userName: string
  assignedUserName?: string
  departmentName?: string
}

export function toImportContacts(rows: ImportPreviewRow[]): ImportContactPayload[] {
  return rows
    .filter((row) => !row.issue)
    .map((row) => ({
      externalId: row.finalPhone,
      userName: row.name,
      ...(row.assignee ? { assignedUserName: row.assignee } : {}),
      ...(row.department ? { departmentName: row.department } : {}),
    }))
}

export function chunk<T>(list: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < list.length; index += size) {
    chunks.push(list.slice(index, index + size))
  }
  return chunks
}
