import type { TFunction } from "i18next"
import { z } from "zod"

import { MIN_INTERVAL_SECONDS, hourOf } from "./estimate"
import type { WizardStep, WizardValues } from "./form"
import { filledMessages } from "./form"

// Validação do formulário inteiro. As mensagens vêm do i18n, então o schema nasce dentro do render.
// O público não é campo do formulário (mora no servidor): quem confere é o passo, com a contagem.

/** Que campos cada passo cobra ao avançar. */
export const STEP_FIELDS: Record<WizardStep, (keyof WizardValues)[]> = {
  audience: [],
  message: [
    "connectorIds",
    "wabaConnectorId",
    "phoneNumberIds",
    "messages",
    "attachmentId",
    "templateIds",
    "templateParams",
  ],
  schedule: ["scheduledAt", "sendDays", "intervalMax", "dailyLimitPerConnector", "sendWindowEnd"],
  review: ["name"],
}

export function stepOfField(field: string): WizardStep {
  const name = field.split(".")[0] as keyof WizardValues
  if (STEP_FIELDS.message.includes(name)) return "message"
  if (STEP_FIELDS.schedule.includes(name)) return "schedule"
  return "review"
}

export const MAX_NAME_LENGTH = 160

const anyRecord = z.record(z.string(), z.record(z.string(), z.string()))

/** As posições do corpo do modelo que precisam de valor: a primeira, vazia, é o nome. */
export type TemplateParamRule = { templateId: string; position: string }

export function buildWizardSchema(
  t: TFunction,
  /** O que os modelos escolhidos pedem. Fora do schema, porque vem da API. */
  requiredParams: () => TemplateParamRule[]
) {
  return z
    .object({
      name: z.string().trim().min(1, t("campaignsWizard.errors.nameRequired")).max(MAX_NAME_LENGTH),
      campaignMode: z.enum(["text", "template"]),
      connectorIds: z.array(z.string()),
      wabaConnectorId: z.string().nullable(),
      phoneNumberIds: z.array(z.string()),
      messageType: z.enum(["text", "media"]),
      messages: z.array(z.object({ text: z.string() })),
      attachmentId: z.string().nullable(),
      media: z
        .object({
          url: z.string().nullable(),
          contentType: z.string().nullable(),
          fileName: z.string().nullable(),
        })
        .nullable(),
      templateIds: z.array(z.string()),
      templateParams: anyRecord,
      flowId: z.string().nullable(),
      chatTagIds: z.array(z.string()),
      raiseChats: z.boolean(),
      sendMode: z.enum(["now", "later"]),
      scheduledAt: z.date().nullable(),
      sendWindowStart: z.string(),
      sendWindowEnd: z.string(),
      sendDays: z.array(z.number()).min(1, t("campaignsWizard.errors.daysRequired")),
      intervalMin: z.number(),
      intervalMax: z.number(),
      // Aceita o campo vazio aqui: tipo errado interromperia o schema inteiro, e os outros passos
      // deixariam de saber o que falta. Quem cobra é o `superRefine`.
      dailyLimitPerConnector: z.number().nullable(),
      timezone: z.string(),
    })
    .superRefine((values, context) => {
      const issue = (path: string, message: string) =>
        context.addIssue({ code: "custom", path: [path], message })

      if (values.campaignMode === "text") {
        if (values.connectorIds.length === 0) {
          issue("connectorIds", t("campaignsWizard.errors.connectorRequired"))
        }
        if (values.messageType === "media" && !values.attachmentId) {
          issue("attachmentId", t("campaignsWizard.errors.mediaRequired"))
        }
        if (values.messageType === "text" && filledMessages(values).length === 0) {
          issue("messages", t("campaignsWizard.errors.messageRequired"))
        }
      } else {
        if (!values.wabaConnectorId) issue("wabaConnectorId", t("campaignsWizard.errors.wabaRequired"))
        if (values.phoneNumberIds.length === 0) {
          issue("phoneNumberIds", t("campaignsWizard.errors.phoneRequired"))
        }
        if (values.templateIds.length === 0) {
          issue("templateIds", t("campaignsWizard.errors.templateRequired"))
        }
        const empty = requiredParams().some(
          ({ templateId, position }) => !values.templateParams[templateId]?.[position]?.trim()
        )
        if (empty) issue("templateParams", t("campaignsWizard.errors.templateParamRequired"))
      }

      if (values.sendMode === "later") {
        if (!values.scheduledAt) issue("scheduledAt", t("campaignsWizard.errors.scheduleRequired"))
        else if (values.scheduledAt.getTime() <= Date.now()) {
          issue("scheduledAt", t("campaignsWizard.errors.schedulePast"))
        }
      }

      if (values.intervalMin < MIN_INTERVAL_SECONDS) {
        issue("intervalMax", t("campaignsWizard.errors.intervalFloor"))
      } else if (values.intervalMax < values.intervalMin) {
        issue("intervalMax", t("campaignsWizard.errors.intervalRange"))
      }

      const limit = values.dailyLimitPerConnector
      if (limit === null || !Number.isInteger(limit) || limit < 1) {
        issue("dailyLimitPerConnector", t("campaignsWizard.errors.dailyLimit"))
      }

      // Madrugada não existe: para a API, fim antes do início é o dia inteiro, e a pessoa não pediu isso.
      const from = hourOf(values.sendWindowStart)
      const to = hourOf(values.sendWindowEnd)
      if (to <= from && !(from === 0 && to === 0)) {
        issue("sendWindowEnd", t("campaignsWizard.errors.windowRange"))
      }
    })
}
