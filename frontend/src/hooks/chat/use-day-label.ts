import { useTranslation } from "react-i18next"

import { formatDate } from "@/lib/date-format"
import { useLanguage } from "@/lib/i18n"

/** O nome de um dia na conversa: "Hoje", "Ontem", o dia da semana até uma semana, e depois a data. */
export function useDayLabel(day: number): string {
  const { t } = useTranslation()
  const language = useLanguage()

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diffDays = Math.round((today.getTime() - day) / (24 * 60 * 60 * 1000))

  if (diffDays === 0) return t("chat.day.today")
  if (diffDays === 1) return t("chat.day.yesterday")
  if (diffDays > 1 && diffDays < 7) {
    const weekday = new Intl.DateTimeFormat(language, { weekday: "long" }).format(day)
    return weekday.charAt(0).toUpperCase() + weekday.slice(1)
  }
  return formatDate(day, language, "medium")
}
