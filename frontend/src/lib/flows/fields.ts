import { slugify } from "./outputs"
import type { BlockData, DefinitionNode, FlowDefinition, FlowField, FlowFieldType } from "./types"

// Os dados que o fluxo coleta ("Dados da conversa"): cadastrados uma vez no fluxo
// (`definition.fields`) e referenciados pelos blocos que os preenchem, as saídas do bloco de IA
// (`outputs[].parameters`) e "Anotar dados" (`fields`). O motor grava o valor em cada conversa e só
// aceita chaves neste formato (`FlowRuntime::ChatData`).

export const FIELD_TYPES: FlowFieldType[] = ["string", "integer", "number", "boolean", "array"]

const KEY_FORMAT = /^[a-z][a-z0-9_]{0,63}$/

export const isValidFieldKey = (key: string) => KEY_FORMAT.test(key)

export function fieldKeyFromLabel(label: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  const base = slugify(label, "campo")
  let candidate = base
  for (let n = 2; used.has(candidate); n += 1) candidate = `${base}_${n}`
  return candidate
}

/** Como um bloco guarda a referência a um campo. Tipo e descrição vão para a IA. */
export type FieldRef = {
  name: string
  type?: string
  description?: string
  required?: boolean
}

type OutputWithParameters = { id?: string; parameters?: FieldRef[] }

const outputsOf = (data: BlockData | undefined): OutputWithParameters[] =>
  Array.isArray(data?.outputs) ? (data.outputs as OutputWithParameters[]) : []

const extractorFieldsOf = (data: BlockData | undefined): FieldRef[] =>
  Array.isArray(data?.fields) ? (data.fields as FieldRef[]) : []

function humanize(key: string) {
  const text = key.replace(/_/g, " ").trim()
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : key
}

/**
 * Ao abrir: garante o cadastro. Definição que declarou os dados direto nas saídas (um modelo, por
 * exemplo) passa a ter o campo cadastrado, e nada é descartado no próximo salvamento.
 */
export function prepareDefinition(definition: FlowDefinition): FlowDefinition {
  const fields: FlowField[] = (definition.fields ?? []).filter((field) => isValidFieldKey(field.key))
  const byKey = new Map(fields.map((field) => [field.key, field]))
  const renamed = new Map<string, string>()

  const register = (ref: FieldRef): string => {
    const raw = (ref.name ?? "").trim()
    if (!raw) return ""
    const known = renamed.get(raw)
    if (known) return known
    const key = isValidFieldKey(raw) ? raw : fieldKeyFromLabel(raw, byKey.keys())
    renamed.set(raw, key)
    if (!byKey.has(key)) {
      const field: FlowField = {
        key,
        label: isValidFieldKey(raw) ? humanize(raw) : raw,
        type: (ref.type as FlowFieldType) ?? "string",
        description: ref.description ?? "",
      }
      fields.push(field)
      byKey.set(key, field)
    }
    return key
  }

  const nodes = (definition.nodes ?? []).map((node) => {
    if (node.type === "ai_assistant" && outputsOf(node.data).some((output) => output.parameters?.length)) {
      const outputs = outputsOf(node.data).map((output) => ({
        ...output,
        parameters: output.parameters
          ?.map((parameter) => ({ ...parameter, name: register(parameter) }))
          .filter((parameter) => parameter.name),
      }))
      return { ...node, data: { ...node.data, outputs } }
    }
    if (node.type === "ai_parameter_extractor" && extractorFieldsOf(node.data).length) {
      const refs = extractorFieldsOf(node.data)
        .map((field) => ({ ...field, name: register(field) }))
        .filter((field) => field.name)
      return { ...node, data: { ...node.data, fields: refs } }
    }
    return node
  })

  return { ...definition, nodes, fields }
}

/**
 * Ao salvar: cada referência passa a refletir o cadastro (tipo e descrição, que a API envia à IA), e
 * referência a campo que saiu do cadastro sai junto.
 */
export function syncFieldRefs(nodes: DefinitionNode[], fields: FlowField[]): DefinitionNode[] {
  const byKey = new Map(fields.map((field) => [field.key, field]))
  const sync = (refs: FieldRef[]) =>
    refs
      .filter((ref) => byKey.has(ref.name))
      .map((ref) => {
        const field = byKey.get(ref.name) as FlowField
        return { ...ref, type: field.type, description: field.description || field.label }
      })

  return nodes.map((node) => {
    if (node.type === "ai_assistant" && outputsOf(node.data).length) {
      const outputs = outputsOf(node.data).map((output) =>
        output.parameters ? { ...output, parameters: sync(output.parameters) } : output
      )
      return { ...node, data: { ...node.data, outputs } }
    }
    if (node.type === "ai_parameter_extractor") {
      return { ...node, data: { ...node.data, fields: sync(extractorFieldsOf(node.data)) } }
    }
    return node
  })
}

/** Quantos blocos usam cada campo, para avisar antes de excluir. */
export function fieldUsage(nodes: { type?: string; data?: BlockData }[]): Map<string, number> {
  const usage = new Map<string, number>()
  nodes.forEach((node) => {
    const keys = new Set<string>()
    if (node.type === "ai_assistant") {
      outputsOf(node.data).forEach((output) => output.parameters?.forEach((parameter) => keys.add(parameter.name)))
    }
    if (node.type === "ai_parameter_extractor") {
      extractorFieldsOf(node.data).forEach((field) => keys.add(field.name))
    }
    keys.forEach((key) => usage.set(key, (usage.get(key) ?? 0) + 1))
  })
  return usage
}
