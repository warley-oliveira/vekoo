import type { TFunction } from "i18next"

import { ApiError } from "@/lib/api"
import i18n from "@/lib/i18n"

/**
 * O que dizer quando uma ação falha: a frase da tela quando ela conhece o código, senão a do
 * servidor, que já vem no idioma da requisição.
 */
export function adminErrorMessage(t: TFunction, error: unknown): string {
  if (error instanceof ApiError) {
    const key = `pipelinesAdmin.errors.${error.code}`
    if (i18n.exists(key)) return t(key)
    if (error.serverMessage) return error.serverMessage
  }
  return t("pipelinesAdmin.errors.generic")
}
