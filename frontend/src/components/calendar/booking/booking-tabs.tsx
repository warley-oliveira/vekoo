import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import {
  ArrowRight,
  CalendarCheck2,
  CalendarClock,
  CalendarPlus,
  CircleSlash,
  ListChecks,
  ListX,
  MessageCircle,
  PencilLine,
  UserCheck,
  UserX,
} from "lucide-react"
import { Link } from "react-router"

import {
  CopyButton,
  EmptyState,
  ErrorState,
  KeyValueList,
  ListSkeleton,
  StatusBadge,
  Timeline,
  UserAvatar,
  type StatusTone,
  type TimelineItem,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useBookingPreviewMessages } from "@/hooks/calendar/use-attendance-sequences"
import { ApiError, apiAssetUrl } from "@/lib/api"
import { formatEventWhen, formatInZone, formatTimeInZone } from "@/lib/calendar/timezone"
import type { BookingEvent, BookingHistoryEntry } from "@/lib/calendar/types"
import { contactLine } from "@/lib/calendar/contact"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/* ---------- contato ---------- */

function attributeLabel(name: string): string {
  return name.replaceAll("_", " ")
}

function isFilled(value: unknown): boolean {
  return value !== null && value !== undefined && value !== ""
}

function attributeValue(value: unknown): string {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : JSON.stringify(value)
}

/** Quem é o contato deste agendamento, e o que já se sabe sobre ele. Trocar é no formulário. */
export function BookingContactTab({ event }: { event: BookingEvent }) {
  const { t } = useTranslation()
  const language = useLanguage()

  const attributes = useMemo(() => {
    const entries = Object.entries(event.customAttributes ?? {})
    return entries.sort(([nameA, valueA], [nameB, valueB]) => {
      const filled = Number(isFilled(valueB)) - Number(isFilled(valueA))
      return filled || nameA.localeCompare(nameB, language)
    })
  }, [event.customAttributes, language])

  if (!event.chatId) {
    return (
      <EmptyState
        title={t("calendar.booking.contact.none.title")}
        description={t("calendar.booking.contact.none.description")}
      />
    )
  }

  const filledCount = attributes.filter(([, value]) => isFilled(value)).length

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <UserAvatar
          name={event.userName}
          src={event.profilePictureUrl ? apiAssetUrl(event.profilePictureUrl) : null}
          size="lg"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{event.userName || t("calendar.booking.contact.fallback")}</p>
          {event.contactExternalId ? (
            <p className="truncate text-sm text-muted-foreground tabular-nums">
              {contactLine(event.contactExternalId)}
            </p>
          ) : null}
        </div>
        {event.contactExternalId && /^\d+$/.test(event.contactExternalId) ? (
          <CopyButton value={event.contactExternalId} />
        ) : null}
      </div>

      <Button
        variant="outline"
        nativeButton={false}
        className="self-start pointer-coarse:h-10"
        render={<Link to={`/chat/${event.chatId}`} />}
      >
        <MessageCircle />
        {t("calendar.booking.contact.openChat")}
      </Button>

      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">{t("calendar.booking.contact.attributes")}</h3>
          {filledCount > 0 ? (
            <StatusBadge tone="neutral">
              {filledCount}/{attributes.length}
            </StatusBadge>
          ) : null}
        </div>
        {attributes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("calendar.booking.contact.noAttributes")}</p>
        ) : (
          <KeyValueList
            items={attributes.map(([name, value]) => ({
              label: attributeLabel(name),
              value: isFilled(value) ? attributeValue(value) : null,
            }))}
          />
        )}
      </section>
    </div>
  )
}

/* ---------- mensagens ---------- */

