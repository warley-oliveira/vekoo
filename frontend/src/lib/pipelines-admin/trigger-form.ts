import { z } from "zod"

import {
  MAX_CODE_LENGTH,
  MAX_CODE_TIMEOUT_MS,
  MIN_CODE_TIMEOUT_MS,
  conditionKind,
  operatorTakesValue,
} from "./trigger-catalog"
import type {
  Board,
  ConditionOperator,
  Trigger,
  TriggerAction,
  TriggerActionType,
  TriggerConditions,
  TriggerEvent,
  TriggerExecution,
  TriggerInput,
} from "./types"
import { CONDITION_OPERATORS, TRIGGER_ACTION_TYPES, TRIGGER_EVENTS } from "./types"

// O gatilho como o formulário o enxerga, e a volta para o formato da API. Módulo sem idioma: o que
// aparece na tela vem de chaves.

export type ConditionDraft = {
  key: string
  operator: ConditionOperator
  value: string
}

export type HeaderDraft = { name: string; value: string }

/** O que a tela não conhece continua no objeto e volta para a API como veio. */
export type ActionDraft = Omit<TriggerAction, "headers"> & {
  /** `notify`: para quem vai. Sem pessoas escolhidas, o responsável e quem acompanha. */
  audience?: "default" | "people"
  headersList?: HeaderDraft[]
}

export type TriggerDraft = {
  name: string
  eventType: TriggerEvent
  stageId: string | null
  active: boolean
  conditions: ConditionDraft[]
  actions: ActionDraft[]
}

/* ---------- da API para o formulário ---------- */

function conditionsToDrafts(conditions: TriggerConditions | null | undefined): ConditionDraft[] {
  return Object.entries(conditions ?? {}).map(([key, expected]) => {
    if (expected && typeof expected === "object") {
      return {
        key,
        operator: (expected.operator ?? "equals") as ConditionOperator,
        value: expected.value === null || expected.value === undefined ? "" : String(expected.value),
      }
    }
    return { key, operator: "equals" as const, value: expected === null ? "" : String(expected) }
  })
}

function actionToDraft(action: TriggerAction): ActionDraft {
  const { headers, ...rest } = action
  return {
    ...rest,
    audience: action.type === "notify" ? (action.accountIds?.length ? "people" : "default") : undefined,
    headersList: action.type === "fire_webhook"
      ? Object.entries(headers ?? {}).map(([name, value]) => ({ name, value: String(value) }))
      : undefined,
  }
}

export function triggerToDraft(trigger: Trigger): TriggerDraft {
  return {
    name: trigger.name,
    eventType: trigger.eventType,
    stageId: trigger.stageId,
    active: trigger.active,
    conditions: conditionsToDrafts(trigger.conditions),
    actions: trigger.actions.map(actionToDraft),
  }
}

/* ---------- do formulário para a API ---------- */

function draftsToConditions(drafts: ConditionDraft[]): TriggerConditions {
  const conditions: TriggerConditions = {}
  for (const { key, operator, value } of drafts) {
    if (!operatorTakesValue(operator)) {
      conditions[key] = { operator }
    } else if (operator === "equals") {
      conditions[key] = value
    } else {
      conditions[key] = { operator, value }
    }
  }
  return conditions
}

function draftToAction(draft: ActionDraft): TriggerAction {
  const { audience, headersList, ...rest } = draft
  const action = { ...rest } as TriggerAction

  if (action.type === "notify" && audience !== "people") delete action.accountIds
  if (action.type === "fire_webhook") {
    const named = (headersList ?? []).filter((header) => header.name.trim())
    action.headers = Object.fromEntries(named.map((header) => [header.name.trim(), header.value]))
  }
  if (action.target !== "specific") delete action.specificPhone
  if (action.type === "toggle_automation" && action.automationStatus === "enabled") {
    delete action.disablePeriod
    delete action.disableTime
  }
  if (action.type === "create_card") {
    if (action.cardInheritAssigned) action.cardAssignedToId = null
    if (action.cardInheritLabels) action.cardLabelIds = []
  }
  return action
}

export function draftToInput(draft: TriggerDraft): TriggerInput {
  return {
    name: draft.name.trim(),
    eventType: draft.eventType,
    stageId: draft.stageId,
    active: draft.active,
    conditions: draftsToConditions(draft.conditions),
    actions: draft.actions.map(draftToAction),
  }
}

/* ---------- leituras ---------- */

export function runsCode(trigger: Pick<Trigger, "actions">) {
  return trigger.actions.some((action) => action.type === "run_code")
}

/** O registro "foi para a fila" não diz como terminou: o resultado vem em outra execução. */
export function isEnqueuedOnly(execution: Pick<TriggerExecution, "executedActions">) {
  return (
    execution.executedActions.length > 0 &&
    execution.executedActions.every((action) => action.enqueued)
  )
}

/* ---------- padrões ---------- */

