import { templateVariables } from "@/lib/chat-details/template-params"
import type { WhatsappTemplate } from "@/lib/connectors/types"

/**
 * O envio de campanha só preenche o corpo, por posição (`Outreach::MessageContent#template_components`).
 * Modelo com variável em cabeçalho, botão ou com nome seria recusado pela Meta, um destinatário de cada
 * vez: melhor dizer na tela do que deixar escolher.
 */
export function templateFitsCampaign(template: WhatsappTemplate): boolean {
  return templateVariables(template).every(
    (variable) => variable.component === "body" && /^\d+$/.test(variable.name)
  )
}

/** As lacunas do corpo, pela posição. */
export function templatePositions(template: WhatsappTemplate): string[] {
  return templateVariables(template).map((variable) => variable.name)
}
