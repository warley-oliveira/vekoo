import { useCallback, useEffect, useMemo, useRef } from "react"
import { useTranslation } from "react-i18next"
import { Check, CircleAlert, Users, X } from "lucide-react"
import FullCalendar from "@fullcalendar/react"
import type {
  CalendarOptions,
  CalendarRef,
  DateClickInfo,
  DateSelectInfo,
  EventClickInfo,
  EventDisplayInfo,
  EventDropInfo,
  EventHoveringInfo,
  EventInput,
  EventResizeDoneInfo,
} from "@fullcalendar/react"
import dayGridPlugin from "@fullcalendar/react/daygrid"
import interactionPlugin from "@fullcalendar/react/interaction"
import ptBrLocale from "@fullcalendar/react/locales/pt-br"
import timeGridPlugin from "@fullcalendar/react/timegrid"
import breezyPlugin from "@fullcalendar/react/themes/breezy"
import "@fullcalendar/react/skeleton.css"
import "@fullcalendar/react/themes/breezy/theme.css"
import "./calendar-theme.css"

import { FULLCALENDAR_VIEW, visibleDays, type CalendarView } from "@/lib/calendar/calendar-view"
import {
  eventHeadline,
  isAllDayEvent,
  isCanceled,
  isPastEvent,
  needsAttendance,
  occupancyTone,
} from "@/lib/calendar/event-status"
import {
  dayKeyOf,
  dayKeyOfGrid,
  gridDateOf,
  gridDateOfDayKey,
  instantFromGrid,
  safeTimeZone,
} from "@/lib/calendar/timezone"
import type { CalendarEvent } from "@/lib/calendar/types"
import { useLanguage } from "@/lib/i18n"

const PLUGINS = [breezyPlugin, dayGridPlugin, timeGridPlugin, interactionPlugin]
const LOCALES = [ptBrLocale]
const DAY_MS = 86_400_000
const MORNING = "08:00:00"
const AFTER_MOVE_MS = 700

export type GridRange = {
  /** Datas de grade: os campos em UTC são a hora de parede. */
  start: Date
  end: Date
  allDay: boolean
}

export type CalendarGridProps = {
  view: Exclude<CalendarView, "agenda">
  /** O dia aberto, "AAAA-MM-DD". */
  anchor: string
  events: CalendarEvent[]
  /** Os eventos deste período já chegaram: é quando dá para decidir onde abrir a rolagem. */
  dataReady: boolean
  /** O fuso de cada calendário. Cada evento cai na hora de parede do seu. */
  zones: Map<string, string>
  /** O fuso de "agora": a linha da hora e o destaque de hoje. */
  nowZone: string
  /** Pisca uma vez o evento que acabou de chegar. */
  pulseId?: string | null
  /** Rola até esta hora ("HH:MM:SS"). Um objeto novo a cada pedido. */
  focusTime?: { time: string } | null
  isTouch: boolean
  isPhone: boolean
  onSelectRange: (range: GridRange) => void
  onOpenEvent: (event: CalendarEvent) => void
  onMoveEvent: (event: CalendarEvent, start: number, end: number, revert: () => void) => void
  onHoverEvent?: (event: CalendarEvent | null, element: HTMLElement | null) => void
  onOpenDay: (dayKey: string) => void
  /** Um bloco começou ou parou de ser arrastado: nessa hora, o gesto de trocar de dia não vale. */
  onDragChange?: (dragging: boolean) => void
}

function sourceOf(info: { event: { extendedProps: Record<string, unknown> } }): CalendarEvent {
  return info.event.extendedProps.source as CalendarEvent
}

