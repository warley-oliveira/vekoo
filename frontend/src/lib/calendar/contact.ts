import { formatPhone } from "@/lib/format-phone"

/**
 * O telefone formatado, se o id externo for um telefone. No chat do site e no Instagram ele é um id
 * que não diz nada a ninguém, e formatado como telefone ainda parecia um número errado.
 */
export function contactLine(externalId: string | null | undefined): string | undefined {
  if (!externalId) return undefined
  return /^\d{10,13}$/.test(externalId) ? formatPhone(externalId) : undefined
}