/** As últimas mensagens da conversa, só para ler. Responder é no chat. */
export function BookingMessagesTab({ event, timeZone }: { event: BookingEvent; timeZone: string }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const { messages, error, isLoading, reload } = useBookingPreviewMessages(
    event.calendarId,
    event.id
  )

  if (error) {
    // A conversa pode estar fora do que esta pessoa alcança no chat.
    if (error instanceof ApiError && error.status === 404) {
      return (
        <EmptyState
          title={t("calendar.booking.messages.outOfReach.title")}
          description={t("calendar.booking.messages.outOfReach.description")}
        />
      )
    }
    return <ErrorState error={error} onRetry={() => void reload()} />
  }
  if (isLoading && !messages) return <ListSkeleton rows={4} />
  if (!messages?.length) {
    return (
      <EmptyState
        title={t("calendar.booking.messages.empty.title")}
        description={t("calendar.booking.messages.empty.description")}
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-2">
        {messages.map((message) => {
          const fromContact = message.role === "user"
          return (
            <li
              key={message.id}
              className={cn(
                "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                fromContact ? "self-start bg-muted" : "self-end bg-accent text-accent-foreground"
              )}
            >
              <p className="break-words whitespace-pre-wrap">{message.content}</p>
              <time className="mt-0.5 block text-right text-[0.6875rem] opacity-70 tabular-nums">
                {formatInZone(message.createdAt, timeZone, language, {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            </li>
          )
        })}
      </ol>
      {event.chatId ? (
        <Button
          variant="outline"
          nativeButton={false}
          className="self-center pointer-coarse:h-10"
          render={<Link to={`/chat/${event.chatId}`} />}
        >
          <MessageCircle />
          {t("calendar.booking.contact.openChat")}
        </Button>
      ) : null}
    </div>
  )
}

/* ---------- histórico ---------- */

const HISTORY: Record<string, { key: string; tone: StatusTone; icon: React.ReactNode }> = {
  create: { key: "create", tone: "success", icon: <CalendarPlus /> },
  canceled: { key: "canceled", tone: "danger", icon: <CircleSlash /> },
  archived: { key: "archived", tone: "neutral", icon: <CircleSlash /> },
  time_update: { key: "timeUpdate", tone: "info", icon: <CalendarClock /> },
  title_update: { key: "titleUpdate", tone: "accent", icon: <PencilLine /> },
  show: { key: "show", tone: "success", icon: <UserCheck /> },
  no_show: { key: "noShow", tone: "danger", icon: <UserX /> },
  attendance_cleared: { key: "attendanceCleared", tone: "neutral", icon: <CalendarCheck2 /> },
  sequence_enrolled: { key: "sequenceEnrolled", tone: "info", icon: <ListChecks /> },
  sequence_unenrolled: { key: "sequenceUnenrolled", tone: "warning", icon: <ListX /> },
}

function FromTo({ from, to }: { from: string; to: string }) {
  return (
    <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground tabular-nums">
      <span className="line-through">{from}</span>
      <ArrowRight aria-hidden className="size-3" />
      <span className="text-foreground">{to}</span>
    </span>
  )
}

/** O que aconteceu com o agendamento, do mais novo para o mais antigo, sempre no fuso dele. */
export function BookingHistory({ event, timeZone }: { event: BookingEvent; timeZone: string }) {
  const { t } = useTranslation()
  const language = useLanguage()

  const items = useMemo<TimelineItem[]>(() => {
    const author = (entry: BookingHistoryEntry) =>
      entry.byUser && entry.userName ? entry.userName : t("calendar.history.automation")
    const when = (entry: BookingHistoryEntry) =>
      `${formatInZone(entry.updatedAt, timeZone, language, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })}, ${formatTimeInZone(entry.updatedAt, timeZone, language)}`

    return [...event.eventHistory].reverse().map((entry, index) => {
      const known = HISTORY[entry.eventName]
      let content: React.ReactNode = null

      if (entry.eventName === "time_update" && entry.start && entry.end) {
        content = (
          <FromTo
            from={formatEventWhen(entry.start[0], entry.end[0], timeZone, language)}
            to={formatEventWhen(entry.start[1], entry.end[1], timeZone, language)}
          />
        )
      } else if (entry.eventName === "title_update" && Array.isArray(entry.title)) {
        content = (
          <FromTo
            from={entry.title[0] || t("calendar.history.noTitle")}
            to={entry.title[1] || t("calendar.history.noTitle")}
          />
        )
      } else if (entry.eventName === "sequence_enrolled" && entry.sequenceName) {
        content = <span className="text-xs text-muted-foreground">{entry.sequenceName}</span>
      }

      return {
        id: `${entry.updatedAt}-${index}`,
        tone: known?.tone ?? "neutral",
        icon: known?.icon,
        title: t(`calendar.history.events.${known?.key ?? "other"}`),
        description: t("calendar.history.byAt", { author: author(entry), when: when(entry) }),
        content,
      }
    })
  }, [event.eventHistory, language, t, timeZone])

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("calendar.history.empty")}</p>
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        {t("calendar.history.createdOn", {
          date: formatInZone(event.createdAt, timeZone, language, { dateStyle: "short" }),
        })}
      </p>
      <Timeline items={items} />
    </div>
  )
}
