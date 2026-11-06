import type { TFunction } from "i18next"

import { ApiError } from "@/lib/api"

/** O que dizer num toast quando uma ação falha: a frase do servidor, que já vem no idioma da requisição. */
export function funnelErrorMessage(t: TFunction, error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "network") return t("errors.network")
    if (error.serverMessage) return error.serverMessage
  }
  return t("funnels.errors.generic")
}
