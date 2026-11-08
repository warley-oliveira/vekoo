import type { TFunction } from "i18next"

import { isTrigger } from "./catalog"
import type { BlockData } from "./types"
import { humanizeVariables } from "./variables"

// O resumo em uma linha do bloco: "Envia: Olá, tudo bem?". Mostra o conteúdo, nunca repete o título.
// `missing` diz o que falta preencher, e é o mesmo texto que a conferência de publicar usa.

export type BlockSummary = {
  text?: string
  /** O que falta. Aparece no lugar do resumo, em tom de aviso. */
  missing?: string
}

const str = (value: unknown): string => (value == null ? "" : String(value).trim())
const list = <T = unknown>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : [])

/** A chave do que falta preencher, ou nada. Fonte única: resumo e validação leem daqui. */
export function missingKey(type: string, data: BlockData): string | null {
  const need = (ok: boolean, key: string) => (ok ? null : `flows.missing.${key}`)

  switch (type) {
    case "trigger_keyword":
      return need(list(data.keywords).length > 0, "keywords")
    case "send_text":
    case "ask_question":
      return need(Boolean(str(data.text)), "text")
    case "send_media":
      return need(Boolean(str(data.attachment_id) || str(data.media_url)), "media")
    case "send_template":
      return need(Boolean(str(data.template_name)), "template")
    case "send_interactive":
      if (!str(data.text)) return "flows.missing.text"
      return need(list(data.buttons).length > 0, "buttons")
    case "ai_assistant":
      return need(Boolean(str(data.system_prompt)), "prompt")
    case "ai_intent_classification":
      return need(list(data.outputs).length > 0, "intents")
    case "ai_parameter_extractor":
      return need(list(data.fields).length > 0, "extractFields")
    case "condition": {
      const rules = list<{ field?: string; operator?: string }>(data.rules)
      return need(rules.length > 0 && rules.every((rule) => str(rule.field)), "rules")
    }
    case "switch":
      if (!str(data.field)) return "flows.missing.switchField"
      return need(list(data.cases).length > 0, "cases")
    case "wait":
      return need(Number(data.amount) > 0, "wait")
    case "set_variable":
      return need(
        list<{ name?: string }>(data.assignments).some((item) => str(item.name)),
        "assignments"
      )
    case "loop":
      return need(Boolean(str(data.source)), "loopSource")
    case "add_tag":
    case "remove_tag":
      return need(Boolean(str(data.tag_id) || str(data.tag_name)), "tag")
    case "set_custom_attribute":
      return need(Boolean(str(data.key)), "attributeKey")
    case "assign_agent":
      return need(Boolean(str(data.account_id) || list(data.account_pool).length), "agent")
    case "assign_team":
      return need(Boolean(str(data.team_id)), "team")
    case "set_funnel_stage":
      return need(Boolean(str(data.funnel_id) && str(data.stage_id)), "funnelStage")
    case "pipeline_create_card":
      return need(Boolean(str(data.board_id) && str(data.stage_id)), "boardStage")
    case "pipeline_create_deal":
      return need(Boolean(str(data.stage_id)), "dealStage")
    case "http_request":
      return need(Boolean(str(data.url)), "url")
    case "execute_tool":
      return need(Boolean(str(data.tool_id)), "tool")
    case "goto_flow":
      return need(Boolean(str(data.target_flow_id)), "targetFlow")
    case "pipeline_update_deal":
      return null
    default:
      break
  }

  if (type.startsWith("pipeline_")) {
    const source = data.card_source as { type?: string; node_id?: string; board_id?: string } | null | undefined
    const hasSource = source?.type === "chat" ? Boolean(source.board_id) : Boolean(source?.node_id)
    if (!hasSource) return "flows.missing.cardSource"

    switch (type) {
      case "pipeline_move_card":
        return need(Boolean(str(data.stage_id)), "moveStage")
      case "pipeline_set_custom_field":
        return need(Boolean(str(data.field_key)), "customField")
      case "pipeline_add_label":
        return need(Boolean(str(data.label)), "label")
      case "pipeline_remove_label":
        return need(Boolean(str(data.label_id)), "label")
      case "pipeline_add_comment":
        return need(Boolean(str(data.body)), "comment")
      case "pipeline_add_checklist":
        return need(Boolean(str(data.name)), "checklist")
      default:
        return null
    }
  }

  return null
}

