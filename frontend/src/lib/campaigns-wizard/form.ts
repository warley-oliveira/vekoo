import type { Campaign, CampaignMode, MessageType } from "./types"

// O formulário inteiro da criação, e a tradução dele para a API. Módulo sem idioma.

export const WIZARD_STEPS = ["audience", "message", "schedule", "review"] as const
export type WizardStep = (typeof WIZARD_STEPS)[number]

/** `/campaigns/new?placeExtraction=<id>`: é por onde a tela de buscas entrega uma busca ao assistente. */
export const LINKED_EXTRACTION_PARAM = "placeExtraction"

export function isWizardStep(value: string | null): value is WizardStep {
  return (WIZARD_STEPS as readonly string[]).includes(value ?? "")
}

export type MediaChoice = {
  url: string | null
  contentType: string | null
  fileName: string | null
}

export type SendMode = "now" | "later"

export type WizardValues = {
  name: string
  campaignMode: CampaignMode
  connectorIds: string[]
  wabaConnectorId: string | null
  phoneNumberIds: string[]
  messageType: MessageType
  /** Em objeto, porque `useFieldArray` precisa de um id estável para cada variação. */
  messages: { text: string }[]
  attachmentId: string | null
  /** O que mostrar do anexo. Quem manda é `attachmentId`: o servidor lê o resto dele. */
  media: MediaChoice | null
  templateIds: string[]
  templateParams: Record<string, Record<string, string>>
  flowId: string | null
  chatTagIds: string[]
  raiseChats: boolean
  sendMode: SendMode
  scheduledAt: Date | null
  sendWindowStart: string
  sendWindowEnd: string
  sendDays: number[]
  /** Em segundos, como a API. */
  intervalMin: number
  intervalMax: number
  dailyLimitPerConnector: number
  timezone: string
}

export const DEFAULT_TIMEZONE = "America/Sao_Paulo"

export function defaultValues(name: string): WizardValues {
  return {
    name,
    campaignMode: "text",
    connectorIds: [],
    wabaConnectorId: null,
    phoneNumberIds: [],
    messageType: "text",
    messages: [{ text: "" }],
    attachmentId: null,
    media: null,
    templateIds: [],
    templateParams: {},
    flowId: null,
    chatTagIds: [],
    raiseChats: true,
    sendMode: "now",
    scheduledAt: null,
    sendWindowStart: "09:00",
    sendWindowEnd: "18:00",
    sendDays: [1, 2, 3, 4, 5],
    intervalMin: 60,
    intervalMax: 120,
    dailyLimitPerConnector: 500,
    timezone: DEFAULT_TIMEZONE,
  }
}

/** Retomar um rascunho, ou copiar a configuração de uma campanha. O público nunca vem junto. */
export function valuesFromCampaign(campaign: Campaign, name = campaign.name): WizardValues {
  return {
    name,
    campaignMode: campaign.campaignMode,
    connectorIds: campaign.connectorIds,
    wabaConnectorId: campaign.wabaConnectorId,
    phoneNumberIds: campaign.phoneNumberIds,
    messageType: campaign.messageType,
    messages: campaign.messages.length > 0 ? campaign.messages.map((text) => ({ text })) : [{ text: "" }],
    attachmentId: campaign.attachmentId,
    media: campaign.attachmentId
      ? {
          url: campaign.mediaUrl,
          contentType: campaign.mediaContentType,
          fileName: campaign.mediaFileName,
        }
      : null,
    templateIds: campaign.templateIds,
    templateParams: campaign.templateParams ?? {},
    flowId: campaign.flowId,
    chatTagIds: campaign.chatTagIds,
    raiseChats: campaign.raiseChats,
    sendMode: "now",
    scheduledAt: null,
    sendWindowStart: campaign.sendWindowStart,
    sendWindowEnd: campaign.sendWindowEnd,
    sendDays: campaign.sendDays,
    intervalMin: campaign.intervalMin,
    intervalMax: campaign.intervalMax,
    dailyLimitPerConnector: campaign.dailyLimitPerConnector,
    timezone: campaign.timezone,
  }
}

