import type { TFunction } from "i18next"
import { z } from "zod"

// A regra de mensagem de lembrete e de passo de sequência. Na API são dois campos soltos; na tela
// é uma escolha ("texto pronto" ou "a IA escreve"), porque uma custa e a outra não, e a pessoa
// precisa ver isso antes de escolher.

export const MESSAGE_MAX = 4000

export type MessageKind = "reminder" | "step"
export type MessageMode = "text" | "ai"

export type MessageRuleValues = {
  mode: MessageMode
  message: string
  aiPrompt: string
}

/**
 * O que se insere nas mensagens. O colaborador entra como `{{colaborador}}`, que a API aceita ao lado
 * de `{{profissional}}`: é a palavra que a pessoa vê na tela, e a dos modelos prontos.
 */
export const MESSAGE_VARIABLES = [
  "nome",
  "telefone",
  "servico",
  "colaborador",
  "titulo",
  "data",
  "hora",
  "link_reuniao",
] as const

export type MessageVariable = (typeof MESSAGE_VARIABLES)[number]

/** Para citar variáveis num texto traduzido: o i18next trocaria `{{nome}}` por vazio. */
export const MESSAGE_TOKENS: Record<MessageVariable, string> = Object.fromEntries(
  MESSAGE_VARIABLES.map((variable) => [variable, `{{${variable}}}`])
) as Record<MessageVariable, string>

export function messageRuleValues(rule: {
  message?: string | null
  aiPrompt?: string | null
}): MessageRuleValues {
  return {
    mode: rule.aiPrompt?.trim() ? "ai" : "text",
    message: rule.message ?? "",
    aiPrompt: rule.aiPrompt ?? "",
  }
}

/** Texto pronto não leva instrução, nem a que ficou no campo antes de trocar de opção. */
export function messageRulePayload(values: MessageRuleValues): {
  message?: string
  aiPrompt?: string
} {
  const message = values.message.trim()
  if (values.mode === "text") return { message }

  return { aiPrompt: values.aiPrompt.trim(), ...(message ? { message } : {}) }
}

export function messageRuleShape(t: TFunction) {
  return {
    mode: z.enum(["text", "ai"]),
    message: z.string().max(MESSAGE_MAX, t("calendar.reminders.rule.tooLong")),
    aiPrompt: z.string().max(MESSAGE_MAX, t("calendar.reminders.rule.tooLong")),
  }
}

export function checkMessageRule(values: MessageRuleValues, ctx: z.RefinementCtx, t: TFunction) {
  if (values.mode === "text" && !values.message.trim()) {
    ctx.addIssue({
      code: "custom",
      path: ["message"],
      message: t("calendar.reminders.rule.messageRequired"),
    })
  }
  if (values.mode === "ai" && !values.aiPrompt.trim()) {
    ctx.addIssue({
      code: "custom",
      path: ["aiPrompt"],
      message: t("calendar.reminders.rule.aiPromptRequired"),
    })
  }
}
