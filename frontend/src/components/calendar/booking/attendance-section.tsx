import { useState } from "react"
import { useTranslation } from "react-i18next"
import { ListChecks, Sparkles } from "lucide-react"

import { StatusBadge } from "@/components/shared"
import { Button } from "@/components/ui/button"
import type { BookingActions } from "@/hooks/calendar/use-booking-actions"
import { isCanceled } from "@/lib/calendar/event-status"
import type { AgendaCalendar, BookingEvent, SequenceTrigger } from "@/lib/calendar/types"
import { SequencesShowcase } from "../sequences/sequences-showcase"
import { AttendanceToggle } from "../event-badges"

/**
 * Veio ou faltou, e a sequência que continua a conversa depois disso. A marcação vale na hora,
 * sem depender de salvar o formulário.
 */
export function AttendanceSection({
  event,
  calendar,
  actions,
}: {
  event: BookingEvent
  calendar: AgendaCalendar | null
  actions: BookingActions
}) {
  const { t } = useTranslation()
  const [showcaseOpen, setShowcaseOpen] = useState(false)

  // Antes de começar não há o que marcar, a não ser para desfazer. Cancelado também não.
  const canMark = event.start <= Date.now() || Boolean(event.attendanceStatus)
  if (isCanceled(event) || !canMark) return null

  const sequences = calendar?.attendanceSequences ?? []
  const trigger: SequenceTrigger | null = event.attendanceStatus
  const manual = trigger
    ? sequences.filter((item) => item.trigger === trigger && item.enabled && !item.autoEnroll)
    : []
  const enrolled = event.enrolledSequenceId
    ? sequences.find((item) => item.id === event.enrolledSequenceId)
    : null

  return (
    <section aria-labelledby="attendance-title" className="flex flex-col gap-2">
      <h3 id="attendance-title" className="text-sm font-medium">
        {t("calendar.attendance.title")}
      </h3>
      <AttendanceToggle
        event={event}
        size="labeled"
        onToggle={(booking, status) => void actions.toggleAttendance(booking, status)}
      />

      {event.enrolledSequenceId ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-muted/60 px-3 py-2 text-sm">
          <ListChecks aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            {t("calendar.sequence.enrolledIn", {
              name: enrolled?.name ?? t("calendar.sequence.fallbackName"),
            })}
            {enrolled ? (
              <span className="text-muted-foreground">
                {" · "}
                {t("calendar.sequence.steps", { count: enrolled.steps.length })}
              </span>
            ) : null}
          </span>
          <span className="flex gap-1">
            {trigger && manual.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="pointer-coarse:h-10"
                onClick={() => actions.openEnroll({ event, trigger })}
              >
                {t("calendar.sequence.change")}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive pointer-coarse:h-10"
              onClick={() => void actions.unenroll(event)}
            >
              {t("calendar.sequence.cancelEnrollment")}
            </Button>
          </span>
        </div>
      ) : trigger && manual.length > 0 && event.chatId ? (
        <button
          type="button"
          onClick={() => actions.openEnroll({ event, trigger })}
          className="flex min-h-11 items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-left text-sm transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ListChecks aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block font-medium">{t("calendar.sequence.enrollCta")}</span>
            <span className="block text-xs text-muted-foreground">
              {t("calendar.sequence.enrollHint")}
            </span>
          </span>
          <StatusBadge tone="neutral">
            {t("calendar.sequence.available", { count: manual.length })}
          </StatusBadge>
        </button>
      ) : trigger && !event.chatId ? (
        <p className="text-xs text-muted-foreground">{t("calendar.sequence.needsChat")}</p>
      ) : sequences.length === 0 ? (
        <button
          type="button"
          onClick={() => setShowcaseOpen(true)}
          className="flex min-h-11 items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-left text-sm transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Sparkles aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block font-medium">{t("calendar.sequence.discover.title")}</span>
            <span className="block text-xs text-muted-foreground">
              {t("calendar.sequence.discover.description")}
            </span>
          </span>
          <span className="text-xs font-medium text-primary">
            {t("calendar.sequence.discover.action")}
          </span>
        </button>
      ) : null}

      <SequencesShowcase
        open={showcaseOpen}
        onOpenChange={setShowcaseOpen}
        calendarId={event.calendarId}
      />
    </section>
  )
}
