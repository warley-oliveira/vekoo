import { useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { useCalendarMutations } from "@/hooks/calendar/use-calendars"
import type { AgendaCalendar } from "@/lib/calendar/types"
import { calendarErrorMessage } from "./error-message"

type CalendarFlag =
  | "schedulingNotificationEnabled"
  | "schedulingNotificationReactivateAutomation"
  | "schedulingNotificationIgnoreAutomationPaused"

/**
 * Os interruptores do calendário. A chave já mostra a escolha enquanto a resposta não vem, e volta
 * sozinha se o servidor recusar.
 */
export function useCalendarFlags(calendar: AgendaCalendar) {
  const { t } = useTranslation()
  const { updateCalendar } = useCalendarMutations()
  const [pending, setPending] = useState<Partial<Record<CalendarFlag, boolean>>>({})

  async function setFlag(flag: CalendarFlag, value: boolean, doneMessage: string) {
    setPending((current) => ({ ...current, [flag]: value }))
    try {
      await updateCalendar(calendar.id, { [flag]: value })
      toast.success(doneMessage)
    } catch (cause) {
      toast.error(calendarErrorMessage(t, cause))
    } finally {
      setPending((current) => {
        const next = { ...current }
        delete next[flag]
        return next
      })
    }
  }

  return {
    value: (flag: CalendarFlag) => pending[flag] ?? calendar[flag],
    isSaving: (flag: CalendarFlag) => flag in pending,
    setFlag,
  }
}
