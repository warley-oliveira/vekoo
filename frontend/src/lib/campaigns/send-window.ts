import type { Campaign } from "./types"

// O horário de envio, no fuso da campanha, com as regras de `Outreach::SendWindow`. É o que explica
// uma campanha "em andamento" que não anda: fora do horário, ela espera, e a pessoa precisa saber.

type WindowCampaign = Pick<Campaign, "sendWindowStart" | "sendWindowEnd" | "sendDays" | "timezone">

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const DAY = 24 * 60 * 60 * 1000

function hourOf(value: string | null): number {
  return Number(value?.split(":")[0] ?? 0)
}

function zonedClock(now: Date, timeZone: string): { weekday: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(now)

  return {
    weekday: WEEKDAYS.indexOf(parts.find((part) => part.type === "weekday")?.value ?? "Sun"),
    hour: Number(parts.find((part) => part.type === "hour")?.value ?? 0),
  }
}

/** Fim menor ou igual ao início: janela de 24 horas. */
export function isAllDay(campaign: WindowCampaign): boolean {
  return hourOf(campaign.sendWindowEnd) <= hourOf(campaign.sendWindowStart)
}

export type SendWindowState =
  | { open: true }
  /** `at` serve para dizer o dia; a hora que vale é `sendWindowStart`, no fuso da campanha. */
  | { open: false; at: Date; daysAhead: number }

export function sendWindowState(campaign: WindowCampaign, now = new Date()): SendWindowState {
  // Sem dia nenhum a API recusa a campanha. Aqui, só não inventa um horário.
  if (campaign.sendDays.length === 0) return { open: true }

  const { weekday, hour } = zonedClock(now, campaign.timezone)
  const start = hourOf(campaign.sendWindowStart)
  const end = hourOf(campaign.sendWindowEnd)
  const allDay = isAllDay(campaign)
  const allowedToday = campaign.sendDays.includes(weekday)

  if (allowedToday && (allDay || (hour >= start && hour < end))) return { open: true }
  // Hoje vale, mas ainda não abriu.
  if (allowedToday && !allDay && hour < start) return { open: false, at: now, daysAhead: 0 }

  for (let daysAhead = 1; daysAhead <= 7; daysAhead += 1) {
    if (campaign.sendDays.includes((weekday + daysAhead) % 7)) {
      return { open: false, at: new Date(now.getTime() + daysAhead * DAY), daysAhead }
    }
  }
  return { open: true }
}