export function filledMessages(values: Pick<WizardValues, "messages">): string[] {
  return values.messages.map((message) => message.text).filter((text) => text.trim().length > 0)
}

export type DraftPayload = Record<string, unknown>

/**
 * O corpo de `POST` e `PATCH /campaigns`. Um modo limpa o que é do outro, e o que ainda está inválido
 * não vai: o rascunho é salvo a cada pausa na digitação, e um nome apagado de passagem não pode virar
 * erro na tela. A validação de verdade é a de avançar e a de lançar.
 */
export function toDraftPayload(values: WizardValues, fallbackName: string): DraftPayload {
  const template = values.campaignMode === "template"
  const media = !template && values.messageType === "media"
  const validInterval =
    values.intervalMin >= 1 && values.intervalMax >= values.intervalMin

  return {
    name: values.name.trim() || fallbackName,
    campaignMode: values.campaignMode,
    messageType: values.messageType,
    messages: template ? [] : filledMessages(values),
    attachmentId: media ? values.attachmentId : null,
    connectorIds: template ? [] : values.connectorIds,
    wabaConnectorId: template ? values.wabaConnectorId : null,
    phoneNumberIds: template ? values.phoneNumberIds : [],
    templateIds: template ? values.templateIds : [],
    templateParams: template ? values.templateParams : {},
    flowId: values.flowId,
    chatTagIds: values.chatTagIds,
    raiseChats: values.raiseChats,
    sendWindowStart: values.sendWindowStart,
    sendWindowEnd: values.sendWindowEnd,
    ...(values.sendDays.length > 0 ? { sendDays: values.sendDays } : {}),
    ...(validInterval ? { intervalMin: values.intervalMin, intervalMax: values.intervalMax } : {}),
    ...(values.dailyLimitPerConnector >= 1
      ? { dailyLimitPerConnector: values.dailyLimitPerConnector }
      : {}),
    timezone: values.timezone,
  }
}

/** Só as chaves que mudaram: `PATCH` não muda o que não vier. */
export function changedKeys(next: DraftPayload, saved: DraftPayload | null): DraftPayload {
  if (!saved) return next

  const changes: DraftPayload = {}
  for (const [key, value] of Object.entries(next)) {
    if (JSON.stringify(value) !== JSON.stringify(saved[key])) changes[key] = value
  }
  return changes
}

/**
 * A pessoa já fez alguma coisa, além do que o formulário nasce com? Só então existe um rascunho a
 * guardar: abrir a tela e sair não pode deixar lixo na lista de campanhas.
 */
export function hasContent(values: WizardValues, initial: WizardValues): boolean {
  return (
    filledMessages(values).length > 0 ||
    Boolean(values.attachmentId) ||
    values.templateIds.length > 0 ||
    values.chatTagIds.length > 0 ||
    Boolean(values.flowId) ||
    values.name.trim() !== initial.name.trim()
  )
}

/* ---------- agendamento: guardado no aparelho ---------- */

// A API só recebe a data na hora de agendar. Para o rascunho retomado não voltar para "agora" sem a
// pessoa notar, a escolha fica aqui até lá.
const SCHEDULE_PREFIX = "vekoo.campaignWizard.schedule."

export function readSavedSchedule(campaignId: string): Date | null {
  try {
    const raw = localStorage.getItem(`${SCHEDULE_PREFIX}${campaignId}`)
    const time = raw ? Number(raw) : Number.NaN
    return Number.isFinite(time) && time > Date.now() ? new Date(time) : null
  } catch {
    return null
  }
}

export function writeSavedSchedule(campaignId: string, value: Date | null): void {
  try {
    if (value) localStorage.setItem(`${SCHEDULE_PREFIX}${campaignId}`, String(value.getTime()))
    else localStorage.removeItem(`${SCHEDULE_PREFIX}${campaignId}`)
  } catch {
    // Sem storage, o agendamento só não sobrevive a recarregar a página.
  }
}
