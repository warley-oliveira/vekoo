// Motores e peças — o lado do cliente do contrato com `GET /engines` e
// `/pieces`. O formulário de criação é **gerado do manifesto**: não existe
// tela por tipo de peça, existe um renderizador por tipo de campo.

export type PieceFormat = "post" | "story"

export type FieldType = "text" | "textList" | "number" | "choice" | "ref" | "image"

export type FieldConstraints = {
  maxLines?: number
  maxCharsPerLine?: number
  maxChars?: number
  maxItems?: number
  min?: number
  max?: number
}

export type ChoiceSource = "palette.backgrounds" | "palette.accents" | "palette.colors"

export type EngineField = {
  id: string
  type: FieldType
  required: boolean
  label: string
  hint?: string
  constraints?: FieldConstraints
  /** Opções fixas (choice). */
  options?: { id: string; label: string }[]
  /** Opções derivadas do Brandcore (choice). */
  source?: ChoiceSource
  /** Tipos de fato aceitos (ref) ou de ativo (image). */
  kinds?: string[]
  default?: string | number
}

export type EngineManifest = {
  id: string
  name: string
  description: string
  formats: PieceFormat[]
  series: boolean
  fields: EngineField[]
}

export type Dimensions = Record<PieceFormat, { width: number; height: number }>

export type EngineCatalog = { engines: EngineManifest[]; dimensions: Dimensions }

export type PieceStatus = "queued" | "rendering" | "ready" | "failed"

export type PieceError = {
  code: string
  message?: string
  field?: string
  factId?: string
  factLabel?: string
}

export type ProvenanceRef = {
  field: string
  factId: string
  kind: string
  label: string
  value: string
  status: string
}

export type Provenance = {
  brandCoreVersion?: number
  brandCoreVersionId?: string | null
  refs?: ProvenanceRef[]
  frames?: number
  renderedAt?: number
}

export type StaleRef = {
  field: string
  factId: string
  label: string
  previous: string
  current: string | null
  reason: "changed" | "pending" | "missing"
}

export type PieceValues = Record<string, string | number | string[] | null | undefined>

export type Piece = {
  id: string
  brandId: string
  engineId: string
  engineName: string
  format: PieceFormat
  title: string
  values: PieceValues
  status: PieceStatus
  error: PieceError | null
  provenance: Provenance
  images: { index: number; url: string }[]
  stale: boolean
  staleRefs: StaleRef[]
  outdated: boolean
  brandCoreVersion: number | null
  renderedAt: number | null
  createdAt: number
  updatedAt: number
}

/* ---------- validação (a mesma de `Engines::Values`) ---------- */

/** Linhas que o texto ocupa: quebras manuais + a automática por largura. */
export function effectiveLines(text: string, perLine?: number): number {
  const lines = text.split("\n")
  return lines.reduce(
    (sum, line) => sum + (perLine ? Math.max(1, Math.ceil(line.trim().length / perLine)) : 1),
    0
  )
}

export type FieldErrorCode =
  | "required"
  | "tooLong"
  | "tooManyLines"
  | "tooManyItems"
  | "notANumber"
  | "tooSmall"
  | "tooLarge"

export function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === "string") return value.trim().length === 0
  if (Array.isArray(value)) return value.filter((item) => String(item).trim()).length === 0
  return false
}

/** Erros por campo, no vocabulário de códigos — a tela traduz. */
export function validateValues(
  manifest: EngineManifest,
  values: PieceValues
): Record<string, FieldErrorCode> {
  const errors: Record<string, FieldErrorCode> = {}
  for (const field of manifest.fields) {
    const value = values[field.id]
    const c = field.constraints ?? {}
    if (isBlank(value)) {
      if (field.required) errors[field.id] = "required"
      continue
    }
    if (field.type === "text") {
      const text = String(value)
      if (c.maxChars && text.length > c.maxChars) errors[field.id] = "tooLong"
      else if (c.maxLines && effectiveLines(text, c.maxCharsPerLine) > c.maxLines) errors[field.id] = "tooManyLines"
    } else if (field.type === "textList") {
      const items = (value as string[]).filter((item) => item.trim())
      if (c.maxItems && items.length > c.maxItems) errors[field.id] = "tooManyItems"
      else if (c.maxChars && items.some((item) => item.length > c.maxChars!)) errors[field.id] = "tooLong"
    } else if (field.type === "number") {
      const number = Number(value)
      if (Number.isNaN(number)) errors[field.id] = "notANumber"
      else if (c.min !== undefined && number < c.min) errors[field.id] = "tooSmall"
      else if (c.max !== undefined && number > c.max) errors[field.id] = "tooLarge"
    }
  }
  return errors
}

/** Valores de partida: os defaults do manifesto. */
export function defaultValues(manifest: EngineManifest): PieceValues {
  const values: PieceValues = {}
  for (const field of manifest.fields) {
    if (field.default !== undefined) values[field.id] = field.default
    else if (field.type === "textList") values[field.id] = []
    else values[field.id] = ""
  }
  return values
}

/** Só o que tem valor — é isso que vai para a API. */
export function compactValues(values: PieceValues): PieceValues {
  const out: PieceValues = {}
  for (const [key, value] of Object.entries(values)) {
    if (isBlank(value)) continue
    out[key] = Array.isArray(value) ? value.filter((item) => item.trim()) : value
  }
  return out
}

export function pieceHref(brandId: string, id: string): string {
  return `/brands/${brandId}/contents/${id}`
}

export function newPieceHref(brandId: string, engineId: string): string {
  return `/brands/${brandId}/create/${engineId}`
}

/** A mensagem de uma falha de geração, no vocabulário de códigos — a tela passa o `t`. */
export function pieceErrorMessage(
  t: (key: string, options?: Record<string, unknown>) => string,
  piece: Piece
): string {
  const error = piece.error
  if (!error) return t("pieces.errors.unknown")
  const known = ["refPending", "refMissing", "brandNotPublished", "valuesInvalid", "renderFailed", "engineUnknown", "formatUnsupported"]
  if (!known.includes(error.code)) return t("pieces.errors.unknown")
  return t(`pieces.errors.${error.code}`, { fact: error.factLabel ?? error.factId ?? "" })
}
