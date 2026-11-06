import type { TFunction } from "i18next"

import { ApiError } from "@/lib/api"
import i18n from "@/lib/i18n"

/**
 * O que dizer quando uma ação da agenda falha: a frase da tela quando ela conhece o código
 * (`calendar.errors.<code>`), senão a do servidor, que já vem no idioma da requisição.
 */
export function eventErrorMessage(t: TFunction, error: unknown): string {
  if (error instanceof ApiError) {
    const key = `calendar.errors.${error.code}`
    if (i18n.exists(key)) return t(key)
    if (error.serverMessage) return error.serverMessage
  }
  return t("calendar.errors.generic")
}
