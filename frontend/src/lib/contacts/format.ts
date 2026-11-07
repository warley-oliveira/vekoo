import type { ConnectorType } from "@/lib/connectors/types"
import { onlyDigits } from "@/lib/format-phone"
import type { Contact } from "./types"

// Canais em que o identificador da conversa é um telefone. No Instagram e no widget ele é um
// id interno, que a pessoa não reconheceria.
const PHONE_CONNECTORS: readonly ConnectorType[] = [
  "whatsapp_web",
  "whatsapp_cloud",
  "lead_chat",
]

/** Canais que começam conversa por número: são os únicos para onde uma planilha faz sentido. */
export const IMPORTABLE_CONNECTORS: readonly ConnectorType[] = ["whatsapp_web", "whatsapp_cloud"]

/** O nome como a pessoa o reconhece. Sem nenhum, a tela escreve "Sem nome". */
export function contactName(contact: Pick<Contact, "displayName" | "userName">): string | null {
  return contact.displayName?.trim() || contact.userName?.trim() || null
}

/** O telefone, quando o canal tem telefone. `null` em visitante do site e no Instagram. */
export function contactPhone(
  contact: Pick<Contact, "phoneNumber" | "connectorType">
): string | null {
  const value = contact.phoneNumber
  if (!value) return null
  if (contact.connectorType) {
    return PHONE_CONNECTORS.includes(contact.connectorType) ? value : null
  }
  // Canal apagado: só o que parece telefone de verdade.
  return /^\+?[\d\s()-]+$/.test(value) && onlyDigits(value).length >= 8 ? value : null
}

/**
 * O texto da última mensagem, quando há texto. Áudio sem transcrição guarda `-` e imagem sem
 * legenda fica vazia: nesses casos a tela escreve o tipo, em `contacts.lastMessage.types`.
 */
export function lastMessageText(
  contact: Pick<Contact, "lastMessageContent">
): string | null {
  const content = contact.lastMessageContent?.trim()
  return content && content !== "-" ? content : null
}
