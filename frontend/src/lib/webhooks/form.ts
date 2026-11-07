import { z } from "zod"

import { looksLikeUrl } from "./internal-url"
import { ACTION_TYPES, type HookAction, type HookActionType, type MessageBlock, type MessageBlockType, type Webhook } from "./types"

// O formulário das ações. Cada ação nasce com todos os campos, vazios onde não se aplicam: é o que o react-hook-form
// precisa para `isDirty` não acender à toa, e o que permite trocar de canal ou de modo sem perder o que foi digitado. Na
// ida para a API, só vai o que aquele tipo entende.

export type ActionConfigValues = {
  contactIdentifier: string
  contactName: string
  customFieldId: string | null
  valueTemplate: string
  connectorId: string | null
  flowId: string | null
  sendMode: "simple" | "advanced"
  messageText: string
  messageBlocks: MessageBlock[]
  whatsappTemplateId: string | null
  whatsappTemplateParams: string[]
  phoneNumberId: string | null
  code: string
  url: string
  httpMethod: string
  headers: { key: string; value: string }[]
  body: string
}

export type ActionValues = {
  /** `null`: ainda não existe na API. */
  actionId: string | null
  type: HookActionType
  createdAt: number
  config: ActionConfigValues
}

export type WebhookFormValues = {
  actions: ActionValues[]
  /** As que saíram da lista e ainda precisam sair da API. */
  removedIds: string[]
}

function emptyConfig(): ActionConfigValues {
  return {
    contactIdentifier: "",
    contactName: "",
    customFieldId: null,
    valueTemplate: "",
    connectorId: null,
    flowId: null,
    sendMode: "simple",
    messageText: "",
    messageBlocks: [],
    whatsappTemplateId: null,
    whatsappTemplateParams: [],
    phoneNumberId: null,
    code: "",
    url: "",
    httpMethod: "POST",
    headers: [],
    body: "",
  }
}

function bodyAsText(body: HookAction["config"]["body"]): string {
  if (body === null || body === undefined) return ""
  return typeof body === "string" ? body : JSON.stringify(body, null, 2)
}

function toActionValues(action: HookAction): ActionValues {
  const { config } = action
  return {
    actionId: action.id,
    type: action.type,
    createdAt: action.createdAt,
    config: {
      ...emptyConfig(),
      contactIdentifier: config.contactIdentifier ?? "",
      contactName: config.contactName ?? "",
      customFieldId: config.customFieldId ?? null,
      valueTemplate: config.valueTemplate ?? "",
      connectorId: config.connectorId ?? null,
      flowId: config.flowId ?? null,
      sendMode: config.sendMode === "advanced" ? "advanced" : "simple",
      messageText: config.messageText ?? "",
      messageBlocks: config.messageBlocks ?? [],
      whatsappTemplateId: config.whatsappTemplateId ?? null,
      whatsappTemplateParams: config.whatsappTemplateParams ?? [],
      phoneNumberId: config.phoneNumberId ?? null,
      code: config.code ?? "",
      url: config.url ?? "",
      httpMethod: config.httpMethod || "POST",
      headers: config.headers ?? [],
      body: bodyAsText(config.body),
    },
  }
}

/** A ordem em que rodam: a do contato, "iniciar fluxo", e as demais pela ordem de criação. */
function rank(type: HookActionType): number {
  if (type === ACTION_TYPES.contact) return 0
  if (type === ACTION_TYPES.startFlow) return 1
  return 2
}

export function runOrder<T extends { type: HookActionType; createdAt: number }>(items: T[]): T[] {
  return items
    .map((item, position) => ({ item, position }))
    .sort((a, b) => rank(a.item.type) - rank(b.item.type) || a.position - b.position)
    .map(({ item }) => item)
}

export function toFormValues(webhook: Webhook): WebhookFormValues {
  return { actions: webhook.webhookActions.map(toActionValues), removedIds: [] }
}

export function newAction(type: HookActionType, config: Partial<ActionConfigValues> = {}): ActionValues {
  return { actionId: null, type, createdAt: Date.now(), config: { ...emptyConfig(), ...config } }
}

let blockSequence = 0

export function newBlock(type: MessageBlockType): MessageBlock {
  blockSequence += 1
  return {
    id: `block_${Date.now()}_${blockSequence}`,
    type,
    content: "",
    mediaUrl: "",
    fileName: "",
    caption: "",
    ...(type === "text" ? {} : { mediaSource: "url" as const }),
  }
}