export function blockSummary(type: string, data: BlockData, t: TFunction): BlockSummary {
  const missing = missingKey(type, data)
  if (missing) return { missing: t(missing) }

  const human = (value: unknown) => humanizeVariables(str(value), t)
  const say = (key: string, params?: Record<string, unknown>) => ({
    text: t(`flows.summary.${key}`, params),
  })

  if (isTrigger(type)) {
    if (type === "trigger_keyword") return say("keywords", { words: list(data.keywords).join(", ") })
    return { text: t(`flows.blocks.${type}.description`) }
  }

  switch (type) {
    case "send_text":
      return say("sendText", { text: human(data.text) })
    case "ask_question":
      return say("askQuestion", { text: human(data.text) })
    case "send_interactive":
      return say("interactive", { text: human(data.text), count: list(data.buttons).length })
    case "send_media":
      return say("media", { name: str(data.attachment_name) || str(data.caption) || str(data.media_url) })
    case "send_template":
      return say("template", { name: str(data.template_name) })
    case "ai_assistant":
      return data.mode === "processing" ? say("aiDecide", { text: human(data.system_prompt) }) : say("aiTalk", { text: human(data.system_prompt) })
    case "ai_intent_classification":
      return say("intent", { count: list(data.outputs).length })
    case "ai_sentiment":
      return say("sentiment")
    case "ai_parameter_extractor":
      return say("extract", {
        names: list<{ name?: string }>(data.fields)
          .map((field) => str(field.name).replace(/_/g, " "))
          .join(", "),
      })
    case "ai_audio_transcription":
      return say("transcribe", { name: str(data.save_to) || "last_transcription" })
    case "condition": {
      const rules = list<{ field?: string; operator?: string; value?: string }>(data.rules)
      const [first] = rules
      const description = t("flows.summary.conditionRule", {
        field: fieldLabel(str(first.field), t),
        operator: t(`flows.operators.${first.operator ?? "equals"}`),
        value: UNARY_OPERATORS.has(first.operator ?? "") ? "" : human(first.value),
      }).trim()
      return rules.length > 1
        ? say("conditionMore", { text: description, count: rules.length - 1 })
        : { text: description }
    }
    case "switch":
      return say("switch", { field: human(data.field), count: list(data.cases).length })
    case "wait":
      return say(`wait_${str(data.unit) || "minutes"}`, { count: Number(data.amount) })
    case "wait_for_message":
      return say("waitMessage")
    case "set_variable":
      return say("setVariable", {
        names: list<{ name?: string }>(data.assignments)
          .map((item) => str(item.name))
          .filter(Boolean)
          .join(", "),
      })
    case "loop":
      return say("loop", { source: human(data.source) })
    case "add_tag":
      return say("addTag", { name: str(data.tag_name) })
    case "remove_tag":
      return say("removeTag", { name: str(data.tag_name) })
    case "set_custom_attribute":
      return say("attribute", { key: str(data.key_label) || str(data.key), value: human(data.value) })
    case "assign_agent":
      return str(data.account_name)
        ? say("assignAgent", { name: str(data.account_name) })
        : say("assignPool", { count: list(data.account_pool).length })
    case "assign_team":
      return say("assignTeam", { name: str(data.team_name) })
    case "transfer_to_human":
      return str(data.team_name) || str(data.account_name)
        ? say("transferTo", { name: str(data.account_name) || str(data.team_name) })
        : say("transfer")
    case "finalize_chat":
      return say("finalize")
    case "pause_automation":
      return str(data.period)
        ? say(`pause_${str(data.period)}`, { count: Number(data.amount) || 1 })
        : say("pauseForever")
    case "resume_automation":
      return say("resume")
    case "set_funnel_stage":
      return say("funnelStage", { funnel: str(data.funnel_name), stage: str(data.stage_name) || str(data.stage_id) })
    case "pipeline_create_card":
      return say("createCard", { board: str(data.board_name), stage: str(data.stage_name) || str(data.stage_id) })
    case "pipeline_move_card":
      return say("moveCard", { stage: str(data.stage_name) || str(data.stage_id) })
    case "pipeline_update_card": {
      const filled = UPDATE_CARD_FIELDS.filter((key) => str(data[key])).length
      return say("updateCard", { count: filled })
    }
    case "pipeline_set_custom_field":
      return say("customField", { field: str(data.field_name) || str(data.field_key), value: human(data.value) })
    case "pipeline_mark_won":
      return say("markWon")
    case "pipeline_mark_lost":
      return str(data.reason) ? say("markLostReason", { reason: human(data.reason) }) : say("markLost")
    case "pipeline_reopen_deal":
      return say("reopen")
    case "pipeline_add_label":
      return say("addLabel", { name: human(data.label) })
    case "pipeline_remove_label":
      return say("removeLabel", { name: str(data.label_name) })
    case "pipeline_add_comment":
      return say("comment", { text: human(data.body) })
    case "pipeline_add_checklist":
      return say("checklist", { name: human(data.name), count: list(data.items).length })
    case "pipeline_archive_card":
      return say("archiveCard")
    case "pipeline_create_deal":
      return say("createDeal", { stage: str(data.stage_name) || str(data.stage_id) })
    case "pipeline_update_deal":
      return say("updateDeal")
    case "http_request":
      return { text: `${str(data.method) || "GET"} ${str(data.url)}` }
    case "execute_tool":
      // Sem o nome guardado (fluxo de modelo, ou feito pela API), o id não diz nada a ninguém.
      return say("tool", { name: str(data.tool_name) || t("flows.summary.toolUnnamed") })
    case "goto_flow":
      return say("goto", { name: str(data.target_flow_name) })
    case "catalog_search":
      return str(data.query) ? say("catalogQuery", { query: human(data.query) }) : say("catalog")
    case "end":
      return say("end")
    default:
      return {}
  }
}

export const UNARY_OPERATORS = new Set(["is_empty", "is_not_empty", "exists", "not_exists"])
export const LIST_OPERATORS = new Set(["in", "not_in"])

export const UPDATE_CARD_FIELDS = [
  "title",
  "description",
  "priority",
  "deal_value",
  "deal_probability",
  "company_name",
  "contact_email",
  "contact_phone",
  "due_date",
  "expected_close_date",
]

/** O campo de uma regra, como a pessoa lê: "vars.status" vira "status". */
export function fieldLabel(field: string, t: TFunction): string {
  const key = field.replace(/\./g, "_")
  const known = t(`flows.variables.builtin.${key}`, { defaultValue: "" })
  if (known) return known
  return field.replace(/^vars\./, "").replace(/_/g, " ")
}
