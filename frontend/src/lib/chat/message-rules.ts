import type { ChatConnector } from "./channel"
import type { BulkDeleteScope, ChatMessage } from "./types"

// O que dá para fazer com uma mensagem. Antes de tudo, o que o canal diz que permite
// (`reactionsSupported`, `deleteForEveryoneSupported`, em `GET /chats/self-filter`); o
// provedor (`connectorProvider`) só decide quando o canal não informa. Atenção: é `zapi`
// aqui, e não `z_api` como na origem.

/** A janela do WhatsApp para apagar para todos: 60 horas. */
const DELETE_WINDOW_MS = 60 * 60 * 60 * 1000

export type MessageCapabilities = {
  connector: ChatConnector | undefined
  provider: string | null
}

export function deleteForEveryoneSupported({ connector, provider }: MessageCapabilities): boolean {
  if (connector && "deleteForEveryoneSupported" in connector) {
    return Boolean(connector.deleteForEveryoneSupported)
  }
  return provider === "zapi"
}

export function reactionsSupported({ connector, provider }: MessageCapabilities): boolean {
  if (connector && "reactionsSupported" in connector) {
    return Boolean(connector.reactionsSupported)
  }
  return provider === "evolution_api"
}

export function isUserFacing(message: ChatMessage): boolean {
  return message.role === "assistant" || message.role === "user"
}

export function canReactToMessage(
  message: ChatMessage,
  capabilities: MessageCapabilities
): boolean {
  if (!reactionsSupported(capabilities)) return false
  if (message.deletedAt || !isUserFacing(message)) return false
  // A reação vai pelo id do provedor: mensagem que nunca chegou lá não tem em que reagir.
  return Boolean(message.messageId)
}

/**
 * "Para mim" sempre existe. "Para todos" só se o canal revoga e todas as mensagens do lote são
 * nossas, estão dentro da janela e ainda não foram apagadas. O servidor rebaixa o lote inteiro
 * para "para mim" se não puder revogar: quem chama olha `scopeApplied`.
 */
export function availableDeleteScopes(
  messages: ChatMessage[],
  capabilities: MessageCapabilities
): BulkDeleteScope[] {
  if (messages.length === 0 || !deleteForEveryoneSupported(capabilities)) return ["me"]

  const now = Date.now()
  const eligible = messages.every(
    (message) =>
      message.role === "assistant" &&
      !message.deletedAt &&
      now - message.createdAt < DELETE_WINDOW_MS
  )
  return eligible ? ["me", "everyone"] : ["me"]
}

export type MessageKind = "text" | "image" | "video" | "audio" | "sticker" | "document"

/** O back-end manda o tipo simples ("image") ou o MIME ("image/jpeg"): compara por trecho. */
export function messageKind(message: Pick<ChatMessage, "typeElement" | "mediaType">): MessageKind {
  const { typeElement, mediaType } = message
  if (typeElement === "audio") return "audio"
  if (typeElement === "image") return "image"
  if (typeElement !== "media") return "text"

  const media = (mediaType ?? "").toLowerCase()
  if (media === "sticker") return "sticker"
  if (media.includes("image")) return "image"
  if (media.includes("video")) return "video"
  if (media.includes("audio")) return "audio"
  return "document"
}

/** Mídia que entra em grade: imagem ou vídeo, sem legenda, sem estar apagada. */
export function isGroupableMedia(message: ChatMessage): boolean {
  if (message.deletedAt || message.caption) return false
  const kind = messageKind(message)
  return kind === "image" || kind === "video"
}

/** A citação `attachment_id_<id>` não é texto: quem lê a prévia não deve vê-la. */
export function stripAttachmentReferences(text: string): string {
  return text
    .replace(/attachment_id_[\w-]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

/** `"-"` é o que o back-end grava no áudio sem transcrição. */
export function meaningfulContent(content: string | null | undefined): string {
  if (!content || content === "-") return ""
  return stripAttachmentReferences(content)
}