/** O que cada tipo de ação manda. O mapa do controlador recusa o resto, e `config` é mesclado: vazio apaga. */
function configPayload({ type, config }: ActionValues): Record<string, unknown> {
  switch (type) {
    case ACTION_TYPES.contact:
      return { contactIdentifier: config.contactIdentifier.trim(), contactName: config.contactName.trim() }
    case ACTION_TYPES.userField:
      return { customFieldId: config.customFieldId, valueTemplate: config.valueTemplate }
    case ACTION_TYPES.startFlow:
      return {
        connectorId: config.connectorId,
        flowId: config.flowId,
        phoneNumberId: config.phoneNumberId,
        sendMode: config.sendMode,
        messageText: config.messageText,
        messageBlocks: config.messageBlocks,
        whatsappTemplateId: config.whatsappTemplateId,
        whatsappTemplateParams: config.whatsappTemplateId ? config.whatsappTemplateParams : [],
      }
    case ACTION_TYPES.code:
      return { code: config.code }
    case ACTION_TYPES.http:
      return {
        url: config.url.trim(),
        httpMethod: config.httpMethod,
        headers: config.headers.filter((header) => header.key.trim()),
        body: config.httpMethod === "GET" ? "" : config.body,
      }
    default:
      return {}
  }
}

export function toPayload(values: WebhookFormValues) {
  return {
    webhookActions: [
      ...values.actions.map((action) => ({
        ...(action.actionId ? { id: action.actionId } : { type: action.type }),
        config: configPayload(action),
      })),
      ...values.removedIds.map((id) => ({ id, _destroy: true })),
    ],
  }
}

type T = (key: string) => string

function checkAction(action: ActionValues, index: number, ctx: z.RefinementCtx, t: T, active: boolean) {
  const { config, type } = action
  const issue = (path: string, key: string) =>
    ctx.addIssue({ code: "custom", path: [index, "config", ...path.split(".").map((part) => (/^\d+$/.test(part) ? Number(part) : part))], message: t(key) })

  if (type === ACTION_TYPES.contact && active && !config.contactIdentifier.trim()) {
    issue("contactIdentifier", "webhooks.form.errors.contactRequired")
  }
  if (type === ACTION_TYPES.userField) {
    if (!config.customFieldId) issue("customFieldId", "webhooks.form.errors.customField")
    if (!config.valueTemplate.trim()) issue("valueTemplate", "webhooks.form.errors.value")
  }
  if (type === ACTION_TYPES.code && !config.code.trim()) issue("code", "webhooks.form.errors.code")
  if (type === ACTION_TYPES.http) {
    if (!config.url.trim()) issue("url", "webhooks.form.errors.url")
    else if (!looksLikeUrl(config.url)) issue("url", "webhooks.form.errors.urlInvalid")
    config.headers.forEach((header, position) => {
      if (!header.key.trim() && header.value.trim()) issue(`headers.${position}.key`, "webhooks.form.errors.headerKey")
    })
  }
  if (type === ACTION_TYPES.startFlow) {
    if (!config.connectorId) issue("connectorId", "webhooks.form.errors.connector")
    const hasBlocks = config.sendMode === "advanced" && config.messageBlocks.length > 0
    const hasText = config.sendMode === "simple" && config.messageText.trim().length > 0
    if (!config.flowId && !hasBlocks && !hasText && !config.whatsappTemplateId) {
      issue("flowId", "webhooks.form.errors.nothingToDo")
    }
    if (config.sendMode === "advanced") {
      config.messageBlocks.forEach((block, position) => {
        if (block.type === "text") {
          if (!block.content?.trim()) issue(`messageBlocks.${position}.content`, "webhooks.form.errors.blockText")
        } else if (block.mediaSource === "attachment") {
          if (!block.attachmentId) issue(`messageBlocks.${position}.attachmentId`, "webhooks.form.errors.blockAttachment")
        } else if (!block.mediaUrl?.trim()) {
          issue(`messageBlocks.${position}.mediaUrl`, "webhooks.form.errors.blockUrl")
        }
      })
    }
  }
}

/** `active`: o número do contato só é obrigatório de verdade quando as ações rodam. */
export function buildFormSchema(t: T, active: boolean) {
  return z.object({
    actions: z.custom<ActionValues[]>().superRefine((actions, ctx) => {
      actions?.forEach((action, index) => checkAction(action, index, ctx, t, active))
    }),
    removedIds: z.custom<string[]>(),
  })
}
