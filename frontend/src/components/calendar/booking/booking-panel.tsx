import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Ban, CalendarDays, GraduationCap, PencilLine, Trash2 } from "lucide-react"

import {
  ActionsMenu,
  FormActions,
  ResponsiveDialog,
  SegmentedControl,
  StatusBadge,
  UnsavedChangesDialog,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { BookingActions } from "@/hooks/calendar/use-booking-actions"
import { useIsTouch } from "@/hooks/use-media-query"
import { useGuardedClose } from "@/hooks/use-panel-session"
import { eventHeadline, isCanceled, isPastEvent } from "@/lib/calendar/event-status"
import { safeTimeZone } from "@/lib/calendar/timezone"
import type { AgendaCalendar, BookingEvent, CalendarEvent, ClassSessionEvent } from "@/lib/calendar/types"
import { EventSituationBadge, EventTitle } from "../event-badges"
import { useBookingForm, type BookingDraft } from "./booking-form"
import { BookingFields } from "./booking-fields"
import { BookingSummary } from "./booking-summary"
import { BookingContactTab, BookingHistory, BookingMessagesTab } from "./booking-tabs"
import { useNewSessionForm } from "./new-session-form"
import { NewSessionFields } from "./session-form"

type NewKind = "booking" | "session"

/**
 * Marcar na agenda: um agendamento ou, quando há calendário de turmas, uma aula avulsa. A escolha
 * inicial vem do que está na tela. Um formulário de uma coluna, com o essencial à vista e o resto
 * guardado em "Título, cor e descrição".
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
    <ResponsiveDialog
      size="lg"
      open={open}
      onOpenChange={(next) => {
        if (!next) void requestClose()
      }}
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

      <div className="flex flex-col gap-5">
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
    </ResponsiveDialog>
  )
}

/** A situação no topo do modal, sempre com um nome: aqui, ao contrário da grade, não é ruído. */
function BookingStatus({ event }: { event: BookingEvent }) {
  const { t } = useTranslation()
  if (isCanceled(event) || event.attendanceStatus || isPastEvent(event)) {
    return <EventSituationBadge event={event} />
  }
  return <StatusBadge tone="neutral">{t("calendar.situation.scheduled")}</StatusBadge>
}

/**
 * Abrir um agendamento. Abre para ler: quando, com quem e como está, com a presença a um toque.
 * "Editar" troca o resumo pelo formulário no mesmo lugar, e salvar volta ao resumo, já atualizado.
 * Ao lado (embaixo, no celular), o que ajuda a decidir: o contato, a conversa e o histórico.
 */
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
  const calendar = calendars.find((item) => item.id === event.calendarId) ?? null
  const zone = safeTimeZone(calendar?.timeZone)
  const close = () => onOpenChange(false)
  const canceled = isCanceled(event)
  const [editing, setEditing] = useState(false)
  const [tab, setTab] = useState(event.chatId ? "contact" : "history")

  const { form, submit, resolvedProfessional } = useBookingForm({
    event,
    draft: null,
    calendars,
    active: open && editing,
    onDone: () => setEditing(false),
  })
  const isDirty = form.formState.isDirty
  const dirtyFields = form.formState.dirtyFields
  const timeChanged = Boolean(dirtyFields.start || dirtyFields.end)
  const requestClose = useGuardedClose(isDirty, close)

  // Cancelado em outra tela, ou pelo tempo real, enquanto estava aberto: não há mais o que editar.
  useEffect(() => {
    if (canceled && editing) {
      form.reset()
      setEditing(false)
    }
  }, [canceled, editing, form])

  // O kit foca o primeiro controle, que aqui seria o menu "…" do topo. Quem abre para ler cai em
  // "Editar", a ação principal: Enter já edita, e Tab segue para o resto.
  // Com dedo, nada ganha foco sozinho: um anel no botão, ou o teclado subindo, só atrapalha.
  const isTouch = useIsTouch()
  const editButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open || editing || isTouch) return
    const timer = window.setTimeout(() => editButton.current?.focus({ preventScroll: true }), 60)
    return () => window.clearTimeout(timer)
  }, [open, editing, isTouch])

  // O botão "Editar" some ao trocar de modo: o foco vai para o primeiro campo, e não para o nada.
  useEffect(() => {
    if (!editing || isTouch) return
    const frame = requestAnimationFrame(() => form.setFocus("chatId"))
    return () => cancelAnimationFrame(frame)
  }, [editing, form, isTouch])

  async function runThenClose(action: () => Promise<unknown>) {
    const done = await action()
    if (done) close()
  }

  function stopEditing() {
    form.reset()
    setEditing(false)
  }

  const headline = eventHeadline(event)

  return (
    <ResponsiveDialog
      size="2xl"
      open={open}
      onOpenChange={(next) => {
        if (!next) void requestClose()
      }}
      title={
        <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
          <EventTitle color={event.color}>{headline.title || t("calendar.event.untitled")}</EventTitle>
          <BookingStatus event={event} />
        </span>
      }
      description={
        editing ? t("calendar.booking.edit.description") : (headline.detail ?? undefined)
      }
      headerActions={
        <ActionsMenu
          label={t("calendar.booking.menu")}
          actions={[
            {
              label: t("calendar.booking.cancel.action"),
              icon: <Ban />,
              hidden: canceled,
              onSelect: () => void runThenClose(() => actions.cancel(event)),
            },
            {
              label: t("calendar.booking.archive.action"),
              icon: <Trash2 />,
              destructive: true,
              onSelect: () => void runThenClose(() => actions.archive(event)),
            },
          ]}
        />
      }
      onSubmit={editing ? submit : (formEvent) => formEvent.preventDefault()}
      footer={
        editing ? (
          <FormActions
            form={form}
            submitLabel={t("calendar.booking.edit.submit")}
            cancelLabel={t(isDirty ? "calendar.booking.edit.discard" : "calendar.common.back")}
            onCancel={stopEditing}
            requireChanges
          />
        ) : (
          <>
            <Button type="button" variant="outline" className="pointer-coarse:h-10" onClick={close}>
              {t("calendar.common.close")}
            </Button>
            {canceled ? null : (
              <Button
                ref={editButton}
                type="button"
                className="pointer-coarse:h-10"
                onClick={() => setEditing(true)}
              >
                <PencilLine />
                {t("calendar.booking.edit.action")}
              </Button>
            )}
          </>
        )
      }
    >
      <UnsavedChangesDialog when={open && isDirty} />

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_17rem] md:gap-8">
        <div className="min-w-0">
          {editing ? (
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
            </div>
          ) : (
            <BookingSummary event={event} calendar={calendar} actions={actions} />
          )}
        </div>

        <aside
          aria-label={t("calendar.booking.context")}
          className="min-w-0 md:border-l md:pl-6"
        >
          <Tabs value={tab} onValueChange={(next) => setTab(String(next))}>
            <TabsList
              variant="line"
              className="w-full justify-start overflow-x-auto [scrollbar-width:none]"
            >
              <TabsTrigger value="contact">{t("calendar.booking.tabs.contact")}</TabsTrigger>
              {event.chatId ? (
                <TabsTrigger value="messages">{t("calendar.booking.tabs.messages")}</TabsTrigger>
              ) : null}
              <TabsTrigger value="history">{t("calendar.booking.tabs.history")}</TabsTrigger>
            </TabsList>
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
        </aside>
      </div>
    </ResponsiveDialog>
  )
}
