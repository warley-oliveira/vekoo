import { formatPhone } from "@/lib/format-phone"

/** O telefone formatado. Contato de site não tem telefone, e o id externo aparece como veio. */
export function contactLine(externalId: string | null | undefined): string | undefined {
  if (!externalId) return undefined
  return /^\d{10,15}$/.test(externalId) ? formatPhone(externalId) : externalId
}
