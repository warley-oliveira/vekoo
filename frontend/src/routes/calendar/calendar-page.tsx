import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLocation } from "react-router"
import { useTranslation } from "react-i18next"
import { animate, AnimatePresence, motion, useReducedMotion } from "motion/react"
import { CalendarOff, Plus, RefreshCw } from "lucide-react"
import { toast } from "sonner"

import { AgendaList } from "@/components/calendar/agenda-list"
import { BookingPanel, NewEventPanel } from "@/components/calendar/booking/booking-panel"
import type { BookingDraft } from "@/components/calendar/booking/booking-form"
import type { GridRange } from "@/components/calendar/calendar-grid"
import { CalendarSidebar } from "@/components/calendar/calendar-sidebar"
import { NoCalendars } from "@/components/calendar/calendar-list"
import {
  AgendaSkeleton,
  CalendarGridSkeleton,
  CalendarPageSkeleton,
} from "@/components/calendar/calendar-skeletons"
import {
  CalendarFiltersButton,
  CalendarNavigator,
  SidebarToggle,
  SituationChips,
  TimeZoneNote,
  ViewSwitch,
} from "@/components/calendar/calendar-toolbar"
import { CreateCalendarPanel } from "@/components/calendar/create-calendar-panel"
import { EnrollSequenceDialog } from "@/components/calendar/enroll-sequence-dialog"
import { EventPreview } from "@/components/calendar/event-preview"
import { ClassSessionPanel } from "@/components/calendar/session/class-session-panel"
import { WeekStrip } from "@/components/calendar/week-strip"
import { EmptyState, ErrorState, ResponsiveDialog } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useAgendaChannel } from "@/hooks/calendar/use-agenda-channel"
import { useBookingActions } from "@/hooks/calendar/use-booking-actions"
import { useCalendarEvents } from "@/hooks/calendar/use-calendar-events"
import { useCalendarScreen } from "@/hooks/calendar/use-calendar-screen"
import { useCalendarFilters, useCalendars } from "@/hooks/calendar/use-calendars"
import { useDaySummary } from "@/hooks/calendar/use-day-summary"
import { useEventPreview } from "@/hooks/calendar/use-event-preview"
import { useFullBleed } from "@/hooks/use-app-shell"
import { useHeaderSlot } from "@/hooks/use-header-slot"
import { useIsTouch } from "@/hooks/use-media-query"
import { useMobileShell } from "@/hooks/use-mobile-shell"
import { useOpenCount, useRetained } from "@/hooks/use-panel-session"
import { viewTitle, type CalendarView } from "@/lib/calendar/calendar-view"
import { isVirtualId, resolveEventId } from "@/lib/calendar/event-cache"
import { countSituations, eventHeadline, matchesSituations } from "@/lib/calendar/event-status"
import {
  dayKeyOf,
  fieldDateOf,
  fieldDateOfGrid,
  gridDateOf,
  localDateOfDayKey,
  safeTimeZone,
} from "@/lib/calendar/timezone"
import type { CalendarEvent } from "@/lib/calendar/types"
import { useLanguage } from "@/lib/i18n"

const CalendarGrid = lazy(() => import("@/components/calendar/calendar-grid"))

const SWIPE_DISTANCE = 56
const SWIPE_MAX_MS = 600
const TAP_SLOP = 10
const PULSE_MS = 2200

/** Quem guardou o id de uma aula calculada continua achando ela depois de gravada. */
function findEvent(
  events: CalendarEvent[] | undefined,
  id: string | null,
  zones: Map<string, string>
): CalendarEvent | null {
  if (!events || !id) return null
  const resolved = resolveEventId(id)
  const direct = events.find((event) => event.id === resolved)
  if (direct || !isVirtualId(id)) return direct ?? null

  // Sem o tempo real: o id diz a turma, o dia e o horário.
  const [, groupId, day, time] = id.split("_")
  if (!groupId || !day || !time) return null
  const dayKey = `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`
  const clock = `${time.slice(0, 2)}:${time.slice(2, 4)}`
  return (
    events.find(
      (event) =>
        event.type === "class_session" &&
        event.classGroupId === groupId &&
        event.scheduleWindowStart === clock &&
        dayKeyOf(event.start, safeTimeZone(zones.get(event.calendarId))) === dayKey
    ) ?? null
  )
}

