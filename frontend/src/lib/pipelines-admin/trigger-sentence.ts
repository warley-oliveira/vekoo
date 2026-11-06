import { formatNumber } from "@/lib/format-number"
import { conditionKind, operatorTakesValue } from "./trigger-catalog"
import type { ActionDraft, ConditionDraft, TriggerDraft } from "./trigger-form"
import type { TriggerEvent } from "./types"

// Um gatilho lido em voz alta: "Quando um card entrar em Proposta, se a prioridade for alta, avisar o
// responsável." Cada pedaço é uma chave de tradução com valores: quem desenha põe o negrito (`<b>`
// no texto), e quem precisa de texto puro, como o nome sugerido, tira as marcas.

export type Phrase = { key: string; values?: Record<string, unknown> }

export type SentenceLookups = {
  language: string
  stageName: (id: string | null | undefined) => string | null
  personName: (id: string | null | undefined) => string | null
  boardName: (id: string | null | undefined) => string | null
  priorityLabel: (value: string) => string
  /** Junta nomes: "Juliana e Rafael". */
  list: (items: string[]) => string
  /** Rótulo em prosa de um campo: "a prioridade", "o valor do negócio". */
  conditionField: (key: string) => string
  conditionOperator: (operator: string) => string
  period: (time: number, period: string) => string
}

const BASE = "pipelinesAdmin.triggers.sentence"

export function eventPhrase(
  eventType: TriggerEvent,
  stageId: string | null,
  lookups: Pick<SentenceLookups, "stageName">
): Phrase {
  const stage = lookups.stageName(stageId)
  return stage
    ? { key: `${BASE}.events.${eventType}.stage`, values: { stage } }
    : { key: `${BASE}.events.${eventType}.any` }
}

export function conditionPhrase(condition: ConditionDraft, lookups: SentenceLookups): Phrase {
  const field = lookups.conditionField(condition.key)
  const operator = lookups.conditionOperator(condition.operator)

  if (!operatorTakesValue(condition.operator)) {
    return { key: `${BASE}.conditionNoValue`, values: { field, operator } }
  }

  return {
    key: `${BASE}.condition`,
    values: { field, operator, value: conditionValueLabel(condition, lookups) },
  }
}

function conditionValueLabel(condition: ConditionDraft, lookups: SentenceLookups): string {
  const { key, value } = condition
  switch (conditionKind(key)) {
    case "priority":
      return value ? lookups.priorityLabel(value) : "…"
    case "stage":
      return lookups.stageName(value) ?? "…"
    case "person":
      return lookups.personName(value) ?? "…"
    default:
      return value || "…"
  }
}

function hostOf(url: string | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).host
  } catch {
    return null
  }
}

export function actionPhrase(action: ActionDraft, lookups: SentenceLookups): Phrase {
  const key = `${BASE}.actions.${action.type}`
  const people = () =>
    (action.accountIds ?? []).map((id) => lookups.personName(id)).filter((name): name is string => Boolean(name))

  switch (action.type) {
    case "notify": {
      const names = action.audience === "people" || action.accountIds?.length ? people() : []
      return names.length > 0
        ? { key: `${key}.people`, values: { people: lookups.list(names) } }
        : { key: `${key}.default` }
    }
    case "move_card": {
      const stage = lookups.stageName(action.stageId)
      return stage ? { key: `${key}.stage`, values: { stage } } : { key: `${key}.any` }
    }
    case "assign_user": {
      const names = people()
      if (names.length === 0) return { key: `${key}.none` }
      return names.length === 1
        ? { key: `${key}.one`, values: { people: names[0] } }
        : { key: `${key}.many`, values: { people: lookups.list(names) } }
    }
    case "send_whatsapp_message":
    case "send_whatsapp_template":
      return action.target === "specific" && action.specificPhone
        ? { key: `${key}.phone`, values: { phone: action.specificPhone } }
        : { key: `${key}.contact` }
    case "toggle_automation":
      return action.automationStatus === "enabled"
        ? { key: `${key}.enabled` }
        : {
            key: `${key}.disabled`,
            values: { duration: lookups.period(action.disableTime ?? 1, action.disablePeriod ?? "hours") },
          }
    case "create_card": {
      const board = lookups.boardName(action.targetBoardId)
      return board ? { key: `${key}.board`, values: { board } } : { key: `${key}.any` }
    }
    case "fire_webhook": {
      const host = hostOf(action.url)
      return host ? { key: `${key}.host`, values: { host } } : { key: `${key}.any` }
    }
    case "run_code":
      return { key }
    default:
      return { key: `${BASE}.actions.unknown` }
  }
}

export type TriggerSentenceParts = {
  event: Phrase
  conditions: Phrase[]
  actions: Phrase[]
}

export function sentenceParts(draft: Pick<TriggerDraft, "eventType" | "stageId" | "conditions" | "actions">, lookups: SentenceLookups): TriggerSentenceParts {
  return {
    event: eventPhrase(draft.eventType, draft.stageId, lookups),
    conditions: draft.conditions.map((condition) => conditionPhrase(condition, lookups)),
    actions: draft.actions.map((action) => actionPhrase(action, lookups)),
  }
}

/** A frase em texto puro, para o nome sugerido e para a busca. */
export function plainSentence(
  parts: TriggerSentenceParts,
  translate: (key: string, values?: Record<string, unknown>) => string,
  lookups: Pick<SentenceLookups, "list">
): string {
  const plain = ({ key, values }: Phrase) => translate(key, values).replace(/<\/?b>/g, "")
  const conditions = parts.conditions.length
    ? translate(`${BASE}.ifPrefix`, { conditions: lookups.list(parts.conditions.map(plain)) })
    : ""
  const actions = lookups.list(parts.actions.map(plain))
  return translate(`${BASE}.whole`, { event: plain(parts.event), conditions, actions }).replace(/\s+/g, " ")
}

/** "2 horas", "30 minutos", pelo `Intl`. */
export function formatPeriod(time: number, period: string, language: string): string {
  const unit = period === "minutes" ? "minute" : period === "days" ? "day" : "hour"
  return formatNumber(time, language, { style: "unit", unit, unitDisplay: "long" })
}
