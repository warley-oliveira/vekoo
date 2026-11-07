import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  Ban,
  CalendarDays,
  GraduationCap,
  MessageCircle,
  PencilLine,
  Trash2,
  UserRound,
} from "lucide-react"
import { Link } from "react-router"

import {
  ActionsMenu,
  EmptyState,
  FormActions,
  ResponsiveDialog,
  SegmentedControl,
  StatusBadge,
  UnsavedChangesDialog,
  UserAvatar,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { BookingActions } from "@/hooks/calendar/use-booking-actions"
import { useCan } from "@/hooks/use-can"
import { useIsTouch } from "@/hooks/use-media-query"
import { useGuardedClose } from "@/hooks/use-panel-session"
import { apiAssetUrl } from "@/lib/api"
import { eventHeadline, hasCustomTitle, isCanceled, isPastEvent } from "@/lib/calendar/event-status"
import { formatInZone, safeTimeZone } from "@/lib/calendar/timezone"
import type { AgendaCalendar, BookingEvent, CalendarEvent, ClassSessionEvent } from "@/lib/calendar/types"
import { useLanguage } from "@/lib/i18n"
import { EventSituationBadge } from "../event-badges"
import { useBookingForm, type BookingDraft } from "./booking-form"
import { BookingFields } from "./booking-fields"
import { BookingSummary } from "./booking-summary"
import { BookingContactTab, BookingHistory, BookingMessagesTab } from "./booking-tabs"
import { useNewSessionForm } from "./new-session-form"
import { NewSessionFields } from "./session-form"

type NewKind = "booking" | "session"

/** O painel de cada aba: no celular, ao menos a altura útil da tela; na tela larga, rola sozinho. */
const PANEL =
  "min-h-[calc(var(--app-vh,100dvh)-14rem)] p-4 md:min-h-0 md:overflow-y-auto md:px-6 md:py-5"

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
  const [tab, setTab] = useState("contact")
  const language = useLanguage()
  const canChat = useCan("chat")
  const chatLink = event.chatId && canChat ? `/chat/${event.chatId}` : null

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
  // "Editar", a ação principal: Enter age, e Tab segue para o resto. No cancelado, vale o do kit.
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
  const customTitle = hasCustomTitle(event)
  // Com o título padrão, o título já é o contato: a foto vem junto e o subtítulo some, porque
  // serviço e colaborador estão logo abaixo. Com título próprio, o contato vai no subtítulo.
  const titleIsContact = Boolean(event.chatId && event.userName && !customTitle)

  return (
    <ResponsiveDialog
      size="2xl"
      // Altura fixa, e não a do conteúdo: cada aba tem um tamanho, e a caixa pulava ao trocar.
      // O teto é menor que o padrão do 2xl (60rem) para a aba curta não virar um vão; o que passa
      // dele rola dentro da própria coluna. No celular o modal já é a tela inteira.
      fixedHeight
      className="md:h-[min(90dvh,42rem)]"
      bodyClassName="p-0"
      open={open}
      onOpenChange={(next) => {
        if (!next) void requestClose()
      }}
      title={
        <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="flex min-w-0 items-center gap-2.5">
            {titleIsContact ? (
              <UserAvatar
                aria-hidden
                name={event.userName}
                src={event.profilePictureUrl ? apiAssetUrl(event.profilePictureUrl) : null}
                size="sm"
              />
            ) : null}
            <span className="min-w-0 truncate">{headline.title || t("calendar.event.untitled")}</span>
          </span>
          <BookingStatus event={event} />
        </span>
      }
      description={
        editing
          ? t("calendar.booking.edit.description")
          : customTitle && event.userName
            ? event.userName
            : undefined
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
        ) : canceled && !chatLink ? undefined : (
          <>
            {/* A conversa abre daqui, e só daqui: o mesmo lugar em qualquer aba. "Fechar" saiu,
                porque o X do topo, o Esc e o clique fora já fecham. */}
            {chatLink ? (
              <Button
                variant="outline"
                nativeButton={false}
                className="pointer-coarse:h-10 sm:mr-auto"
                render={<Link to={chatLink} />}
              >
                <MessageCircle />
                {t("calendar.booking.contact.openChat")}
              </Button>
            ) : null}
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

      {/* Na tela larga, duas colunas da mesma altura, cada uma rolando por dentro: à esquerda o
          agendamento, à direita a pessoa. No celular, uma coluna só, rolando inteira. */}
      <div className="flex flex-col md:grid md:h-full md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0 p-4 md:min-h-0 md:overflow-y-auto md:px-6 md:py-5">
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
            <div className="flex flex-col gap-6">
              <BookingSummary event={event} calendar={calendar} actions={actions} />
              {/* O histórico é do agendamento, não da pessoa: mora com ele, e ocupa a coluna que
                  antes sobrava enquanto a do lado transbordava. */}
              <section aria-labelledby="booking-history-title" className="flex flex-col gap-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <h3 id="booking-history-title" className="text-sm font-medium">
                    {t("calendar.booking.tabs.history")}
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    {t("calendar.history.createdOn", {
                      date: formatInZone(event.createdAt, zone, language, { dateStyle: "short" }),
                    })}
                  </span>
                </div>
                <BookingHistory event={event} timeZone={zone} />
              </section>
            </div>
          )}
        </div>

        <aside
          aria-label={t("calendar.booking.context")}
          className="flex min-w-0 flex-col border-t md:min-h-0 md:border-t-0 md:border-l"
        >
          {event.chatId ? (
            <Tabs
              value={tab}
              onValueChange={(next) => setTab(String(next))}
              className="gap-0 md:min-h-0 md:flex-1"
            >
              {/* No celular a barra de abas gruda no topo ao rolar, e o painel tem ao menos a
                  altura útil da tela: trocar de aba não puxa a página para cima. */}
              <div className="sticky top-0 z-10 border-b bg-background px-4 md:static md:px-6">
                <TabsList variant="line" className="h-11 gap-4 group-data-horizontal/tabs:h-11">
                  <TabsTrigger value="contact" className="flex-none px-0.5">
                    {t("calendar.booking.tabs.contact")}
                  </TabsTrigger>
                  <TabsTrigger value="messages" className="flex-none px-0.5">
                    {t("calendar.booking.tabs.messages")}
                  </TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="contact" data-booking-scroll className={PANEL}>
                <BookingContactTab event={event} />
              </TabsContent>
              <TabsContent value="messages" data-booking-scroll className={PANEL}>
                <BookingMessagesTab event={event} timeZone={zone} />
              </TabsContent>
            </Tabs>
          ) : (
            <div className="flex flex-1 flex-col justify-center p-4 md:px-6">
              <EmptyState
                icon={<UserRound aria-hidden className="size-5" />}
                title={t("calendar.booking.contact.none.title")}
                description={t(
                  canceled
                    ? "calendar.booking.contact.none.canceled"
                    : "calendar.booking.contact.none.description"
                )}
                action={
                  canceled
                    ? undefined
                    : { label: t("calendar.booking.contact.none.action"), onClick: () => setEditing(true) }
                }
              />
            </div>
          )}
        </aside>
      </div>
    </ResponsiveDialog>
  )
}
