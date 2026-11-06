import { useCallback, useMemo } from "react"
import { useSWRConfig } from "swr"

import { useApi } from "@/hooks/use-api"
import { apiPost, apiPut } from "@/lib/api"
import type { AttendanceSequence, PreviewBooking, PreviewMessage } from "@/lib/calendar/types"
import { useRevalidateCalendars } from "./use-calendars"

export function sequencesKey(calendarId: string): string {
  return `/calendars/${calendarId}/attendance-sequences`
}

export function useAttendanceSequences(calendarId: string | null | undefined) {
  const { data, error, isLoading, mutate } = useApi<{ attendanceSequences: AttendanceSequence[] }>(
    calendarId ? sequencesKey(calendarId) : null
  )
  return { sequences: data?.attendanceSequences, error, isLoading, reload: () => mutate() }
}

export function useSequenceMutations(calendarId: string) {
  const { mutate } = useSWRConfig()
  const revalidateCalendars = useRevalidateCalendars()

  /** Substitui a lista inteira. Quem vem sem `id` ganha um. */
  const saveSequences = useCallback(
    async (attendanceSequences: AttendanceSequence[]) => {
      const response = await apiPut<{ attendanceSequences: AttendanceSequence[] }>(
        sequencesKey(calendarId),
        { attendanceSequences }
      )
      await mutate(sequencesKey(calendarId), response, { revalidate: false })
      void revalidateCalendars()
      return response.attendanceSequences
    },
    [calendarId, mutate, revalidateCalendars]
  )

  return useMemo(() => ({ saveSequences }), [saveSequences])
}

/* ---------- testar uma mensagem: nada é enviado nem gravado ---------- */

/** Os últimos 50 agendamentos do calendário que têm conversa. */
export function useSequencePreviewBookings(calendarId: string | null, enabled = true) {
  const { data, error, isLoading, mutate } = useApi<{ bookings: PreviewBooking[] }>(
    calendarId && enabled ? `${sequencesKey(calendarId)}/bookings` : null
  )
  return { bookings: data?.bookings, error, isLoading, reload: () => mutate() }
}

export function useReminderPreviewBookings(calendarId: string | null, enabled = true) {
  const { data, error, isLoading, mutate } = useApi<{ bookings: PreviewBooking[] }>(
    calendarId && enabled ? `/calendars/${calendarId}/contact-notification-preview/bookings` : null
  )
  return { bookings: data?.bookings, error, isLoading, reload: () => mutate() }
}

/** Para escolher o histórico da simulação. Exige `calendar`, e não zera as não lidas. */
export function useBookingPreviewMessages(
  calendarId: string | null | undefined,
  bookingId: string | null | undefined
) {
  const { data, error, isLoading, mutate } = useApi<{ messages: PreviewMessage[] }>(
    calendarId && bookingId
      ? `/calendars/${calendarId}/contact-notification-preview/messages?bookingId=${bookingId}&limit=50`
      : null,
    { revalidateOnFocus: false }
  )
  return { messages: data?.messages, error, isLoading, reload: () => mutate() }
}

/**
 * Sem `aiPrompt`, sai o texto preenchido, de graça. Com `aiPrompt`, gera pelo modelo e cobra
 * 1 crédito: `noCredits`, `busy` ou `failed` (o crédito volta).
 */
export function previewSequenceStep(
  calendarId: string,
  input: { bookingId: string; message?: string | null; aiPrompt?: string | null }
) {
  return apiPost<{ message: string }>(`${sequencesKey(calendarId)}/preview`, input)
}

/** Como o passo acima. `messageIds` escolhe o histórico: sem o campo, as últimas 30; `[]`, nenhuma. */
export function previewContactReminder(
  calendarId: string,
  input: {
    bookingId: string
    message?: string | null
    aiPrompt?: string | null
    messageIds?: string[]
  }
) {
  return apiPost<{ message: string }>(
    `/calendars/${calendarId}/contact-notification-preview`,
    input
  )
}
