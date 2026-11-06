import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { AnimatePresence, motion } from "motion/react"
import { CalendarPlus } from "lucide-react"

import { EmptyState } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { relativeDayLabel } from "@/lib/calendar/calendar-view"
import { eventHeadline, isCanceled, isPastEvent } from "@/lib/calendar/event-status"
import {
  dayKeyOf,
  formatTimeInZone,
  gridDateOfDayKey,
  safeTimeZone,
} from "@/lib/calendar/timezone"
import type {
  AttendanceStatus,
  BookingEvent,
  CalendarEvent,
  ClassSessionEvent,
} from "@/lib/calendar/types"
import { useLanguage } from "@/lib/i18n"
import { useMotionPreset } from "@/lib/motion"
import { cn } from "@/lib/utils"
import {
  AttendanceToggle,
  EventSituationBadge,
  MeetLink,
  SessionOccupancy,
} from "./event-badges"

export type AgendaListProps = {
  /** O primeiro dia aparece sempre, mesmo sem nada marcado: é o dia que a pessoa escolheu. */
  days: { start: string; end: string }
  today: string
  events: CalendarEvent[]
  zones: Map<string, string>
  primaryZone: string
  isFiltered: boolean
  onClearFilters: () => void
  onOpen: (event: CalendarEvent) => void
  onAttendance: (event: BookingEvent, status: AttendanceStatus) => void
  onCreate: (dayKey: string) => void
}