/** O bloco do evento. A cor é a do evento; o que muda por situação vem em ícone e texto. */
function EventChip({
  info,
  short,
  bare,
}: {
  info: EventDisplayInfo
  short: boolean
  /** Mês no celular: não cabe texto, só a cor de que há algo naquele dia. */
  bare: boolean
}) {
  const { t } = useTranslation()
  const source = sourceOf(info)
  const { title, detail } = eventHeadline(source)

  if (bare) {
    return (
      <span className="vk-event-bar">
        <span className="sr-only">{title}</span>
      </span>
    )
  }

  let mark = null
  if (source.type === "booking") {
    if (source.attendanceStatus === "show") {
      mark = (
        <span className="vk-event-mark">
          <Check aria-hidden />
          <span className="sr-only">{t("calendar.situation.show")}</span>
        </span>
      )
    } else if (source.attendanceStatus === "no_show") {
      mark = (
        <span className="vk-event-mark">
          <X aria-hidden />
          <span className="sr-only">{t("calendar.situation.no_show")}</span>
        </span>
      )
    } else if (needsAttendance(source)) {
      mark = (
        <span className="vk-event-mark opacity-70">
          <CircleAlert aria-hidden />
          <span className="sr-only">{t("calendar.event.needsAttendance")}</span>
        </span>
      )
    }
  }

  let fill = null
  if (source.type === "class_session") {
    const tone = occupancyTone(source.enrollmentCount, source.maxStudents)
    if (tone && source.maxStudents) {
      mark = (
        <span
          className="vk-event-mark vk-event-badge"
          data-tone={tone}
          aria-label={t("calendar.session.occupancyLabel", {
            count: source.enrollmentCount,
            max: source.maxStudents,
          })}
        >
          {source.enrollmentCount}/{source.maxStudents}
        </span>
      )
      fill = (
        <span className="vk-event-fill" data-tone={tone}>
          <span
            style={{ width: `${Math.min(source.enrollmentCount / source.maxStudents, 1) * 100}%` }}
          />
        </span>
      )
    } else {
      mark = (
        <span className="vk-event-mark">
          <Users aria-hidden />
        </span>
      )
    }
  }

  const canceledLabel = isCanceled(source) ? (
    <span className="sr-only">{t("calendar.situation.canceled")}</span>
  ) : null

  if (short) {
    // Numa linha só, vale o nome: do horário fica só o começo.
    const startText = info.timeText.split(/\s[–-]\s/)[0]
    return (
      <div className="vk-event">
        <div className="vk-event-row">
          {startText ? <span className="vk-event-time vk-event-time--whole">{startText}</span> : null}
          <span className="vk-event-title">{title}</span>
          {canceledLabel}
          {mark}
        </div>
      </div>
    )
  }

  const summary =
    source.type === "class_session" &&
    source.attendanceSummary &&
    !isCanceled(source) &&
    isPastEvent(source) &&
    (source.attendanceSummary.show > 0 || source.attendanceSummary.noShow > 0)
      ? source.attendanceSummary
      : null

  return (
    <div className="vk-event">
      <div className="vk-event-row">
        <span className="vk-event-time">{info.timeText}</span>
        {source.type === "booking" ? mark : null}
      </div>
      <span className="vk-event-title">{title}</span>
      {canceledLabel}
      {detail ? <span className="vk-event-detail">{detail}</span> : null}
      {summary ? (
        <span className="vk-event-detail">
          {t("calendar.session.summaryShort", { show: summary.show, noShow: summary.noShow })}
        </span>
      ) : null}
      {source.type === "class_session" ? <span className="vk-event-corner">{mark}</span> : null}
      {fill}
    </div>
  )
}

/**
 * A grade de mês, semana e dia. Fica num módulo só seu porque o FullCalendar é pesado: a página
 * carrega este arquivo sob demanda, e a agenda em lista nem precisa dele.
 *
 * Roda em `timeZone="UTC"` com datas de grade: cada evento cai na hora de parede do próprio
 * calendário, e nada aqui depende do fuso do navegador.
 */
