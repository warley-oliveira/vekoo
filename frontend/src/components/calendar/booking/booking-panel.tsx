import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Archive, Ban, CalendarDays, GraduationCap } from "lucide-react"

import {
  Callout,
  FormActions,
  SegmentedControl,
  SidePanel,
  UnsavedChangesDialog,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { BookingActions } from "@/hooks/calendar/use-booking-actions"
import { useGuardedClose } from "@/hooks/use-panel-session"
import { eventHeadline, isCanceled } from "@/lib/calendar/event-status"
import { formatEventWhen, safeTimeZone } from "@/lib/calendar/timezone"
import type { AgendaCalendar, BookingEvent, CalendarEvent, ClassSessionEvent } from "@/lib/calendar/types"
import { useLanguage } from "@/lib/i18n"
import { EventSituationBadge, EventTitle, MeetLink } from "../event-badges"
import { AttendanceSection } from "./attendance-section"
import { useBookingForm, type BookingDraft } from "./booking-form"
import { BookingFields } from "./booking-fields"
import { BookingContactTab, BookingHistory, BookingMessagesTab } from "./booking-tabs"
import { useNewSessionForm } from "./new-session-form"
import { NewSessionFields } from "./session-form"

type NewKind = "booking" | "session"

/**
 * Marcar na agenda: um agendamento ou, quando há calendário de turmas, uma aula avulsa. A escolha
 * inicial vem do que está na tela.
 */
export function NewEventPanel({
  open,
  onOpenChange,
  draft,
  calendars,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  draft: BookingDraft | null
  calendars: AgendaCalendar[]
  onCreated?: (event: CalendarEvent) => void
}) {
  const { t } = useTranslation()
  const staffCalendars = useMemo(
    () => calendars.filter((calendar) => calendar.calendarType === "professional"),
    [calendars]
  )
  const classCalendars = useMemo(
    () => calendars.filter((calendar) => calendar.calendarType === "class_group"),
    [calendars]
  )

  const draftIsClass = classCalendars.some((calendar) => calendar.id === draft?.calendarId)
  const [kind, setKind] = useState<NewKind>(
    staffCalendars.length === 0 || draftIsClass ? "session" : "booking"
  )
  const close = () => onOpenChange(false)

  const done = (event: BookingEvent | ClassSessionEvent) => {
    onCreated?.(event)
    close()
  }

  const bookingDraft = useMemo<BookingDraft | null>(
    () =>
      draft && {
        ...draft,
        calendarId:
          staffCalendars.find((calendar) => calendar.id === draft.calendarId)?.id ??
          staffCalendars[0]?.id ??
          null,
      },
    [draft, staffCalendars]
  )

  const booking = useBookingForm({
    event: null,
    draft: bookingDraft,
    calendars: staffCalendars,
    active: open && kind === "booking",
    onDone: done,
  })
  const session = useNewSessionForm({ calendars: classCalendars, draft, onDone: done })

  const current = kind === "booking" ? booking : session
  const isDirty = current.form.formState.isDirty
  const requestClose = useGuardedClose(isDirty, close)

  return (
    <SidePanel
      open={open}
      onOpenChange={(next) => {
        if (!next) void requestClose()
      }}
      size="lg"
      title={t(kind === "booking" ? "calendar.booking.new.title" : "calendar.session.new.panelTitle")}
      onSubmit={current.submit}
      footer={
        <FormActions
          form={current.form}
          submitLabel={t(
            kind === "booking" ? "calendar.booking.new.submit" : "calendar.session.new.submit"
          )}
          onCancel={close}
        />
      }
    >
      <UnsavedChangesDialog when={open && isDirty} />

      <div className="flex flex-col gap-4">
        {staffCalendars.length > 0 && classCalendars.length > 0 ? (
          <SegmentedControl
            aria-label={t("calendar.booking.new.kind")}
            fullWidth
            value={kind}
            onChange={setKind}
            options={[
              {
                value: "booking",
                icon: <CalendarDays />,
                label: t("calendar.booking.new.kindBooking"),
              },
              {
                value: "session",
                icon: <GraduationCap />,
                label: t("calendar.booking.new.kindSession"),
              },
            ]}
          />
        ) : null}

        {kind === "booking" ? (
          <BookingFields
            form={booking.form}
            calendars={staffCalendars}
            event={null}
            draftChat={draft?.chat}
            resolvedProfessional={booking.resolvedProfessional}
          />
        ) : (
          <NewSessionFields form={session.form} calendars={classCalendars} />
        )}
      </div>
    </SidePanel>
  )
}

/** Abrir um agendamento: ver, remarcar, marcar presença, cancelar. */
export function BookingPanel({
  open,
  onOpenChange,
  event,
  calendars,
  actions,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  event: BookingEvent
  calendars: AgendaCalendar[]
  actions: BookingActions
}) {
  const { t } = useTranslation()
  const language = useLanguage()
  const calendar = calendars.find((item) => item.id === event.calendarId) ?? null
  const zone = safeTimeZone(calendar?.timeZone)
  const close = () => onOpenChange(false)
  const [tab, setTab] = useState("details")

  const { form, submit, resolvedProfessional } = useBookingForm({
    event,
    draft: null,
    calendars,
    active: open,
    onDone: close,
  })
  const isDirty = form.formState.isDirty
  const dirtyFields = form.formState.dirtyFields
  const timeChanged = Boolean(dirtyFields.start || dirtyFields.end)
  const requestClose = useGuardedClose(isDirty, close)
  const canceled = isCanceled(event)

  async function runThenClose(action: () => Promise<unknown>) {
    const done = await action()
    if (done) close()
  }

  return (
    <SidePanel
      open={open}
      onOpenChange={(next) => {
        if (!next) void requestClose()
      }}
      size="lg"
      title={
        <EventTitle color={event.color}>
          {eventHeadline(event).title || t("calendar.event.untitled")}
        </EventTitle>
      }
      description={formatEventWhen(event.start, event.end, zone, language)}
      onSubmit={submit}
      footer={
        <FormActions
          form={form}
          submitLabel={t("calendar.booking.edit.submit")}
          cancelLabel={t("calendar.common.close")}
          onCancel={close}
          requireChanges
        />
      }
    >
      <UnsavedChangesDialog when={open && isDirty} />

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2 empty:hidden">
          <EventSituationBadge event={event} />
          {event.googleMeetUrl ? <MeetLink url={event.googleMeetUrl} /> : null}
          {calendar ? (
            <span className="text-xs text-muted-foreground">{calendar.name}</span>
          ) : null}
        </div>

        {canceled ? (
          <Callout tone="neutral" icon={<Ban aria-hidden className="size-4" />}>
            {t("calendar.booking.canceledNotice")}
          </Callout>
        ) : null}

        <AttendanceSection event={event} calendar={calendar} actions={actions} />

        <Tabs value={tab} onValueChange={(next) => setTab(String(next))}>
          <TabsList variant="line" className="w-full justify-start overflow-x-auto [scrollbar-width:none]">
            <TabsTrigger value="details">{t("calendar.booking.tabs.details")}</TabsTrigger>
            <TabsTrigger value="contact">{t("calendar.booking.tabs.contact")}</TabsTrigger>
            {event.chatId ? (
              <TabsTrigger value="messages">{t("calendar.booking.tabs.messages")}</TabsTrigger>
            ) : null}
            <TabsTrigger value="history">{t("calendar.booking.tabs.history")}</TabsTrigger>
          </TabsList>

          {/* O formulário continua montado nas outras abas: trocar de aba não perde o que foi digitado. */}
          <TabsContent value="details" keepMounted className="pt-3 data-hidden:hidden">
            <div className="flex flex-col gap-4">
              <BookingFields
                form={form}
                calendars={calendars}
                event={event}
                resolvedProfessional={resolvedProfessional}
              />

              {timeChanged ? (
                <p className="text-xs text-pretty text-muted-foreground">
                  {t("calendar.booking.edit.rescheduleHint")}
                </p>
              ) : null}

              <div className="flex flex-wrap gap-1 border-t pt-3">
                {canceled ? null : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="-ml-2 text-muted-foreground hover:text-destructive pointer-coarse:h-10"
                    onClick={() => void runThenClose(() => actions.cancel(event))}
                  >
                    <Ban />
                    {t("calendar.booking.cancel.action")}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive pointer-coarse:h-10"
                  onClick={() => void runThenClose(() => actions.archive(event))}
                >
                  <Archive />
                  {t("calendar.booking.archive.action")}
                </Button>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="contact" className="pt-3">
            <BookingContactTab event={event} />
          </TabsContent>
          {event.chatId ? (
            <TabsContent value="messages" className="pt-3">
              <BookingMessagesTab event={event} timeZone={zone} />
            </TabsContent>
          ) : null}
          <TabsContent value="history" className="pt-3">
            <BookingHistory event={event} timeZone={zone} />
          </TabsContent>
        </Tabs>
      </div>
    </SidePanel>
  )
}
