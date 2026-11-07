import type { FunctionParameter, ParameterType } from "./types"
import { PARAMETER_TYPES } from "./types"

// As regras dos parâmetros de uma função, fora da tela. Sem texto: os erros saem como códigos, e quem mostra traduz.

export const FUNCTION_NAME_PATTERN = /^[a-z0-9_]{1,64}$/
export const PARAMETER_NAME_PATTERN = /^[a-zA-Z0-9_]+$/

function withoutAccents(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "")
}

/** `Consultar CEP` vira `consultar_cep`: é assim que a API guarda, e é o que o modelo vê. */
export function toFunctionName(value: string): string {
  return withoutAccents(value)
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
}

/** Mantém a caixa: `params.cepOrigem` é um nome válido, e funções do catálogo usam. */
export function toParameterName(value: string): string {
  return withoutAccents(value)
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_]/g, "")
}

export function newParameter(prefix: string, position: number): FunctionParameter {
  return { name: `${prefix}_${position + 1}`, type: "string", description: "", required: false }
}

/** Quantos campos há dentro de um objeto ou de uma lista de objetos. */
export function nestedCount(parameter: FunctionParameter): number {
  if (parameter.type === "object") return parameter.properties?.length ?? 0
  if (parameter.type === "array" && parameter.itemsType === "object") return parameter.itemsProperties?.length ?? 0
  return 0
}

/** Trocar o tipo não pode deixar para trás o que só valia no anterior. */
export function changeType(parameter: FunctionParameter, type: ParameterType): FunctionParameter {
  const next: FunctionParameter = { ...parameter, type }
  if (type !== "object") delete next.properties
  if (type !== "array") {
    delete next.itemsType
    delete next.itemsProperties
    delete next.minItems
  } else {
    next.itemsType = next.itemsType ?? "string"
  }
  if (type !== "string") delete next.enum
  return next
}

/* ---------- Importar ---------- */

export type ImportErrorCode = "invalidJson" | "unknownFormat" | "empty"

export class ParametersImportError extends Error {
  readonly code: ImportErrorCode
  constructor(code: ImportErrorCode) {
    super(code)
    this.code = code
  }
}

type SchemaProperty = {
  type?: string
  description?: string
  enum?: string[]
  items?: SchemaProperty
  properties?: Record<string, SchemaProperty>
  required?: string[]
}

function knownType(type: unknown): ParameterType {
  return PARAMETER_TYPES.includes(type as ParameterType) ? (type as ParameterType) : "string"
}

function fromSchema(properties: Record<string, SchemaProperty>, required: string[] = []): FunctionParameter[] {
  const mandatory = new Set(required)
  return Object.entries(properties).map(([name, property]) => {
    const parameter: FunctionParameter = {
      name,
      type: knownType(property.type),
      description: property.description ?? "",
      required: mandatory.has(name),
    }
    if (property.enum?.length) parameter.enum = property.enum
    if (property.type === "object" && property.properties) {
      parameter.properties = fromSchema(property.properties, property.required)
    }
    if (property.type === "array" && property.items) {
      parameter.itemsType = knownType(property.items.type)
      if (property.items.type === "object" && property.items.properties) {
        parameter.itemsProperties = fromSchema(property.items.properties, property.items.required)
      }
    }
    return parameter
  })
}

function fromList(list: unknown[]): FunctionParameter[] {
  return list.map((raw) => {
    const item = (raw ?? {}) as Record<string, unknown>
    const parameter: FunctionParameter = {
      name: String(item.name ?? ""),
      type: knownType(item.type),
      description: String(item.description ?? ""),
      required: Boolean(item.required),
    }
    if (Array.isArray(item.enum)) parameter.enum = item.enum.map(String)
    if (item.itemsType) parameter.itemsType = knownType(item.itemsType)
    if (typeof item.mockValue === "string") parameter.mockValue = item.mockValue
    if (Array.isArray(item.properties)) parameter.properties = fromList(item.properties)
    if (Array.isArray(item.itemsProperties)) parameter.itemsProperties = fromList(item.itemsProperties)
    return parameter
  })
}

/** Aceita o formato de ferramentas dos modelos (`{ type, properties, required }`) e a lista que a API devolve. */
export function parseParametersJson(text: string): FunctionParameter[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new ParametersImportError("invalidJson")
  }

  let parameters: FunctionParameter[]
  if (Array.isArray(parsed)) {
    parameters = fromList(parsed)
  } else if (parsed && typeof parsed === "object" && "properties" in parsed) {
    const schema = parsed as SchemaProperty
    parameters = fromSchema(schema.properties ?? {}, schema.required)
  } else {
    throw new ParametersImportError("unknownFormat")
  }

  if (parameters.length === 0) throw new ParametersImportError("empty")
  return parameters
}

/* ---------- Valores de teste ---------- */

export type TestValue = { ok: true; value: unknown } | { ok: false }

/** O que se digita é sempre texto: o script recebe o tipo que declarou. */
export function parseTestValue(text: string, type: string): TestValue {
  const trimmed = text.trim()
  if (type === "number" || type === "integer") {
    const value = Number(trimmed)
    return Number.isNaN(value) ? { ok: false } : { ok: true, value }
  }
  if (type === "boolean") {
    if (trimmed === "true") return { ok: true, value: true }
    if (trimmed === "false") return { ok: true, value: false }
    return { ok: false }
  }
  if (type === "array" || type === "object") {
    try {
      const value: unknown = JSON.parse(trimmed)
      const matches =
        type === "array" ? Array.isArray(value) : typeof value === "object" && value !== null && !Array.isArray(value)
      return matches ? { ok: true, value } : { ok: false }
    } catch {
      return { ok: false }
    }
  }
  return { ok: true, value: text }
}

export type TestArgs = { args: Record<string, unknown>; invalid: string[] }

/** Só o que foi preenchido vai: campo em branco é o caso de "e se não vier?", que também se testa. */
export function buildTestArgs(parameters: FunctionParameter[], values: Record<string, string>): TestArgs {
  const args: Record<string, unknown> = {}
  const invalid: string[] = []
  for (const parameter of parameters) {
    const text = values[parameter.name]
    if (text === undefined || text === "") continue
    const parsed = parseTestValue(text, parameter.type)
    if (parsed.ok) args[parameter.name] = parsed.value
    else invalid.push(parameter.name)
  }
  return { args, invalid }
}
