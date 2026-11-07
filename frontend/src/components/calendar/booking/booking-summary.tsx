import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Ban, CalendarDays, ClipboardList, Clock, Globe, NotebookText, User } from "lucide-react"

import { Callout, UserAvatar } from "@/components/shared"
import type { BookingActions } from "@/hooks/calendar/use-booking-actions"
import { apiAssetUrl } from "@/lib/api"
import { relativeDayLabel, todayKey } from "@/lib/calendar/calendar-view"
import { isAllDayEvent, isCanceled } from "@/lib/calendar/event-status"
import {
  dayKeyOf,
  formatTimeRangeInZone,
  zoneDiffersFromBrowser,
  zoneDisplayName,
} from "@/lib/calendar/timezone"
import type { AgendaCalendar, BookingEvent } from "@/lib/calendar/types"
import { useLanguage } from "@/lib/i18n"
import { MeetLink } from "../event-badges"
import { AttendanceSection } from "./attendance-section"
import { formatMinutes } from "./duration"

/** Uma linha do resumo: o ícone diz o assunto, o rótulo fica para o leitor de tela. */
function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5 [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted-foreground">
      {icon}
      <dt className="sr-only">{label}</dt>
      <dd className="min-w-0 flex-1 text-sm">{children}</dd>
    </div>
  )
}

/**
 * O agendamento para ler: quando, o quê, com quem atende, onde e como está. O contato fica no
 * título e na coluna ao lado, para não aparecer três vezes. É o que abre primeiro; editar
 * é um passo a mais, de propósito, para ninguém remarcar sem querer ao só conferir um horário.
 */
export function BookingSummary({
  event,
  calendar,
  actions,
}: {
  event: BookingEvent
  calendar: AgendaCalendar | null
  actions: BookingActions
}) {
  const { t } = useTranslation()
  const language = useLanguage()
  const zone = calendar?.timeZone ?? "UTC"
  const canceled = isCanceled(event)

  const day = dayKeyOf(event.start, zone)
  const dayLabel = relativeDayLabel(day, todayKey(zone), language, t)
  const allDay = isAllDayEvent(event.start, event.end, zone)
  const minutes = Math.round((Math.max(event.end, event.start) - event.start) / 60_000)

  return (
    <div className="flex flex-col gap-5">
      {canceled ? (
        <Callout tone="neutral" icon={<Ban aria-hidden className="size-4" />}>
          {t("calendar.booking.canceledNotice")}
        </Callout>
      ) : null}

      {/* Quando: a pergunta que trouxe a pessoa até aqui, em destaque. */}
      <section aria-label={t("calendar.booking.summary.when")} className="flex flex-col gap-1">
        <p className="font-heading text-xl leading-tight font-semibold text-pretty">{dayLabel}</p>
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground tabular-nums">
          <Clock aria-hidden className="size-3.5" />
          <span className={canceled ? "line-through" : undefined}>
            {allDay
              ? t("calendar.grid.allDay")
              : formatTimeRangeInZone(event.start, event.end, zone, language)}
          </span>
          {allDay || minutes <= 0 ? null : (
            <>
              <span aria-hidden>·</span>
              <span>{formatMinutes(minutes, language)}</span>
            </>
          )}
        </p>
        {calendar && zoneDiffersFromBrowser(zone) ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Globe aria-hidden className="size-3.5" />
            {t("calendar.booking.summary.zone", { zone: zoneDisplayName(zone, language) })}
          </p>
        ) : null}
      </section>

      <AttendanceSection event={event} calendar={calendar} actions={actions} />

      <dl className="flex flex-col divide-y divide-border/60 border-y border-border/60">
        <Row icon={<ClipboardList aria-hidden />} label={t("calendar.booking.fields.service")}>
          {event.serviceName ?? (
            <span className="text-muted-foreground">{t("calendar.booking.fields.noService")}</span>
          )}
        </Row>

        <Row icon={<User aria-hidden />} label={t("calendar.booking.fields.professional")}>
          {event.professionalName ? (
            <span className="flex items-center gap-2">
              <UserAvatar
                name={event.professionalName}
                src={event.professionalAvatarUrl ? apiAssetUrl(event.professionalAvatarUrl) : null}
                size="sm"
              />
              <span className="truncate">{event.professionalName}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{t("calendar.booking.fields.noProfessional")}</span>
          )}
        </Row>

        {calendar ? (
          <Row icon={<CalendarDays aria-hidden />} label={t("calendar.booking.fields.calendar")}>
            <span className="flex items-center gap-2">
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full bg-muted-foreground/40"
                style={calendar.color ? { backgroundColor: calendar.color } : undefined}
              />
              {calendar.name}
            </span>
          </Row>
        ) : null}

        {event.description ? (
          <Row icon={<NotebookText aria-hidden />} label={t("calendar.booking.fields.description")}>
            <p className="break-words whitespace-pre-wrap text-pretty">{event.description}</p>
          </Row>
        ) : null}
      </dl>

      {event.googleMeetUrl ? <MeetLink url={event.googleMeetUrl} /> : null}
    </div>
  )
}
