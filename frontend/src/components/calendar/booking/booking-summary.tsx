import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Ban, CalendarDays, Clock, Globe, MessageCircle, NotebookText, ClipboardList, User } from "lucide-react"
import { Link } from "react-router"

import { Callout, UserAvatar } from "@/components/shared"
import type { BookingActions } from "@/hooks/calendar/use-booking-actions"
import { useCan } from "@/hooks/use-can"
import { apiAssetUrl } from "@/lib/api"
import { relativeDayLabel, todayKey } from "@/lib/calendar/calendar-view"
import { contactLine } from "@/lib/calendar/contact"
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
 * O agendamento para ler: quando, com quem, o quê, onde e como está. É o que abre primeiro; editar
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
  const canChat = useCan("chat")
  const zone = calendar?.timeZone ?? "UTC"
  const canceled = isCanceled(event)

  const day = dayKeyOf(event.start, zone)
  const dayLabel = relativeDayLabel(day, todayKey(zone), language, t)
  const allDay = isAllDayEvent(event.start, event.end, zone)
  const minutes = Math.round((Math.max(event.end, event.start) - event.start) / 60_000)
  const phone = contactLine(event.contactExternalId)

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
        <Row icon={<MessageCircle aria-hidden />} label={t("calendar.booking.fields.contact")}>
          {event.chatId ? (
            <div className="flex items-center gap-2.5">
              <UserAvatar
                name={event.userName}
                src={event.profilePictureUrl ? apiAssetUrl(event.profilePictureUrl) : null}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                {canChat ? (
                  <Link
                    to={`/chat/${event.chatId}`}
                    className="block truncate font-medium underline-offset-4 outline-none hover:underline focus-visible:underline"
                  >
                    {event.userName || t("calendar.booking.contact.fallback")}
                  </Link>
                ) : (
                  <span className="block truncate font-medium">
                    {event.userName || t("calendar.booking.contact.fallback")}
                  </span>
                )}
                {phone ? (
                  <span className="block truncate text-xs text-muted-foreground tabular-nums">{phone}</span>
                ) : null}
              </div>
            </div>
          ) : (
            <span className="text-muted-foreground">{t("calendar.booking.summary.noContact")}</span>
          )}
        </Row>

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
