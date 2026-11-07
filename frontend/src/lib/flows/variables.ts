import type { TFunction } from "i18next"

import type { BlockData, FlowField } from "./types"

// As variáveis que dá para usar nos textos: `{{contact.name}}`, `{{vars.x}}`. O motor troca o que
// não existe por vazio, então a tela ajuda a escolher em vez de deixar a pessoa adivinhar o nome.

export type VariableGroup = "contact" | "conversation" | "flow"

export type VariableOption = {
  /** O caminho, sem chaves: `contact.name`. */
  path: string
  /** Como a pessoa lê. */
  label: string
  group: VariableGroup
  /** Quem cria esta variável, quando vem de um bloco. */
  hint?: string
}

const BUILT_IN: { path: string; group: VariableGroup }[] = [
  { path: "contact.name", group: "contact" },
  { path: "contact.phone", group: "contact" },
  { path: "contact.id", group: "contact" },
  { path: "message.text", group: "conversation" },
  { path: "message.role", group: "conversation" },
  { path: "chat.id", group: "conversation" },
  { path: "chat.status", group: "conversation" },
]

export const INTERPOLATION = /\{\{\s*([\w.-]+)\s*\}\}/g

/** Variáveis que os blocos deixam para os seguintes, por tipo de bloco. */
function variablesOf(type: string, data: BlockData): string[] {
  const named = (key: string, fallback?: string) => {
    const value = typeof data[key] === "string" ? (data[key] as string).trim() : ""
    return value || fallback || ""
  }

  switch (type) {
    case "ask_question":
    case "wait_for_message":
      return [named("save_to")]
    case "send_interactive":
      return [named("save_to"), "last_choice"]
    case "set_variable":
      return ((data.assignments as { name?: string }[] | undefined) ?? []).map((item) => item.name ?? "")
    case "http_request":
      return [named("save_response_to"), "last_http_status"]
    case "execute_tool":
      return [named("save_response_to")]
    case "ai_audio_transcription":
      return [named("save_to", "last_transcription")]
    case "ai_intent_classification":
      return ["last_intent"]
    case "ai_sentiment":
      return ["last_sentiment"]
    case "ai_parameter_extractor":
      return ((data.fields as { name?: string }[] | undefined) ?? []).map((item) => item.name ?? "")
    case "loop":
      return [named("loop_variable", "item"), named("index_variable", "index")]
    case "catalog_search": {
      const saved = named("save_to", "catalog_results")
      return [saved, `${saved}_total`]
    }
    case "pipeline_create_card":
      return ["pipeline_card_id", "pipeline_error"]
    case "pipeline_create_deal":
      return ["last_deal_id"]
    default:
      return type.startsWith("pipeline_") ? ["pipeline_error"] : []
  }
}

const KNOWN_VARIABLE_LABELS = new Set([
  "last_choice",
  "last_http_status",
  "last_transcription",
  "last_intent",
  "last_sentiment",
  "pipeline_card_id",
  "pipeline_error",
  "last_deal_id",
  "catalog_results",
  "catalog_results_total",
  "item",
  "index",
])

export type VariableSources = {
  nodes: { type?: string; data?: BlockData }[]
  fields: FlowField[]
  customFields?: { key: string; label: string }[]
}

/** Tudo que o seletor de variáveis oferece neste fluxo. Sai na hora de abrir, nunca a cada tecla. */
export function collectVariables(sources: VariableSources, t: TFunction): VariableOption[] {
  const options: VariableOption[] = BUILT_IN.map(({ path, group }) => ({
    path,
    group,
    label: t(`flows.variables.builtin.${path.replace(".", "_")}`),
  }))

  sources.customFields?.forEach((field) => {
    options.push({
      path: `contact.custom_attributes.${field.key}`,
      group: "contact",
      label: field.label,
    })
  })

  const seen = new Set<string>()
  const add = (name: string, label?: string) => {
    if (!name || seen.has(name)) return
    seen.add(name)
    options.push({
      path: `vars.${name}`,
      group: "flow",
      label:
        label ||
        (KNOWN_VARIABLE_LABELS.has(name) ? t(`flows.variables.known.${name}`) : name.replace(/_/g, " ")),
    })
  }

  sources.fields.forEach((field) => add(field.key, field.label))
  sources.nodes.forEach((node) => {
    if (node.type) variablesOf(node.type, node.data ?? {}).forEach((name) => add(name))
  })

  return options
}

/** "Olá, {{contact.name}}" vira "Olá, ‹Nome do contato›": é assim que o bloco mostra o resumo. */
export function humanizeVariables(text: string, t: TFunction): string {
  return text.replace(INTERPOLATION, (_, path: string) => {
    const key = path.replace(/\./g, "_")
    const builtIn = BUILT_IN.some((variable) => variable.path === path)
    if (builtIn) return `‹${t(`flows.variables.builtin.${key}`)}›`
    const last = path.split(".").pop() ?? path
    return `‹${last.replace(/_/g, " ")}›`
  })
}

/** O nome de uma variável como o motor aceita. */
export function toVariableName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^[_0-9]+/, "")
    .slice(0, 64)
}
