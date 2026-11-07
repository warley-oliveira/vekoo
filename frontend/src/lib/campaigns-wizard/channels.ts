import type { WhatsappCloudConnector, WhatsappWebConnector } from "@/lib/connectors/types"

// Como um canal aparece para a pessoa: o nome do perfil e o número, nunca o da instância.

export function connectorLabel(connector: WhatsappWebConnector | WhatsappCloudConnector): string {
  return connector.profileName || connector.name
}

export function connectorNumber(connector: WhatsappWebConnector | WhatsappCloudConnector): string | null {
  return connector.type === "whatsapp_web" ? connector.numberFormatted : connector.displayPhoneNumber
}

/** Os números de uma conta oficial. Sem a lista guardada, o principal. */
export function wabaNumbers(connector: WhatsappCloudConnector) {
  if (connector.phoneNumberList.length > 0) return connector.phoneNumberList

  return connector.phoneNumberId
    ? [
        {
          id: connector.phoneNumberId,
          displayPhoneNumber: connector.displayPhoneNumber,
          verifiedName: connector.profileName,
          qualityRating: connector.qualityRating,
        },
      ]
    : []
}
