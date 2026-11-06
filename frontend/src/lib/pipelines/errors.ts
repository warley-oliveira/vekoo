import type { TFunction } from "i18next"

import { ApiError } from "@/lib/api"

/** A mensagem de um erro da API, com a chave do domínio quando não há o que aproveitar dela. */
export function pipelineErrorText(t: TFunction, error: unknown, fallbackKey: string): string {
  if (error instanceof ApiError) {
    if (error.code === "network") return t("errors.network")
    if (error.serverMessage) return error.serverMessage
  }
  return t(fallbackKey)
}

/** O que falta para o card sair da etapa ou para o negócio fechar, quando é esse o motivo da recusa. */
export function pendingFrom(error: unknown): {
  code: "checklistIncomplete" | "requiredFieldsIncomplete"
  items: string[]
  fieldKeys: string[]
} | null {
  if (!(error instanceof ApiError)) return null
  const { code } = error
  if (code !== "checklistIncomplete" && code !== "requiredFieldsIncomplete") return null

  const details = (error.details ?? {}) as Record<string, string[] | undefined>
  return {
    code: code as "checklistIncomplete" | "requiredFieldsIncomplete",
    items: details.pendingItems ?? details.pendingFields ?? [],
    fieldKeys: details.pendingFieldKeys ?? [],
  }
}
