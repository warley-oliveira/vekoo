import { useCallback, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { useConfirm } from "@/components/shared"
import { eventErrorMessage } from "@/lib/calendar/event-error"
import { formatEventWhen, safeTimeZone } from "@/lib/calendar/timezone"
import type {
  AgendaCalendar,
  AttendanceStatus,
  BookingEvent,
  CalendarEvent,
  ClassSessionEvent,
  SequenceTrigger,
} from "@/lib/calendar/types"
import { useLanguage } from "@/lib/i18n"
import { useEventMutations } from "./use-calendar-events"

export type EnrollTarget = { event: BookingEvent; trigger: SequenceTrigger }

/**
 * As ações sobre um evento, as mesmas em qualquer canto da tela: grade, agenda, prévia e painel.
 * Ficam aqui para o retorno, a confirmação e o texto não variarem de um lugar para outro.
 */
export function useBookingActions(calendars: AgendaCalendar[] | undefined) {
  const { t } = useTranslation()
  const language = useLanguage()
  const confirm = useConfirm()
  const mutations = useEventMutations()
  const [enrollTarget, setEnrollTarget] = useState<EnrollTarget | null>(null)

  const calendarOf = useCallback(
    (id: string) => calendars?.find((calendar) => calendar.id === id),
    [calendars]
  )

  /** Marcar de novo o que já está marcado desmarca. */
  const toggleAttendance = useCallback(
    async (event: BookingEvent, status: AttendanceStatus) => {
      const next = event.attendanceStatus === status ? null : status
      try {
        const saved = await mutations.setAttendance(event, next)
        if (next === "show") toast.success(t("calendar.attendance.markedShow"))
        else if (next === "no_show") toast.warning(t("calendar.attendance.markedNoShow"))
        else toast.info(t("calendar.attendance.cleared"))

        // Marcou, e a automática não pegou: oferece as sequências que dependem de alguém escolher.
        if (next && !saved.enrolledSequenceId && saved.chatId) {
          const manual = calendarOf(saved.calendarId)?.attendanceSequences.filter(
            (sequence) => sequence.trigger === next && sequence.enabled && !sequence.autoEnroll
          )
          if (manual?.length) setEnrollTarget({ event: saved, trigger: next })
        }
      } catch (cause) {
        toast.error(eventErrorMessage(t, cause))
      }
    },
    [calendarOf, mutations, t]
  )

  const cancel = useCallback(
    async (event: BookingEvent) => {
      const confirmed = await confirm({
        title: t("calendar.booking.cancel.title"),
        description: t("calendar.booking.cancel.description"),
        confirmLabel: t("calendar.booking.cancel.confirm"),
        cancelLabel: t("calendar.booking.cancel.back"),
        destructive: true,
        onConfirm: async () => {
          await mutations.cancelBooking(event)
        },
      })
      if (confirmed) toast.success(t("calendar.booking.cancel.done"))
      return confirmed
    },
    [confirm, mutations, t]
  )

  /** A API chama de `DELETE`, mas guarda: some da agenda e continua no banco, com o histórico. */
  const archive = useCallback(
    async (event: BookingEvent) => {
      const confirmed = await confirm({
        title: t("calendar.booking.archive.title"),
        description: t("calendar.booking.archive.description"),
        confirmLabel: t("calendar.booking.archive.confirm"),
        cancelLabel: t("calendar.booking.archive.back"),
        destructive: true,
        onConfirm: () => mutations.archiveBooking(event),
      })
      if (confirmed) toast.success(t("calendar.booking.archive.done"))
      return confirmed
    },
    [confirm, mutations, t]
  )

  const unenroll = useCallback(
    async (event: BookingEvent) => {
      const confirmed = await confirm({
        title: t("calendar.sequence.unenroll.title"),
        description: t("calendar.sequence.unenroll.description"),
        confirmLabel: t("calendar.sequence.unenroll.confirm"),
        cancelLabel: t("calendar.sequence.unenroll.back"),
        destructive: true,
        onConfirm: () => mutations.unenrollSequence(event),
      })
      if (confirmed) toast.success(t("calendar.sequence.unenroll.done"))
    },
    [confirm, mutations, t]
  )

  /** Arrastar na grade: a mudança já está na tela, e volta sozinha se a API recusar. */
  const move = useCallback(
    async (event: CalendarEvent, start: number, end: number, revert: () => void) => {
      const zone = safeTimeZone(calendarOf(event.calendarId)?.timeZone)
      const previous = { start: event.start, end: event.end }
      try {
        const saved =
          event.type === "booking"
            ? await mutations.rescheduleBooking(event, start, end)
            : await mutations.moveSession(event, start, end)
        toast.success(
          t("calendar.move.done", { when: formatEventWhen(start, end, zone, language) }),
          {
            action: {
              label: t("calendar.move.undo"),
              onClick: () => {
                const undo =
                  saved.type === "booking"
                    ? mutations.rescheduleBooking(saved, previous.start, previous.end)
                    : mutations.moveSession(
                        saved as ClassSessionEvent,
                        previous.start,
                        previous.end
                      )
                undo
                  .then(() => toast.success(t("calendar.move.undone")))
                  .catch((cause: unknown) => toast.error(eventErrorMessage(t, cause)))
              },
            },
          }
        )
      } catch (cause) {
        revert()
        toast.error(eventErrorMessage(t, cause))
      }
    },
    [calendarOf, language, mutations, t]
  )

  return useMemo(
    () => ({
      toggleAttendance,
      cancel,
      archive,
      unenroll,
      move,
      enrollTarget,
      openEnroll: setEnrollTarget,
      closeEnroll: () => setEnrollTarget(null),
      mutations,
    }),
    [archive, cancel, enrollTarget, move, mutations, toggleAttendance, unenroll]
  )
}

export type BookingActions = ReturnType<typeof useBookingActions>