/** O ponto de partida de um agendamento novo: o próximo horário cheio de meia em meia hora. */
function nextSlotDraft(
  day: string,
  today: string,
  timeZone: string,
  calendarId: string | null
): BookingDraft {
  const start =
    day === today
      ? (() => {
          const now = fieldDateOf(Date.now(), timeZone)
          now.setMinutes(now.getMinutes() < 30 ? 30 : 60, 0, 0)
          return now
        })()
      : (() => {
          const morning = localDateOfDayKey(day)
          morning.setHours(9, 0, 0, 0)
          return morning
        })()
  return { calendarId, start, end: new Date(start.getTime() + 30 * 60_000) }
}

/**
 * O calendário: abrir, ver o dia, marcar e remarcar. A grade (mês, semana, dia) entra sob demanda,
 * porque o FullCalendar é pesado; a agenda em lista, que é como o celular abre, não precisa dele.
 */
export default function CalendarPage() {
  const { t } = useTranslation()
  const language = useLanguage()
  const isTouch = useIsTouch()
  const reducedMotion = useReducedMotion()
  const { isMobileShell } = useMobileShell()

  useFullBleed(true)

  const { calendars, error: calendarsError, isLoading: loadingCalendars, reload: reloadCalendars } =
    useCalendars()
  const { options: filterOptions } = useCalendarFilters()
  const screen = useCalendarScreen(calendars)
  const actions = useBookingActions(calendars)
  const location = useLocation()

  const [createCalendarOpen, setCreateCalendarOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  /* ---------- eventos ---------- */

  const serverFilters = useMemo(
    () => ({
      calendarIds: screen.selectedCalendarIds,
      professionalIds: screen.filters.professionalIds,
      serviceIds: screen.filters.serviceIds,
      tagIds: screen.filters.tagIds,
    }),
    [
      screen.filters.professionalIds,
      screen.filters.serviceIds,
      screen.filters.tagIds,
      screen.selectedCalendarIds,
    ]
  )
  const {
    events,
    error: eventsError,
    isLoading: loadingEvents,
    isValidating,
    reload: reloadEvents,
  } = useCalendarEvents(screen.range, serverFilters)

  const situationCounts = useMemo(() => countSituations(events ?? []), [events])
  const visibleEvents = useMemo(
    () => (events ?? []).filter((event) => matchesSituations(event, screen.filters.situations)),
    [events, screen.filters.situations]
  )

  const summary = useDaySummary({
    day: screen.anchor,
    calendarIds: screen.selectedCalendarIds,
    zones: screen.zones,
    selectedZones: screen.selectedZones,
    primaryZone: screen.primaryZone,
  })

  /* ---------- painel: o endereço diz o que está aberto ---------- */

  const openEventId = screen.params.get("event")
  const isNew = screen.params.get("new") === "1"
  // Vindo de "Agendar", na conversa. Só o que veio junto com esta entrada do histórico: criar outro,
  // daqui, não repete o contato.
  const bookingChat = (location.state as { bookingChat?: BookingDraft["chat"] } | null)?.bookingChat ?? null
  const [draft, setDraft] = useState<BookingDraft | null>(null)
  const { patchParams } = screen

  // Abrir empilha no histórico: no celular, o voltar do aparelho fecha o painel.
  const openEvent = useCallback(
    (event: CalendarEvent) => patchParams({ event: event.id, new: null }, { push: true }),
    [patchParams]
  )
  const closePanel = useCallback(() => patchParams({ event: null, new: null }), [patchParams])

  const startNew = useCallback(
    (nextDraft: BookingDraft) => {
      setDraft(nextDraft)
      patchParams({ new: "1", event: null }, { push: true })
    },
    [patchParams]
  )

  const defaultCalendarId = screen.selectedCalendars[0]?.id ?? calendars?.[0]?.id ?? null

  const newFromDay = useCallback(
    (dayKey: string) =>
      startNew(nextSlotDraft(dayKey, screen.today, screen.primaryZone, defaultCalendarId)),
    [defaultCalendarId, screen.primaryZone, screen.today, startNew]
  )

  const newFromRange = useCallback(
    (range: GridRange) => {
      if (!range.allDay) {
        startNew({
          calendarId: defaultCalendarId,
          start: fieldDateOfGrid(range.start),
          end: fieldDateOfGrid(range.end),
        })
        return
      }
      // Um dia no mês não diz o horário: abre às 9h. Vários dias valem do início ao fim.
      const first = fieldDateOfGrid(range.start)
      const last = new Date(fieldDateOfGrid(range.end).getTime() - 60_000)
      const oneDay = first.toDateString() === last.toDateString()
      if (oneDay) {
        first.setHours(9, 0, 0, 0)
        startNew({
          calendarId: defaultCalendarId,
          start: first,
          end: new Date(first.getTime() + 30 * 60_000),
        })
      } else {
        last.setHours(23, 50, 0, 0)
        startNew({ calendarId: defaultCalendarId, start: first, end: last })
      }
    },
    [defaultCalendarId, startNew]
  )

  const selected = useMemo(
    () => findEvent(events, openEventId, screen.zones),
    [events, openEventId, screen.zones]
  )
  const shownEvent = useRetained(selected)
  // A aula continua aberta durante a troca de id, e o agendamento, durante a animação de saída.
  const panelEvent =
    selected ?? (openEventId && shownEvent && isVirtualId(openEventId) ? shownEvent : null)
  const eventOpen = Boolean(openEventId && panelEvent)
  const eventPanelKey = useOpenCount(eventOpen)
  const newPanelKey = useOpenCount(isNew)

  // Link para um evento que não está neste período: avisa, em vez de não fazer nada.
  const missing = Boolean(openEventId && events && !loadingEvents && !isValidating && !panelEvent)
  useEffect(() => {
    if (!missing) return
    toast.error(t("calendar.event.notFound"))
    closePanel()
  }, [closePanel, missing, t])

  /* ---------- tempo real ---------- */

  const [pulseId, setPulseId] = useState<string | null>(null)
  const pulseTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(pulseTimer.current), [])
  const pulse = useCallback((id: string) => {
    setPulseId(id)
    clearTimeout(pulseTimer.current)
    pulseTimer.current = setTimeout(() => setPulseId(null), PULSE_MS)
  }, [])

  const [focusTime, setFocusTime] = useState<{ time: string } | null>(null)

  useAgendaChannel({
    onRemoteCreate: (event) => {
      if (!screen.selectedCalendarIds.includes(event.calendarId)) return
      toast(
        t("calendar.realtime.newEvent", {
          title: eventHeadline(event).title || t("calendar.event.untitled"),
        }),
        { action: { label: t("calendar.realtime.open"), onClick: () => openEvent(event) } }
      )
      pulse(event.id)
    },
  })

  /* ---------- prévia ao passar o mouse ---------- */

  const { preview, hover, close: closePreview, popupHandlers } = useEventPreview()
  const previewEvent = preview
    ? (events?.find((event) => event.id === preview.id) ?? null)
    : null
  const previewSequence =
    previewEvent?.type === "booking" && previewEvent.enrolledSequenceId
      ? calendars
          ?.find((calendar) => calendar.id === previewEvent.calendarId)
          ?.attendanceSequences.find((item) => item.id === previewEvent.enrolledSequenceId)?.name
      : undefined

  /* ---------- trocar de dia por gesto, sem brigar com a rolagem nem com o arraste ---------- */

  const swipeArea = useRef<HTMLDivElement>(null)
  const swipeStart = useRef<{ x: number; y: number; at: number } | null>(null)
  // A grade entende um gesto dentro da mesma coluna como toque: sem isto, trocar de dia abriria
  // um agendamento novo junto. O toque chega à grade depois daqui.
  const ignoreTapUntil = useRef(0)
  const isDragging = useRef(false)

  const nudge = useCallback(
    (direction: 1 | -1) => {
      const element = swipeArea.current
      if (!element || reducedMotion) return
      void animate(
        element,
        { x: [direction * 24, 0], opacity: [0.5, 1] },
        { type: "spring", duration: 0.25, bounce: 0 }
      )
    },
    [reducedMotion]
  )

  const step = useCallback(
    (direction: 1 | -1) => {
      screen.step(direction)
      nudge(direction)
    },
    [nudge, screen]
  )

  function onTouchStart(touchEvent: React.TouchEvent) {
    if (touchEvent.touches.length !== 1) {
      swipeStart.current = null
      return
    }
    const touch = touchEvent.touches[0]
    swipeStart.current = { x: touch.clientX, y: touch.clientY, at: Date.now() }
  }

  function onTouchEnd(touchEvent: React.TouchEvent) {
    const start = swipeStart.current
    swipeStart.current = null
    if (!start || isDragging.current) return
    const touch = touchEvent.changedTouches[0]
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (Math.abs(dx) > TAP_SLOP || Math.abs(dy) > TAP_SLOP) {
      ignoreTapUntil.current = Date.now() + 400
    }
    if (
      Math.abs(dx) >= SWIPE_DISTANCE &&
      Math.abs(dx) > Math.abs(dy) * 1.5 &&
      Date.now() - start.at <= SWIPE_MAX_MS &&
      screen.view !== "month"
    ) {
      step(dx < 0 ? 1 : -1)
    }
  }

  /* ---------- barra superior ---------- */

  const noCalendars = calendars?.length === 0

  useHeaderSlot(
    noCalendars ? null : (
      <Button
        className="pointer-coarse:h-10"
        onClick={() => newFromDay(screen.anchor)}
        disabled={!calendars}
      >
        <Plus />
        {t("calendar.page.create")}
      </Button>
    ),
    // No celular, o botão flutuante faz esse papel, sempre à mão, e o cabeçalho fica com as
    // visões em ícones: cada linha a menos é mais agenda na tela.
    screen.isPhone && !noCalendars
      ? {
          mobilePlacement: "inline",
          mobileNode: <ViewSwitch value={screen.view} onChange={screen.setView} isPhone compact />,
        }
      : { mobilePlacement: "hidden" }
  )

  /* ---------- estados da tela inteira ---------- */

  if (loadingCalendars && !calendars) {
    return <CalendarPageSkeleton view={screen.view} isPhone={screen.isPhone} />
  }

  if (calendarsError && !calendars) {
    return (
      <div className="h-full overflow-y-auto p-4 pb-(--app-bottom-nav-total)">
        <ErrorState error={calendarsError} onRetry={() => void reloadCalendars()} />
      </div>
    )
  }

  const calendarListProps = {
    calendars,
    isLoading: loadingCalendars,
    error: calendarsError,
    onRetry: () => void reloadCalendars(),
    selectedIds: screen.selectedCalendarIds,
    onChange: screen.setSelectedCalendarIds,
    onCreate: () => {
      setSidebarOpen(false)
      setCreateCalendarOpen(true)
    },
  }

  const createCalendarPanel = (
    <CreateCalendarPanel
      open={createCalendarOpen}
      onOpenChange={setCreateCalendarOpen}
      onCreated={(created) => {
        if (screen.selectedCalendarIds.length > 0 || calendars?.length) {
          screen.setSelectedCalendarIds([...screen.selectedCalendarIds, created.id])
        }
      }}
    />
  )

  if (noCalendars) {
    return (
      <div className="h-full overflow-y-auto pb-(--app-bottom-nav-total)">
        <NoCalendars onCreate={() => setCreateCalendarOpen(true)} />
        {createCalendarPanel}
      </div>
    )
  }

  const nothingSelected = screen.selectedCalendarIds.length === 0
  const hasActiveFilters = screen.activeFilterCount > 0
  const firstLoad = loadingEvents && !events && !nothingSelected
  const stepLabels = stepLabelsOf(screen.view, t)

  const body = nothingSelected ? (
    <div className="h-full overflow-y-auto">
      <EmptyState
        className="m-4"
        icon={<CalendarOff className="size-5" />}
        title={t("calendar.empty.noneSelected.title")}
        description={t("calendar.empty.noneSelected.description")}
        action={{
          label: t("calendar.empty.noneSelected.action"),
          onClick: () =>
            screen.setSelectedCalendarIds((calendars ?? []).map((calendar) => calendar.id)),
        }}
      />
    </div>
  ) : eventsError && !events ? (
    <div className="h-full overflow-y-auto p-4">
      <ErrorState error={eventsError} onRetry={() => void reloadEvents()} />
    </div>
  ) : screen.view === "agenda" ? (
    <div className="h-full overflow-y-auto overscroll-contain">
      {firstLoad ? (
        <AgendaSkeleton />
      ) : (
        <AgendaList
          days={screen.days}
          today={screen.today}
          events={visibleEvents}
          zones={screen.zones}
          primaryZone={screen.primaryZone}
          isFiltered={hasActiveFilters}
          onClearFilters={screen.clearFilters}
          onOpen={openEvent}
          onAttendance={(event, status) => void actions.toggleAttendance(event, status)}
          onCreate={newFromDay}
        />
      )}
    </div>
  ) : (
    <Suspense fallback={<CalendarGridSkeleton view={screen.view} />}>
      <CalendarGrid
        view={screen.view}
        anchor={screen.anchor}
        events={visibleEvents}
        dataReady={!loadingEvents}
        zones={screen.zones}
        nowZone={screen.primaryZone}
        pulseId={pulseId}
        focusTime={focusTime}
        isTouch={isTouch}
        isPhone={screen.isPhone}
        onSelectRange={(range) => {
          if (Date.now() >= ignoreTapUntil.current) newFromRange(range)
        }}
        onOpenEvent={(event) => {
          if (Date.now() >= ignoreTapUntil.current) openEvent(event)
        }}
        onMoveEvent={(event, start, end, revert) => void actions.move(event, start, end, revert)}
        onHoverEvent={screen.isPhone ? undefined : hover}
        onOpenDay={screen.openDay}
        onDragChange={(dragging) => {
          isDragging.current = dragging
          if (dragging) ignoreTapUntil.current = Date.now() + 600
        }}
      />
    </Suspense>
  )

  const title = viewTitle(screen.view, screen.anchor, language, {
    today: screen.today,
    isPhone: screen.isPhone,
  })
  const filtersButton = (
    <CalendarFiltersButton
      options={filterOptions}
      filters={screen.filters}
      selectedCalendarIds={screen.selectedCalendarIds}
      activeCount={screen.activeFilterCount}
      onChange={screen.setFilter}
      onClear={screen.clearFilters}
      situationCounts={situationCounts}
      showSituation={screen.isPhone}
      iconOnly={screen.isPhone}
    />
  )

  return (
    <div className="flex h-full min-h-0 pb-(--app-bottom-nav-total)">
      {/* Do `lg` para cima, a lateral é fixa. Abaixo, ela abre em painel. */}
      <aside className="hidden w-64 shrink-0 overflow-y-auto border-r p-4 lg:block">
        <CalendarSidebar
          day={screen.anchor}
          today={screen.today}
          timeZone={screen.primaryZone}
          zones={screen.zones}
          summary={summary}
          onSelectDay={screen.goToDay}
          calendarList={calendarListProps}
        />
      </aside>

      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-3 py-2 md:px-4">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <div className="lg:hidden">
              <SidebarToggle
                onClick={() => setSidebarOpen(true)}
                activeCount={nothingSelected ? 1 : 0}
              />
            </div>
            <CalendarNavigator
              title={title}
              onToday={screen.goToToday}
              onPrevious={() => step(-1)}
              onNext={() => step(1)}
              stepLabel={stepLabels}
            />
          </div>
          {screen.isPhone ? (
            filtersButton
          ) : (
            <div className="flex items-center gap-2">
              {filtersButton}
              <ViewSwitch value={screen.view} onChange={screen.setView} isPhone={false} />
            </div>
          )}
          {screen.isPhone ? <TimeZoneNote zones={screen.selectedZones} className="w-full" /> : null}
        </div>

        {screen.isPhone && screen.view !== "month" ? (
          <div className="border-b pt-1.5">
            <WeekStrip
              value={screen.anchor}
              today={screen.today}
              timeZone={screen.primaryZone}
              onSelect={screen.goToDay}
            />
          </div>
        ) : null}

        {screen.isPhone || nothingSelected || (eventsError && !events) ? null : (
          <div className="flex items-center gap-2 border-b px-3 py-1.5 md:px-4">
            <SituationChips
              counts={situationCounts}
              total={events?.length ?? 0}
              value={screen.filters.situations}
              onChange={(values) => screen.setFilter("situations", values)}
              className="min-w-0 flex-1"
            />
            <TimeZoneNote zones={screen.selectedZones} className="max-w-[45%] shrink-0" />
          </div>
        )}

        {hasActiveFilters && events && visibleEvents.length === 0 && screen.view !== "agenda" ? (
          <div className="flex items-center justify-between gap-3 border-b bg-muted/50 px-4 py-1.5 text-sm">
            <span className="text-muted-foreground">{t("calendar.empty.filtered.title")}</span>
            <Button
              variant="ghost"
              size="sm"
              className="pointer-coarse:h-10"
              onClick={screen.clearFilters}
            >
              {t("calendar.empty.filtered.action")}
            </Button>
          </div>
        ) : null}

        {eventsError && events ? (
          <div
            role="status"
            className="flex items-center justify-between gap-3 border-b bg-status-warning-soft px-4 py-1.5 text-sm text-status-warning"
          >
            <span>{t("calendar.page.staleData")}</span>
            <Button
              variant="ghost"
              size="sm"
              className="pointer-coarse:h-10"
              onClick={() => void reloadEvents()}
            >
              <RefreshCw />
              {t("calendar.common.retry")}
            </Button>
          </div>
        ) : null}

        <div
          ref={swipeArea}
          className="relative min-h-0 flex-1"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <AnimatePresence>
            {isValidating && events && !nothingSelected ? (
              <motion.div
                key="progress"
                aria-hidden
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15, delay: 0.15 }}
                className="pointer-events-none absolute inset-x-0 top-0 z-30 h-0.5 animate-pulse bg-primary/60"
              />
            ) : null}
          </AnimatePresence>
          {body}
        </div>

        {isMobileShell ? (
          <motion.div
            className="fixed right-4 z-20"
            style={{ bottom: "calc(var(--app-bottom-nav-total, 0px) + 1rem)" }}
            whileTap={reducedMotion ? undefined : { scale: 0.94 }}
          >
            <Button
              aria-label={t("calendar.page.create")}
              className="size-14 rounded-full shadow-lg [&_svg:not([class*='size-'])]:size-6"
              onClick={() => newFromDay(screen.anchor)}
            >
              <Plus />
            </Button>
          </motion.div>
        ) : null}
      </div>

      {/* Painéis */}
      <ResponsiveDialog
        open={sidebarOpen}
        onOpenChange={setSidebarOpen}
        title={t("calendar.sidebar.title")}
      >
        <CalendarSidebar
          day={screen.anchor}
          today={screen.today}
          timeZone={screen.primaryZone}
          zones={screen.zones}
          summary={summary}
          onSelectDay={(dayKey) => {
            screen.goToDay(dayKey)
            setSidebarOpen(false)
          }}
          calendarList={calendarListProps}
        />
      </ResponsiveDialog>

      {newPanelKey > 0 && calendars ? (
        <NewEventPanel
          key={`new-${newPanelKey}`}
          open={isNew}
          onOpenChange={(next) => {
            if (!next) closePanel()
          }}
          draft={{
            ...(draft ?? nextSlotDraft(screen.anchor, screen.today, screen.primaryZone, defaultCalendarId)),
            chat: bookingChat,
          }}
          calendars={calendars}
          onCreated={(event) => {
            // A tela vai até o que acabou de ser marcado: a confirmação é ver o evento ali.
            const zone = safeTimeZone(screen.zones.get(event.calendarId), screen.primaryZone)
            const day = dayKeyOf(event.start, zone)
            if (day < screen.days.start || day >= screen.days.end) screen.goToDay(day)
            // Uma hora antes, para ver o que vem antes dele. Às 00:00, fica no começo do dia.
            const hour = Math.max(gridDateOf(event.start, zone).getUTCHours() - 1, 0)
            setFocusTime({ time: `${String(hour).padStart(2, "0")}:00:00` })
            pulse(event.id)
          }}
        />
      ) : null}

      {shownEvent && calendars && eventPanelKey > 0 ? (
        shownEvent.type === "booking" ? (
          <BookingPanel
            key={`event-${eventPanelKey}`}
            open={eventOpen}
            onOpenChange={(next) => {
              if (!next) closePanel()
            }}
            event={panelEvent?.type === "booking" ? panelEvent : shownEvent}
            calendars={calendars}
            actions={actions}
          />
        ) : (
          <ClassSessionPanel
            key={`event-${eventPanelKey}`}
            open={eventOpen}
            onOpenChange={(next) => {
              if (!next) closePanel()
            }}
            session={panelEvent?.type === "class_session" ? panelEvent : shownEvent}
            calendar={calendars.find((item) => item.id === shownEvent.calendarId) ?? null}
            actions={actions}
          />
        )
      ) : null}

      <EnrollSequenceDialog actions={actions} />

      <EventPreview
        event={previewEvent}
        anchor={preview?.element ?? null}
        timeZone={safeTimeZone(
          screen.zones.get(previewEvent?.calendarId ?? ""),
          screen.primaryZone
        )}
        actions={actions}
        sequenceName={previewSequence}
        popupHandlers={popupHandlers}
        onClose={closePreview}
        onOpenFull={(event) => {
          closePreview()
          openEvent(event)
        }}
      />

      {createCalendarPanel}
    </div>
  )
}

function stepLabelsOf(view: CalendarView, t: (key: string) => string) {
  return {
    previous: t(`calendar.toolbar.previous.${view}`),
    next: t(`calendar.toolbar.next.${view}`),
  }
}
