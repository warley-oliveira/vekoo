import type { Connector, ConnectorType } from "@/lib/connectors/types"
import { formatBrazilianPhone, formatPhone, onlyDigits } from "@/lib/format-phone"
import type { Chat } from "./types"

// O canal de uma conversa: o tipo do conector manda; sem ele (conector fora da lista, por
// exemplo), vale o `audienceType` da conversa. Porta `integrationChannel.ts` e
// `channelIdentifier.ts` da origem, com as marcas em `components/connectors/channel-mark.tsx`.

export type ChatConnector = Connector & {
  /** Em `GET /chats/self-filter`, no WhatsApp pelo celular. */
  reactionsSupported?: boolean
  deleteForEveryoneSupported?: boolean
}

export type ChannelKey = "whatsapp" | "whatsapp_cloud" | "instagram" | "messenger" | "web" | "other"

const TYPE_TO_KEY: Partial<Record<ConnectorType, ChannelKey>> = {
  whatsapp_web: "whatsapp",
  zapi: "whatsapp",
  whatsapp_cloud: "whatsapp_cloud",
  instagram_direct: "instagram",
  facebook_messenger: "messenger",
  web_widget: "web",
}

const AUDIENCE_TO_KEY: Record<string, ChannelKey> = {
  whatsapp_api: "whatsapp",
  instagram: "instagram",
  facebook: "messenger",
  web: "web",
}

export function channelKey(
  connector: Pick<Connector, "type"> | undefined,
  audienceType: string | null | undefined
): ChannelKey {
  return (
    (connector && TYPE_TO_KEY[connector.type]) ||
    (audienceType ? AUDIENCE_TO_KEY[audienceType] : undefined) ||
    "other"
  )
}

/** Só WhatsApp tem telefone: nos outros o identificador é um código, e não aparece. */
export function isPhoneChannel(key: ChannelKey): boolean {
  return key === "whatsapp" || key === "whatsapp_cloud"
}

/** O que identifica o contato ao lado do nome: telefone ou arroba. O widget não tem nenhum. */
export function contactHandle(
  chat: Pick<Chat, "externalId" | "phoneNumber" | "audienceUserName">,
  key: ChannelKey
): string | null {
  if (key === "instagram") return chat.audienceUserName ? `@${chat.audienceUserName}` : null
  if (key === "messenger" || key === "web") return null

  const raw = (chat.phoneNumber ?? chat.externalId ?? "").split("@")[0]
  // Conversa importada não diz o canal, mas o identificador dela é o telefone.
  if (key === "other" && onlyDigits(raw).length < 10) return null

  const brazilian = formatBrazilianPhone(raw)
  return brazilian === raw ? formatPhone(raw) : brazilian
}

/**
 * O número ou endereço do canal, na aba e na origem de cada bolha. Na WABA o número certo sai
 * do `senderPhoneNumberId` da conversa, porque uma conta pode ter vários.
 */
export function connectorNumber(
  connector: ChatConnector | undefined,
  senderPhoneNumberId?: string | null
): string | null {
  if (!connector) return null

  switch (connector.type) {
    case "whatsapp_cloud": {
      const list = connector.phoneNumberList ?? []
      const match = senderPhoneNumberId
        ? list.find((phone) => String(phone.id) === String(senderPhoneNumberId))
        : undefined
      return (
        match?.displayPhoneNumber ||
        connector.displayPhoneNumber ||
        list[0]?.displayPhoneNumber ||
        null
      )
    }
    case "whatsapp_web":
    case "zapi":
      return connector.numberFormatted || null
    case "instagram_direct":
      return connector.instagramUsername ? `@${connector.instagramUsername}` : null
    default:
      return null
  }
}

export function isConnectorDown(connector: ChatConnector | undefined): boolean {
  return Boolean(connector) && connector?.status !== "active"
}