export function newActionDraft(type: TriggerActionType, starterCode = ""): ActionDraft {
  switch (type) {
    case "notify":
      return { type, audience: "default", message: "", accountIds: [] }
    case "assign_user":
      return { type, accountIds: [] }
    case "send_whatsapp_message":
      return { type, connectorId: "", target: "card_contact", message: "" }
    case "send_whatsapp_template":
      return { type, connectorId: "", target: "card_contact", whatsappTemplateId: "", templateParams: [] }
    case "fire_webhook":
      return { type, url: "", method: "POST", bodyTemplate: "", headersList: [] }
    case "toggle_automation":
      return { type, automationStatus: "disabled", disablePeriod: "hours", disableTime: 1 }
    case "create_card":
      return {
        type,
        cardTitleTemplate: "",
        cardDescriptionTemplate: "",
        cardInheritAssigned: false,
        cardInheritLabels: false,
        cardLabelIds: [],
        cardCustomFieldValues: {},
        cardTags: [],
      }
    case "run_code":
      return { type, code: starterCode, timeoutMs: null }
    default:
      return { type }
  }
}

export function newTriggerDraft(): TriggerDraft {
  return {
    name: "",
    eventType: "card_moved",
    stageId: null,
    active: true,
    conditions: [],
    actions: [newActionDraft("notify")],
  }
}

/** Os exemplos do estado vazio: já vêm prontos, e a pessoa só ajusta. */
export type TriggerExampleKey = "notifyOnStage" | "assignNew" | "dueDate" | "dealWon"

export function exampleDraft(key: TriggerExampleKey, board: Pick<Board, "stages">, message: string): TriggerDraft {
  const middle = board.stages[Math.floor(board.stages.length / 2)]
  const notify = { ...newActionDraft("notify"), message }

  switch (key) {
    case "notifyOnStage":
      return { ...newTriggerDraft(), stageId: middle?.id ?? null, actions: [notify] }
    case "assignNew":
      return {
        ...newTriggerDraft(),
        eventType: "card_created",
        stageId: board.stages[0]?.id ?? null,
        actions: [newActionDraft("assign_user")],
      }
    case "dueDate":
      return { ...newTriggerDraft(), eventType: "due_date_passed", actions: [notify] }
    case "dealWon":
      return { ...newTriggerDraft(), eventType: "deal_won", actions: [notify] }
  }
}

/* ---------- validação ---------- */

type Translate = (key: string, options?: Record<string, unknown>) => string

const OPTIONAL_TEXT = z.string().nullable().optional()

function isHttpUrl(value: string) {
  try {
    const { protocol } = new URL(value)
    return protocol === "http:" || protocol === "https:"
  } catch {
    return false
  }
}

export function buildTriggerSchema(t: Translate) {
  const message = (key: string) => t(`pipelinesAdmin.triggers.validation.${key}`)

  const action = z
    .looseObject({
      type: z.enum(TRIGGER_ACTION_TYPES),
      message: OPTIONAL_TEXT,
      connectorId: OPTIONAL_TEXT,
      specificPhone: OPTIONAL_TEXT,
    })
    .superRefine((raw, context) => {
      const value = raw as unknown as ActionDraft
      const require = (path: string, ok: unknown, key: string) => {
        if (!ok) context.addIssue({ code: "custom", path: [path], message: message(key) })
      }

      switch (value.type) {
        case "notify":
          if (value.audience === "people") require("accountIds", value.accountIds?.length, "people")
          break
        case "move_card":
          require("stageId", value.stageId, "stage")
          break
        case "assign_user":
          require("accountIds", value.accountIds?.length, "people")
          break
        case "send_whatsapp_message":
          require("connectorId", value.connectorId, "connector")
          require("message", value.message?.trim(), "message")
          if (value.target === "specific") require("specificPhone", value.specificPhone, "phone")
          break
        case "send_whatsapp_template":
          require("connectorId", value.connectorId, "connector")
          require("whatsappTemplateId", value.whatsappTemplateId, "template")
          if (value.target === "specific") require("specificPhone", value.specificPhone, "phone")
          break
        case "fire_webhook":
          require("url", value.url && isHttpUrl(value.url.trim()), "url")
          break
        case "toggle_automation":
          if (value.automationStatus === "disabled") {
            require("disableTime", (value.disableTime ?? 0) >= 1, "duration")
          }
          break
        case "create_card":
          require("targetBoardId", value.targetBoardId, "targetBoard")
          require("cardTitleTemplate", value.cardTitleTemplate?.trim(), "cardTitle")
          break
        case "run_code":
          require("code", value.code?.trim(), "code")
          require("code", (value.code?.length ?? 0) <= MAX_CODE_LENGTH, "codeTooLong")
          if (value.timeoutMs !== null && value.timeoutMs !== undefined) {
            require(
              "timeoutMs",
              value.timeoutMs >= MIN_CODE_TIMEOUT_MS && value.timeoutMs <= MAX_CODE_TIMEOUT_MS,
              "timeout"
            )
          }
          break
      }
    })

  return z.object({
    name: z.string().trim().min(1, message("name")).max(255, message("nameTooLong")),
    eventType: z.enum(TRIGGER_EVENTS),
    stageId: z.string().nullable(),
    active: z.boolean(),
    conditions: z.array(
      z
        .object({
          key: z.string(),
          operator: z.enum(CONDITION_OPERATORS),
          value: z.string(),
        })
        .superRefine((value, context) => {
          if (operatorTakesValue(value.operator) && !value.value.trim()) {
            const kind = conditionKind(value.key)
            context.addIssue({
              code: "custom",
              path: ["value"],
              message: message(kind === "text" || kind === "number" ? "conditionValue" : "conditionChoice"),
            })
          }
        })
    ),
    actions: z.array(action).min(1, message("actions")),
  })
}
