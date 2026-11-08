import { useTranslation } from "react-i18next"
import { Popover as PopoverPrimitive } from "@base-ui/react/popover"
import { Ban, GraduationCap, ListChecks, MapPin, MessageCircle, User } from "lucide-react"
import { Link } from "@/lib/router"

import { Button } from "@/components/ui/button"
import { useCan } from "@/hooks/use-can"
import type { BookingActions } from "@/hooks/calendar/use-booking-actions"
import { eventHeadline, isCanceled } from "@/lib/calendar/event-status"
import { formatEventWhen, safeTimeZone } from "@/lib/calendar/timezone"
import type { BookingEvent, CalendarEvent, ClassSessionEvent } from "@/lib/calendar/types"
import { useLanguage } from "@/lib/i18n"
import { AttendanceToggle, EventSituationBadge, MeetLink, SessionOccupancy } from "./event-badges"

export function EventPreview({
  event,
  anchor,
  timeZone,
  actions,
  sequenceName,
  popupHandlers,
  onClose,
  onOpenFull,
}: {
  event: CalendarEvent | null
  anchor: HTMLElement | null
  timeZone: string
  actions: BookingActions
  sequenceName?: string
  popupHandlers: { onMouseEnter: () => void; onMouseLeave: () => void }
  onClose: () => void
  onOpenFull: (event: CalendarEvent) => void
}) {
  const { t } = useTranslation()
  const language = useLanguage()

  return (
    <PopoverPrimitive.Root
      open={Boolean(event && anchor?.isConnected)}
      modal={false}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          anchor={anchor}
          side="right"
          align="start"
          sideOffset={8}
          className="isolate z-40"
        >
          <PopoverPrimitive.Popup
            initialFocus={false}
            finalFocus={false}
            {...popupHandlers}
            className="flex w-80 origin-(--transform-origin) flex-col gap-3 rounded-lg bg-popover p-3.5 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden duration-100 data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0"
          >
            {event ? (
              <>
                <div className="space-y-1">
                  <div className="flex items-start gap-2">
                    <span
                      aria-hidden
                      className="mt-1.5 size-2.5 shrink-0 rounded-full bg-muted-foreground/40"
                      style={event.color ? { backgroundColor: event.color } : undefined}
                    />
                    <PopoverPrimitive.Title className="min-w-0 flex-1 font-heading text-base leading-snug font-medium">
                      {eventHeadline(event).title || t("calendar.event.untitled")}
                    </PopoverPrimitive.Title>
                  </div>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {formatEventWhen(
                      event.start,
                      event.end,
                      safeTimeZone(timeZone),
                      language
                    )}
                  </p>
                </div>

                {event.type === "booking" ? (
                  <BookingPreview
                    event={event}
                    actions={actions}
                    sequenceName={sequenceName}
                    onClose={onClose}
                  />
                ) : (
                  <SessionPreview event={event} />
                )}

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="-mb-1 self-start text-muted-foreground"
                  onClick={() => onOpenFull(event)}
                >
                  {t("calendar.preview.openDetails")}
                </Button>
              </>
            ) : null}
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

function Line({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-sm [&>svg]:mt-0.5 [&>svg]:size-3.5 [&>svg]:shrink-0 [&>svg]:text-muted-foreground">
      {icon}
      <div className="min-w-0 flex-1 truncate">{children}</div>
    </div>
  )
}

function BookingPreview({
  event,
  actions,
  sequenceName,
  onClose,
}: {
  event: BookingEvent
  actions: BookingActions
  sequenceName?: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const canChat = useCan("chat")
  const canceled = isCanceled(event)
  // Como na agenda e no modal: presença só depois de começar, ou para desfazer o que foi marcado.
  const canMark = !canceled && (event.start <= Date.now() || Boolean(event.attendanceStatus))

  return (
    <>
      <div className="flex flex-col gap-1.5 empty:hidden">
        {event.professionalName ? (
          <Line icon={<User aria-hidden />}>
            <span className="text-muted-foreground">{t("calendar.preview.professional")}</span>{" "}
            {event.professionalName}
          </Line>
        ) : null}
        {event.userName ? (
          <Line icon={<MessageCircle aria-hidden />}>
            <span className="text-muted-foreground">{t("calendar.preview.contact")}</span>{" "}
            {event.chatId && canChat ? (
              <Link
                to={`/chat/${event.chatId}`}
                className="underline-offset-4 outline-none hover:underline focus-visible:underline"
              >
                {event.userName}
              </Link>
            ) : (
              event.userName
            )}
          </Line>
        ) : null}
        {event.enrolledSequenceId ? (
          <Line icon={<ListChecks aria-hidden />}>
            {t("calendar.sequence.enrolledIn", {
              name: sequenceName ?? t("calendar.sequence.fallbackName"),
            })}
          </Line>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 empty:hidden">
        <EventSituationBadge event={event} />
        {event.googleMeetUrl ? <MeetLink url={event.googleMeetUrl} /> : null}
      </div>

      {canceled ? null : (
        <div className="flex items-center gap-1.5">
          {canMark ? (
            <AttendanceToggle
              event={event}
              size="labeled"
              className="flex-1"
              onToggle={(booking, status) => void actions.toggleAttendance(booking, status)}
            />
          ) : (
            <span className="flex-1" />
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("calendar.booking.cancel.action")}
            title={t("calendar.booking.cancel.action")}
            className="shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => {
              onClose()
              void actions.cancel(event)
            }}
          >
            <Ban />
          </Button>
        </div>
      )}
    </>
  )
}

function SessionPreview({ event }: { event: ClassSessionEvent }) {
  const { t } = useTranslation()
  const summary = event.attendanceSummary
  return (
    <>
      <div className="flex flex-col gap-1.5 empty:hidden">
        {event.instructorName ? (
          <Line icon={<GraduationCap aria-hidden />}>
            <span className="text-muted-foreground">{t("calendar.preview.instructor")}</span>{" "}
            {event.instructorName}
          </Line>
        ) : null}
        {event.room ? (
          <Line icon={<MapPin aria-hidden />}>
            <span className="text-muted-foreground">{t("calendar.preview.room")}</span> {event.room}
          </Line>
        ) : null}
      </div>
      <EventSituationBadge event={event} />
      <SessionOccupancy count={event.enrollmentCount} max={event.maxStudents} />
      {summary && (summary.show > 0 || summary.noShow > 0 || summary.pending > 0) ? (
        <p className="text-xs text-muted-foreground tabular-nums">
          {t("calendar.session.summaryLong", {
            show: summary.show,
            noShow: summary.noShow,
            pending: summary.pending,
          })}
        </p>
      ) : null}
    </>
  )
}
