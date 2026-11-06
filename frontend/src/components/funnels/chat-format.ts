import { formatPhone, onlyDigits } from "@/lib/format-phone"
import type { BoardChat } from "./types"

/** O menor número de telefone que faz sentido: DDD + 8 dígitos. */
export const MIN_PHONE_DIGITS = 10

export function chatName(chat: Pick<BoardChat, "displayName" | "userName">, fallback: string): string {
  return chat.displayName || chat.userName || fallback
}

/** O telefone formatado. Quem veio do site tem um identificador ali (`visitante-ana`), e não um número. */
export function contactPhone(phone: string | null | undefined): string {
  return phone && onlyDigits(phone).length >= MIN_PHONE_DIGITS ? formatPhone(phone) : ""
}
