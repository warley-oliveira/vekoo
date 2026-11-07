import type { TFunction } from "i18next"

import { formatTime, startOfDay } from "@/lib/date-format"
import { isAllDay } from "./send-window"
import type { Campaign, CampaignConnector } from "./types"

const DAY = 24 * 60 * 60 * 1000
const WEEK_LENGTH = 7
const WORKING_DAYS = [1, 2, 3, 4, 5]
// 1º de janeiro de 2023 foi um domingo: é só para o `Intl` dar o nome do dia.
const SUNDAY = Date.UTC(2023, 0, 1)

/** "hoje às 16:40", "amanhã às 08:10", "quinta-feira às 10:00", "12 de mai. às 10:00". */
export function formatWhen(value: number, language: string, t: TFunction, now = Date.now()): string {
  const date = new Date(value)
  const days = Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / DAY)
  const time = formatTime(date, language)

  if (days === 0) return t("campaigns.when.today", { time })
  if (days === 1) return t("campaigns.when.tomorrow", { time })
  if (days > 1 && days < WEEK_LENGTH) {
    const weekday = new Intl.DateTimeFormat(language, { weekday: "long" }).format(date)
    return t("campaigns.when.weekday", { weekday, time })
  }
  const day = new Intl.DateTimeFormat(language, { day: "numeric", month: "short" }).format(date)
  return t("campaigns.when.date", { date: day, time })
}

/** Data curta, para colunas: "06/11". */
export function formatShortDate(value: number, language: string): string {
  return new Intl.DateTimeFormat(language, { day: "2-digit", month: "2-digit" }).format(value)
}

/** "das 09:00 às 18:00", ou "o dia todo". */
export function formatSendWindow(
  campaign: Pick<Campaign, "sendWindowStart" | "sendWindowEnd" | "sendDays" | "timezone">,
  t: TFunction
): string {
  if (isAllDay(campaign)) return t("campaigns.config.allDay")
  return t("campaigns.config.windowValue", {
    start: campaign.sendWindowStart,
    end: campaign.sendWindowEnd,
  })
}

/** "todos os dias", "de segunda a sexta", ou a lista. */
export function formatSendDays(days: number[], language: string, t: TFunction): string {
  const sorted = [...days].sort((a, b) => a - b)
  if (sorted.length === WEEK_LENGTH) return t("campaigns.config.everyDay")
  if (sorted.join() === WORKING_DAYS.join()) return t("campaigns.config.workingDays")

  const name = new Intl.DateTimeFormat(language, { weekday: "short", timeZone: "UTC" })
  const list = new Intl.ListFormat(language, { style: "long", type: "conjunction" })
  return list.format(sorted.map((day) => name.format(SUNDAY + day * DAY)))
}

/** A API guarda segundos. Quem configura pensa em minutos, então sai em minutos sempre que der. */
export function formatInterval(min: number, max: number, t: TFunction): string {
  if (min % 60 === 0 && max % 60 === 0) {
    const [low, high] = [min / 60, max / 60]
    return low === high
      ? t("campaigns.config.intervalMinutes", { count: low })
      : t("campaigns.config.intervalMinutesRange", { min: low, max: high })
  }
  return min === max
    ? t("campaigns.config.intervalSeconds", { count: min })
    : t("campaigns.config.intervalSecondsRange", { min, max })
}

export function connectorLabel(connector: CampaignConnector): string {
  return connector.profileName || connector.name || connector.numberFormatted || connector.displayPhoneNumber || connector.id
}

/** O canal, em uma linha: "WhatsApp · Doma Store", "WhatsApp oficial · Doma Store +1". */
export function channelLabel(
  campaign: Pick<Campaign, "campaignMode" | "connectorIds" | "wabaConnectorId">,
  connectors: Map<string, CampaignConnector>,
  t: TFunction
): string {
  const official = campaign.campaignMode === "template"
  const kind = t(official ? "campaigns.channel.official" : "campaigns.channel.whatsapp")
  const ids = official
    ? campaign.wabaConnectorId
      ? [campaign.wabaConnectorId]
      : []
    : campaign.connectorIds
  const known = ids.flatMap((id) => {
    const connector = connectors.get(id)
    return connector ? [connectorLabel(connector)] : []
  })

  if (known.length === 0) return kind
  if (known.length === 1) return t("campaigns.channel.one", { kind, name: known[0] })
  return t("campaigns.channel.many", { kind, name: known[0], others: known.length - 1 })
}