export default function CalendarGrid({
  view,
  anchor,
  events,
  dataReady,
  zones,
  nowZone,
  pulseId,
  focusTime,
  isTouch,
  isPhone,
  onSelectRange,
  onOpenEvent,
  onMoveEvent,
  onHoverEvent,
  onOpenDay,
  onDragChange,
}: CalendarGridProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const calendarRef = useRef<CalendarRef>(null)
  const isMoving = useRef(false)

  const zoneFor = useCallback(
    (calendarId: string) => safeTimeZone(zones.get(calendarId), nowZone),
    [nowZone, zones]
  )

  const inputs = useMemo<EventInput[]>(
    () =>
      events.map((event) => {
        const zone = zoneFor(event.calendarId)
        const allDay = event.type === "booking" && isAllDayEvent(event.start, event.end, zone)
        const start = gridDateOf(event.start, zone)
        return {
          id: event.id,
          title: eventHeadline(event).title,
          start,
          end: allDay
            ? new Date(gridDateOfDayKey(dayKeyOfGrid(start)).getTime() + DAY_MS)
            : gridDateOf(Math.max(event.end, event.start), zone),
          allDay,
          color: event.color ?? undefined,
          // Cancelado fica onde está: remarcar é coisa de quem ainda vai acontecer.
          editable: !isCanceled(event),
          extendedProps: { source: event },
        }
      }),
    [events, zoneFor]
  )

  // A faixa de dia inteiro só ocupa espaço quando há o que mostrar nela.
  const hasAllDay = useMemo(() => inputs.some((input) => input.allDay), [inputs])

  // Abre onde importa: perto de agora, se hoje está na tela; senão, no primeiro compromisso
  // do período, ou no começo do expediente, se não houver nenhum.
  const scrollTarget = useCallback(() => {
    const today = dayKeyOf(Date.now(), nowZone)
    const { start, end } = visibleDays(view, anchor)
    const hourText = (hour: number) => `${String(Math.max(hour, 0)).padStart(2, "0")}:00:00`
    if (today >= start && today < end) {
      return hourText(gridDateOf(Date.now(), nowZone).getUTCHours() - 1)
    }
    const hours = events.flatMap((event) => {
      const zone = zoneFor(event.calendarId)
      const day = dayKeyOf(event.start, zone)
      return day >= start && day < end && !isAllDayEvent(event.start, event.end, zone)
        ? [gridDateOf(event.start, zone).getUTCHours()]
        : []
    })
    return hours.length ? hourText(Math.min(...hours) - 1) : MORNING
  }, [anchor, events, nowZone, view, zoneFor])

  // Uma vez por período, assim que os eventos dele chegam: depois, a rolagem é de quem está usando.
  const scrolledFor = useRef<string | null>(null)
  useEffect(() => {
    const key = `${view}|${anchor}`
    if (!dataReady || scrolledFor.current === key || view === "month") return
    scrolledFor.current = key
    const api = calendarRef.current?.getApi()
    if (api) queueMicrotask(() => api.scrollToTime(scrollTarget()))
  }, [anchor, dataReady, scrollTarget, view])

  const fullCalendarView = FULLCALENDAR_VIEW[view]
  const initial = useRef({ view: fullCalendarView, anchor })

  // A tela é a dona do dia e da visão: a grade só acompanha.
  useEffect(() => {
    const api = calendarRef.current?.getApi()
    if (!api) return
    // Fora do ciclo do React: o FullCalendar se redesenha de forma síncrona ao trocar de visão.
    queueMicrotask(() => {
      const date = gridDateOfDayKey(anchor)
      if (api.view.type !== fullCalendarView) api.changeView(fullCalendarView, date)
      else if (dayKeyOfGrid(api.getDate()) !== anchor) api.gotoDate(date)
    })
  }, [anchor, fullCalendarView])

  // Acabou de marcar: a grade vai até o horário, mesmo que ele esteja fora da parte visível.
  useEffect(() => {
    if (!focusTime) return
    const api = calendarRef.current?.getApi()
    if (!api || fullCalendarView === "dayGridMonth") return
    queueMicrotask(() => api.scrollToTime(focusTime.time))
  }, [focusTime, fullCalendarView])

  const now = useCallback(() => gridDateOf(Date.now(), nowZone), [nowZone])

  const eventClass = useCallback(
    (info: EventDisplayInfo) => {
      const source = sourceOf(info)
      const classes: string[] = []
      if (isCanceled(source)) classes.push("vk-fc-canceled")
      else if (source.type === "booking" && source.attendanceStatus === "no_show") {
        classes.push("vk-fc-no-show")
      }
      if (isPastEvent(source)) classes.push("vk-fc-past")
      if (pulseId && source.id === pulseId) classes.push("vk-fc-pulse")
      return classes.join(" ")
    },
    [pulseId]
  )

  const bareMonth = isPhone && view === "month"
  const isPhoneDay = isPhone && view === "day"

  const eventContent = useCallback(
    (info: EventDisplayInfo) => {
      const isTimeGrid = info.view.type.startsWith("timeGrid")
      return (
        <EventChip
          info={info}
          bare={bareMonth}
          short={!isTimeGrid || info.isShort || info.event.allDay}
        />
      )
    },
    [bareMonth]
  )

  // As opções só mudam quando a grade muda de verdade. A página se redesenha a cada passada de
  // mouse (a prévia mora nela), e opção nova a cada vez faria o FullCalendar refazer tudo, até no
  // meio de um arraste. Quem muda sempre, os retornos, é lido daqui na hora de usar.
  const latest = useRef({ onSelectRange, onOpenEvent, onMoveEvent, onHoverEvent, onOpenDay, onDragChange, zoneFor })
  useEffect(() => {
    latest.current = { onSelectRange, onOpenEvent, onMoveEvent, onHoverEvent, onOpenDay, onDragChange, zoneFor }
  })

  const options = useMemo<CalendarOptions>(() => {
    const startMoving = () => {
      isMoving.current = true
      latest.current.onDragChange?.(true)
      latest.current.onHoverEvent?.(null, null)
    }
    const stopMoving = () => {
      latest.current.onDragChange?.(false)
      // O ponteiro termina em cima do bloco: a prévia não pode abrir como se fosse um pedido.
      setTimeout(() => {
        isMoving.current = false
      }, AFTER_MOVE_MS)
    }
    const handleMove = (info: EventDropInfo | EventResizeDoneInfo) => {
      const source = sourceOf(info)
      const zone = latest.current.zoneFor(source.calendarId)
      const { start: gridStart, end: gridEnd } = info.event
      if (!gridStart) return

      const start = instantFromGrid(gridStart, zone)
      // Só o arraste mantém a duração em tempo real: atravessar a virada do horário de verão não
      // pode encurtar nem esticar o atendimento.
      const moved = "delta" in info
      const end =
        moved || !gridEnd ? start + (source.end - source.start) : instantFromGrid(gridEnd, zone)

      latest.current.onMoveEvent(source, start, end, info.revert)
    }

    return {
      plugins: PLUGINS,
      locales: LOCALES,
      locale: language === "en" ? "en" : "pt-br",
      timeZone: "UTC",
      now,
      initialView: initial.current.view,
      initialDate: gridDateOfDayKey(initial.current.anchor),
      headerToolbar: false,
      height: "100%",
      nowIndicator: true,
      editable: !bareMonth,
      eventResizableFromStart: !isTouch,
      eventDurationEditable: !isTouch,
      // No toque, a seleção por arraste brigaria com a rolagem: tocar num horário basta.
      selectable: !isTouch,
      selectMirror: true,
      unselectAuto: true,
      longPressDelay: 350,
      eventLongPressDelay: 350,
      eventInteractive: true,
      navLinks: true,
      navLinkDayClick: (date: Date) => latest.current.onOpenDay(dayKeyOfGrid(date)),
      scrollTime: MORNING,
      scrollTimeReset: false,
      slotDuration: "00:30:00",
      slotHeaderFormat: { hour: "2-digit", minute: "2-digit" },
      eventTimeFormat: { hour: "2-digit", minute: "2-digit" },
      expandRows: true,
      allDaySlot: hasAllDay,
      allDayText: t("calendar.grid.allDay"),
      noEventsText: t("calendar.grid.noEvents"),
      // O dia já está no título e na faixa da semana, no celular.
      dayHeaders: !isPhoneDay,
      eventDisplay: "block",
      eventShortHeight: 40,
      dayMaxEventRows: isPhone ? 4 : 3,
      moreLinkClick: isPhone ? "day" : "popover",
      moreLinkText: (count: number) => t("calendar.grid.more", { count }),
      rerenderDelay: 10,
      eventClass,
      eventContent,
      select: (info: DateSelectInfo) => {
        calendarRef.current?.getApi().unselect()
        latest.current.onSelectRange({ start: info.start, end: info.end, allDay: info.allDay })
      },
      // Com mouse, `select` já cobre o clique. No toque, ele não está ligado.
      dateClick: isTouch
        ? (info: DateClickInfo) => {
            // O mês do celular é mapa: tocar leva ao dia, onde dá para ver e marcar.
            if (bareMonth) {
              latest.current.onOpenDay(dayKeyOfGrid(info.date))
              return
            }
            const start = info.date
            latest.current.onSelectRange({
              start,
              end: new Date(start.getTime() + (info.allDay ? DAY_MS : 30 * 60_000)),
              allDay: info.allDay,
            })
          }
        : undefined,
      eventClick: (info: EventClickInfo) => {
        info.jsEvent.preventDefault()
        latest.current.onHoverEvent?.(null, null)
        const source = sourceOf(info)
        if (bareMonth) {
          latest.current.onOpenDay(
            dayKeyOfGrid(gridDateOf(source.start, latest.current.zoneFor(source.calendarId)))
          )
          return
        }
        latest.current.onOpenEvent(source)
      },
      eventDragStart: startMoving,
      eventDragStop: stopMoving,
      eventResizeStart: startMoving,
      eventResizeStop: stopMoving,
      eventDrop: handleMove,
      eventResize: handleMove,
      eventMouseEnter: isTouch
        ? undefined
        : (info: EventHoveringInfo) => {
            if (!isMoving.current) latest.current.onHoverEvent?.(sourceOf(info), info.el)
          },
      eventMouseLeave: isTouch ? undefined : () => latest.current.onHoverEvent?.(null, null),
    }
  }, [bareMonth, eventClass, eventContent, hasAllDay, isPhone, isPhoneDay, isTouch, language, now, t])

  return (
    <div className="vk-calendar">
      <FullCalendar ref={calendarRef} {...options} events={inputs} />
    </div>
  )
}
