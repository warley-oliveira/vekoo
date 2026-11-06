import type { StatusTone } from "@/components/shared"
import { ApiError } from "@/lib/api"
import type { Connector, ConnectorStatus, WhatsappWebConnector } from "./types"

// As regras de cada tipo de canal, em um lugar só. Vêm da tabela "O que cada canal faz"
// do contrato: o que responde 422 ou não faz nada lá não é oferecido aqui.

export type ChannelGroup = "attention" | "connected" | "off"

const STATUS_TONES: Record<ConnectorStatus, StatusTone> = {
  active: "success",
  pending: "info",
  paused: "warning",
  failed: "danger",
  reject: "danger",
  closed: "neutral",
  inactive: "neutral",
}

export function statusTone(status: ConnectorStatus): StatusTone {
  return STATUS_TONES[status] ?? "neutral"
}

/**
 * Um aviso em aberto põe o canal em "precisam de atenção", qualquer que seja o estado:
 * é o que o número do menu conta. Como na origem, em que o canal com aviso ficava junto
 * dos ativos, e o desconectado sem aviso (já dispensado) saía de lá.
 */
export function channelGroup(connector: Connector, hasAlert: boolean): ChannelGroup {
  if (hasAlert) return "attention"
  if (["failed", "reject", "pending"].includes(connector.status)) return "attention"
  return connector.status === "active" ? "connected" : "off"
}

/** Como este canal se conecta. */
export type ConnectionKind = "qr" | "meta" | "messenger" | "instagram" | "direct" | "widget"

export function connectionKind(connector: Connector): ConnectionKind {
  switch (connector.type) {
    case "whatsapp_web":
    case "zapi":
      return "qr"
    case "whatsapp_cloud":
      return "meta"
    case "facebook_messenger":
      return "messenger"
    case "instagram_direct":
      return "instagram"
    case "web_widget":
      return "widget"
    default:
      return "direct"
  }
}

export function usesZapi(connector: Connector): boolean {
  return (
    connector.type === "zapi" ||
    (connector.type === "whatsapp_web" && connector.providerApi === "zapi")
  )
}

/** A ação que resolve o estado atual: o botão principal da linha e do detalhe. */
export type MainAction = "resume" | "continue" | "connect" | "reconnect" | "turnOn"

export function mainAction(connector: Connector): MainAction | null {
  switch (connector.status) {
    case "active":
      return null
    case "paused":
      return "resume"
    case "pending":
      return "continue"
    case "inactive":
      return connector.type === "web_widget" ? "turnOn" : "connect"
    default:
      return connector.type === "web_widget" ? "turnOn" : "reconnect"
  }
}

/**
 * O que oferecer além do botão principal. Só com o canal ligado: desligar um WhatsApp
 * parado não faz nada no provedor e ainda abriria um aviso de desconexão.
 *
 * Z-API direta e widget têm `shutdown` e `disconnect`, mas os dois fazem a mesma coisa
 * (`logout_instance` chama `deactivate`): oferecer só um evita a pergunta "qual a
 * diferença?". O widget se liga e desliga pelo interruptor da própria tela, e pausar
 * nele é o mesmo que desligar, porque o site só conversa com o canal `active`.
 */
export function availableActions(connector: Connector) {
  const on = connector.status === "active"

  return {
    pause: on && connector.type !== "web_widget",
    reload: on && connector.type === "whatsapp_web",
    shutdown: on && (connector.type === "whatsapp_web" || connector.type === "lead_chat"),
    disconnect:
      on &&
      (connector.type === "zapi" ||
        connector.type === "instagram_direct" ||
        connector.type === "facebook_messenger"),
  }
}

/**
 * Evolution e AIVA jogam fora o que chega durante a pausa, e não há como recuperar. É
 * regra do provedor, e a confirmação precisa dizer com todas as letras.
 */
export function pauseDiscardsMessages(connector: Connector): boolean {
  return (
    connector.type === "whatsapp_web" &&
    (connector.providerApi === "evolution_api" || connector.providerApi === "aiva_api")
  )
}

/** Enquanto não há perfil, o `name` é o nome interno da instância ou do registro. */
const INTERNAL_NAME = /^(IWA-|IZA-|Instagram [0-9a-f]{24}$|LeadChat [0-9a-f]{24}$|[0-9a-f]{24}$)/

export function hasRealName(connector: Connector): boolean {
  return !INTERNAL_NAME.test(connector.name)
}

/** O número ou o endereço que identifica o canal para a pessoa. */
export function connectorHandle(connector: Connector): string | null {
  switch (connector.type) {
    case "whatsapp_cloud":
      return connector.displayPhoneNumber
    case "whatsapp_web":
    case "zapi":
      return connector.numberFormatted
    case "instagram_direct":
      return connector.instagramUsername ? `@${connector.instagramUsername}` : null
    case "lead_chat":
      return connector.phoneNumberId
    default:
      return null
  }
}

export function connectorPicture(connector: Connector): string | null {
  switch (connector.type) {
    case "whatsapp_web":
    case "zapi":
    case "instagram_direct":
    case "facebook_messenger":
      return connector.profilePictureUrl
    case "web_widget":
      return connector.botAvatarUrl
    default:
      return null
  }
}

/** A chave de tradução do tipo, em linguagem de gente. */
export function connectorTypeKey(connector: Connector): string {
  if (connector.type === "whatsapp_web" && connector.providerApi === "zapi") {
    return "whatsapp_web_zapi"
  }
  return connector.type
}

/** Provedor do WhatsApp que a origem mostrava como "Powered by". */
export function isWhatsappWeb(connector: Connector): connector is WhatsappWebConnector {
  return connector.type === "whatsapp_web"
}

/**
 * O QR code chega com o prefixo `data:` na Evolution, mas não é garantido na Z-API.
 * Vazio vira `null`: a tela volta a mostrar "gerando", em vez de uma imagem quebrada.
 */
export function qrImageSource(base64: string | null | undefined): string | null {
  if (!base64) return null
  return base64.startsWith("data:") ? base64 : `data:image/png;base64,${base64}`
}

/** "ABCD1234" vira "ABCD-1234". O que já vem separado fica como está. */
export function formatPairCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code
}

/**
 * O que dizer quando uma ação do canal falha. `connectorActionFailed` não traz motivo que
 * valha mostrar; `connectorProviderError` traz o do provedor; o resto cai no texto do
 * servidor, que já vem no idioma da requisição.
 */
export function connectorErrorMessage(
  error: unknown,
  t: (key: string) => string
): string {
  if (!(error instanceof ApiError)) return t("connectors.errors.generic")
  if (error.code === "network") return t("connectors.errors.network")
  if (error.code === "forbidden") return t("connectors.errors.forbidden")
  if (error.code === "connectorActionFailed") return t("connectors.errors.actionFailed")
  if (error.code === "connectorTypeMismatch") return t("connectors.errors.typeMismatch")
  return error.serverMessage ?? t("connectors.errors.generic")
}
