import type { WizardValues } from "@/lib/campaigns-wizard/form"

/** Quantos canais andam ao mesmo tempo: os números conectados, ou os da conta oficial. */
export function channelCount(values: Pick<WizardValues, "campaignMode" | "connectorIds" | "phoneNumberIds">): number {
  return values.campaignMode === "template" ? values.phoneNumberIds.length : values.connectorIds.length
}