/** A agenda em lista, dia a dia. É o que o celular abre: o que tem hoje, e o que vem depois. */
export function AgendaList({
  days,
  today,
  events,
  zones,
  primaryZone,
  isFiltered,
  onClearFilters,
  onOpen,
  onAttendance,
  onCreate,
}: AgendaListProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const preset = useMotionPreset()

  const groups = useMemo(() => {
    const byDay = new Map<string, CalendarEvent[]>()
    for (const event of events) {
      const key = dayKeyOf(event.start, safeTimeZone(zones.get(event.calendarId), primaryZone))
      // Com calendários de fusos diferentes, o período pedido à API é um pouco maior.
      if (key < days.start || key >= days.end) continue
      byDay.set(key, [...(byDay.get(key) ?? []), event])
    }
    if (!byDay.has(days.start) && byDay.size > 0) byDay.set(days.start, [])
    return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [days.end, days.start, events, primaryZone, zones])

  if (groups.length === 0) {
    return isFiltered ? (
      <EmptyState
        className="m-4"
        title={t("calendar.empty.filtered.title")}
        description={t("calendar.empty.filtered.description")}
        action={{ label: t("calendar.empty.filtered.action"), onClick: onClearFilters }}
      />
    ) : (
      <EmptyState
        className="m-4"
        icon={<CalendarPlus className="size-5" />}
        title={t("calendar.empty.period.title")}
        description={t("calendar.empty.period.description")}
        action={{ label: t("calendar.empty.period.action"), onClick: () => onCreate(days.start) }}
      />
    )
  }

  return (
    <div className="pb-4">
      {groups.map(([dayKey, dayEvents]) => (
        <section key={dayKey} aria-labelledby={`agenda-day-${dayKey}`}>
          <header className="sticky top-0 z-20 flex items-center gap-2.5 border-b bg-background/95 px-4 py-2 backdrop-blur-sm">
            <span
              aria-hidden
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-medium tabular-nums",
                dayKey === today ? "bg-primary text-primary-foreground" : "bg-muted"
              )}
            >
              {gridDateOfDayKey(dayKey).getUTCDate()}
            </span>
            <h3
              id={`agenda-day-${dayKey}`}
              className="min-w-0 flex-1 truncate font-heading text-sm font-medium"
            >
              {relativeDayLabel(dayKey, today, language, t)}
            </h3>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {t("calendar.summary.events", { count: dayEvents.length, value: dayEvents.length })}
            </span>
          </header>

          {dayEvents.length === 0 ? (
            <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-muted-foreground">
              <span>{t("calendar.agenda.emptyDay")}</span>
              <Button
                variant="ghost"
                size="sm"
                className="pointer-coarse:h-10"
                onClick={() => onCreate(dayKey)}
              >
                {t("calendar.agenda.schedule")}
              </Button>
            </div>
          ) : (
            <ul>
              <AnimatePresence initial={false}>
                {dayEvents.map((event) => (
                  <motion.li key={event.id} layout="position" {...preset.listItem}>
                    <AgendaRow
                      event={event}
                      zone={safeTimeZone(zones.get(event.calendarId), primaryZone)}
                      language={language}
                      onOpen={onOpen}
                      onAttendance={onAttendance}
                    />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </section>
      ))}
    </div>
  )
}

function AgendaRow({
  event,
  zone,
  language,
  onOpen,
  onAttendance,
}: {
  event: CalendarEvent
  zone: string
  language: string
  onOpen: (event: CalendarEvent) => void
  onAttendance: (event: BookingEvent, status: AttendanceStatus) => void
}) {
  const { t } = useTranslation()
  const { title, detail } = eventHeadline(event)
  const canceled = isCanceled(event)
  // Presença só faz sentido depois de começar, ou para desfazer o que já foi marcado.
  const showAttendance =
    event.type === "booking" &&
    !canceled &&
    (event.start <= Date.now() || Boolean(event.attendanceStatus))

  return (
    <div className="relative flex items-center gap-3 border-b border-border/60 px-4 py-2.5 transition-colors hover:bg-muted/40">
      <div className="w-12 shrink-0 text-right tabular-nums">
        <div className="text-sm font-medium">{formatTimeInZone(event.start, zone, language)}</div>
        <div className="text-xs text-muted-foreground">
          {formatTimeInZone(event.end, zone, language)}
        </div>
      </div>
      <span
        aria-hidden
        className="w-1 shrink-0 self-stretch rounded-full bg-muted-foreground/40"
        style={event.color ? { backgroundColor: event.color } : undefined}
      />
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => onOpen(event)}
          className={cn(
            "block w-full truncate rounded text-left text-sm font-medium outline-none after:absolute after:inset-0 focus-visible:after:ring-3 focus-visible:after:ring-ring/50 focus-visible:after:ring-inset",
            canceled && "text-muted-foreground line-through"
          )}
        >
          {title || t("calendar.event.untitled")}
        </button>
        {event.type === "booking" ? (
          <BookingDetail event={event} detail={detail} />
        ) : (
          <SessionDetail event={event} language={language} />
        )}
      </div>
      {showAttendance ? (
        <AttendanceToggle event={event as BookingEvent} onToggle={onAttendance} />
      ) : null}
    </div>
  )
}

function BookingDetail({ event, detail }: { event: BookingEvent; detail: string | null }) {
  const line = [detail, event.professionalName].filter(Boolean).join(" · ")
  return (
    <>
      {line ? <p className="truncate text-xs text-muted-foreground">{line}</p> : null}
      <div className="flex flex-wrap items-center gap-1.5 empty:hidden [&:not(:empty)]:mt-1">
        <EventSituationBadge event={event} />
        {event.googleMeetUrl ? <MeetLink url={event.googleMeetUrl} compact /> : null}
      </div>
    </>
  )
}

function SessionDetail({ event, language }: { event: ClassSessionEvent; language: string }) {
  const { t } = useTranslation()
  const place = [event.instructorName, event.room, event.location].filter(Boolean).join(" · ")
  const summary = event.attendanceSummary
  const showSummary =
    summary && isPastEvent(event) && !isCanceled(event) && (summary.show > 0 || summary.noShow > 0)

  return (
    <>
      {place ? <p className="truncate text-xs text-muted-foreground">{place}</p> : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 empty:hidden [&:not(:empty)]:mt-1">
        <EventSituationBadge event={event} />
        <SessionOccupancy
          count={event.enrollmentCount}
          max={event.maxStudents}
          className="min-w-24"
        />
        {showSummary ? (
          <span className="text-xs text-muted-foreground tabular-nums">
            {t("calendar.session.summaryShort", {
              show: new Intl.NumberFormat(language).format(summary.show),
              noShow: new Intl.NumberFormat(language).format(summary.noShow),
            })}
          </span>
        ) : null}
      </div>
    </>
  )
}
