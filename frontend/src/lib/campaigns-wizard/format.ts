import type { TFunction } from "i18next"

import { formatNumber } from "@/lib/format-number"
import { hourOf, timezoneLabel } from "./estimate"

// Tempo em palavras, para a pessoa nunca ler "intervalo de 180 segundos".

export function formatSeconds(seconds: number, t: TFunction, language: string): string {
  if (seconds < 60) return t("campaignsWizard.time.seconds", { value: seconds })

  const minutes = seconds / 60
  return t("campaignsWizard.time.minutes", {
    value: formatNumber(minutes, language, { maximumFractionDigits: 1 }),
  })
}

export function formatRange(min: number, max: number, t: TFunction, language: string): string {
  if (min === max) return formatSeconds(min, t, language)

  return t("campaignsWizard.time.range", {
    from: formatSeconds(min, t, language),
    to: formatSeconds(max, t, language),
  })
}

/** Os nomes dos dias pelo `Intl`, do domingo ao sábado. 4 de janeiro de 2026 é um domingo. */
export function weekdayName(day: number, language: string, style: "short" | "long" = "short"): string {
  const date = new Date(Date.UTC(2026, 0, 4 + day, 12))
  return new Intl.DateTimeFormat(language, { weekday: style, timeZone: "UTC" }).format(date).replace(/\.$/, "")
}

/** "de segunda a sexta", "todos os dias", ou a lista. */
export function describeDays(days: number[], t: TFunction, language: string): string {
  const sorted = [...days].sort((a, b) => a - b)
  if (sorted.length === 7) return t("campaignsWizard.time.everyDay")
  if (sorted.join() === "1,2,3,4,5") return t("campaignsWizard.time.weekdays")

  return new Intl.ListFormat(language, { style: "long", type: "conjunction" }).format(
    sorted.map((day) => weekdayName(day, language, "long"))
  )
}

/** Um fuso que a tela não conhece ainda sai pelo nome de origem, sem o sublinhado. */
export function describeTimezone(timezone: string, t: TFunction, language: string): string {
  const city = t(`campaignsWizard.timezones.${timezone}`, {
    defaultValue: timezone.split("/").at(-1)?.replace(/_/g, " ") ?? timezone,
  })
  return timezoneLabel(city, timezone, language)
}

export function isFullDay(start: string, end: string): boolean {
  return hourOf(end) <= hourOf(start)
}

export function describeHours(start: string, end: string, t: TFunction): string {
  if (isFullDay(start, end)) return t("campaignsWizard.time.allDay")

  return t("campaignsWizard.time.between", { start: hourOf(start), end: hourOf(end) })
}
