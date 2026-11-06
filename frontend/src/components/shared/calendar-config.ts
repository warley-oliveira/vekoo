import { enUS, ptBR } from "react-day-picker/locale"

import { useLanguage } from "@/lib/i18n"

/** O idioma do calendário acompanha o do app. */
export function useCalendarLocale() {
  return useLanguage() === "en" ? enUS : ptBR
}

/** Dedo pede dia de 40 px; o mouse se vira com menos. */
export const CALENDAR_CELLS = "mx-auto [--cell-size:--spacing(10)] md:[--cell-size:--spacing(8)]"
