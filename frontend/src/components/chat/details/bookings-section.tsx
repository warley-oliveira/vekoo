import { memo, useMemo, useState } from "react"
import { Link } from "react-router"
import { useTranslation } from "react-i18next"
import { CalendarDays, ChevronDown, Video } from "lucide-react"
import { toast } from "sonner"

import {
  RelativeTime,
  StatusBadge,
  Timeline,
  useConfirm,
  type StatusTone,
  type TimelineItem,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useCalendarTimeZone, useChatBookings } from "@/hooks/chat-details/use-chat-details-data"
import { apiDelete } from "@/lib/api"
import {
  bookingDayParts,
  bookingState,
  bookingTitle,
  formatBookingTime,
  type BookingState,
} from "@/lib/chat-details/bookings"
import type { Booking, BookingHistoryEntry } from "@/lib/chat-details/types"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { DetailsSection, SectionEmpty, SectionError, SectionRowsSkeleton, ShowMoreButton } from "./section"

/** Um contato pode acumular vários: só o que vem pela frente fica à vista de saída. */
const VISIBLE_LIMIT = 3
const VISIBLE_HISTORY = 3

const STATE_TONE: Record<Exclude<BookingState, "upcoming">, StatusTone> = {
  canceled: "neutral",
  noShow: "danger",
  show: "success",
  ended: "neutral",
}

const HISTORY_TONE: Record<string, StatusTone> = {
  create: "success",
  canceled: "danger",
  no_show: "danger",
  show: "success",
  time_update: "info",
  sequence_unenrolled: "warning",
}

function useHistoryItems(entries: BookingHistoryEntry[] | null): TimelineItem[] {
  const { t } = useTranslation()

  return useMemo(
    () =>
      [...(entries ?? [])]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((entry, index) => ({
          id: `${entry.eventName}-${entry.updatedAt}-${index}`,
          title: t(`chatDetails.bookings.event.${entry.eventName}`, {
            defaultValue: t("chatDetails.bookings.event.other"),
          }),
          description: entry.byUser && entry.userName ? entry.userName : undefined,
          tone: HISTORY_TONE[entry.eventName],
          time: entry.updatedAt,
        })),
    [entries, t]
  )
}

/** O histórico e a sequência: abre na própria linha, para não sair da conversa. */
function BookingExtras({ booking, onChanged }: { booking: Booking; onChanged: () => void }) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const [allHistory, setAllHistory] = useState(false)
  const items = useHistoryItems(booking.eventHistory)
  const visible = allHistory ? items : items.slice(0, VISIBLE_HISTORY)

  const leaveSequence = async () => {
    const confirmed = await confirm({
      title: t("chatDetails.bookings.sequence.leaveTitle"),
      description: t("chatDetails.bookings.sequence.leaveHint"),
      confirmLabel: t("chatDetails.bookings.sequence.leave"),
      cancelLabel: t("chatDetails.bookings.sequence.keep"),
      destructive: true,
      onConfirm: () => apiDelete(`/calendar-events/${booking.id}/sequence`),
    })
    if (confirmed) {
      toast.success(t("chatDetails.bookings.sequence.left"))
      onChanged()
    }
  }

  return (
    <div className="flex flex-col gap-2 pt-1 pb-2 pl-[2.875rem]">
      {booking.enrolledSequenceId ? (
        <div className="flex flex-wrap items-center justify-between gap-1 rounded-md bg-muted/50 px-2 py-1.5 text-xs">
          <span className="min-w-0">{t("chatDetails.bookings.sequence.active")}</span>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="text-destructive pointer-coarse:h-10"
            onClick={() => void leaveSequence()}
          >
            {t("chatDetails.bookings.sequence.leave")}
          </Button>
        </div>
      ) : null}

      {visible.length > 0 ? <Timeline items={visible} /> : null}

      {items.length > VISIBLE_HISTORY ? (
        <ShowMoreButton
          expanded={allHistory}
          hiddenCount={items.length - VISIBLE_HISTORY}
          onToggle={() => setAllHistory((value) => !value)}
        />
      ) : null}
    </div>
  )
}

function BookingRow({
  booking,
  timeZone,
  onChanged,
}: {
  booking: Booking
  timeZone: string | null | undefined
  onChanged: () => void
}) {
  const { t } = useTranslation()
  const language = useLanguage()
  const [open, setOpen] = useState(false)

  const state = bookingState(booking)
  const upcoming = state === "upcoming"
  const { day, month } = bookingDayParts(booking.start, language, timeZone)
  const hours = `${formatBookingTime(booking.start, language, timeZone)} – ${formatBookingTime(booking.end, language, timeZone)}`
  const details = [hours, booking.professionalName].filter(Boolean).join(" · ")
  const hasExtras = Boolean(booking.eventHistory?.length || booking.enrolledSequenceId)
  // Link de reunião só serve antes de acabar.
  const meetUrl = upcoming ? booking.googleMeetUrl : null

  const body = (
    <>
      <span
        aria-hidden
        className={cn(
          "flex size-9 shrink-0 flex-col items-center justify-center rounded-md leading-none",
          upcoming ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"
        )}
      >
        <span className="text-[0.8125rem] font-semibold tabular-nums">{day}</span>
        <span className="text-[0.5625rem] font-medium uppercase">{month}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-sm font-medium",
            state === "canceled" && "text-muted-foreground line-through"
          )}
        >
          {bookingTitle(booking)}
        </span>
        <span className="block truncate text-xs text-muted-foreground tabular-nums">
          {upcoming ? (
            <>
              <RelativeTime value={booking.start} className="font-medium text-foreground" />
              {" · "}
            </>
          ) : null}
          {details}
        </span>
        {!upcoming ? (
          <StatusBadge tone={STATE_TONE[state]} className="mt-1">
            {t(`chatDetails.bookings.state.${state}`)}
          </StatusBadge>
        ) : null}
      </span>
    </>
  )

  return (
    <li>
      <div className="flex items-center gap-1">
        {hasExtras ? (
          <button
            type="button"
            aria-expanded={open}
            aria-label={t("chatDetails.bookings.details", { name: bookingTitle(booking) })}
            onClick={() => setOpen((value) => !value)}
            className="group/booking -mx-1 flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-1 py-1 text-left outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {body}
            <ChevronDown
              aria-hidden
              className={cn(
                "size-3.5 shrink-0 text-muted-foreground transition-transform duration-150",
                open && "rotate-180"
              )}
            />
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2.5 py-1">{body}</div>
        )}

        {meetUrl ? (
          <Button
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-muted-foreground pointer-coarse:size-10"
            title={t("chatDetails.bookings.meet")}
            nativeButton={false}
            render={
              <a
                href={meetUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("chatDetails.bookings.meet")}
              />
            }
          >
            <Video />
          </Button>
        ) : null}
      </div>

      {open ? <BookingExtras booking={booking} onChanged={onChanged} /> : null}
    </li>
  )
}

/** Agendamentos do contato. Sem `calendar`, nem pede: quem só tem `chat` recebe 403. */
export const BookingsSection = memo(function BookingsSection({ chatId }: { chatId: string }) {
  const { t } = useTranslation()
  const { allowed, upcoming, past, error, isLoading, retry } = useChatBookings(chatId)
  const timeZoneOf = useCalendarTimeZone()
  const [expanded, setExpanded] = useState(false)

  if (!allowed) return null

  const all = [...upcoming, ...past]
  const visible = expanded ? all : all.slice(0, VISIBLE_LIMIT)

  return (
    <DetailsSection id="bookings" title={t("chatDetails.bookings.title")} count={all.length}>
      {error ? (
        <SectionError message={t("chatDetails.bookings.loadFailed")} onRetry={retry} />
      ) : isLoading ? (
        <SectionRowsSkeleton />
      ) : all.length === 0 ? (
        <SectionEmpty
          action={
            <Button
              variant="ghost"
              size="sm"
              className="-mr-2 pointer-coarse:h-10"
              nativeButton={false}
              render={<Link to="/calendar" />}
            >
              <CalendarDays />
              {t("chatDetails.bookings.openCalendar")}
            </Button>
          }
        >
          {t("chatDetails.bookings.empty")}
        </SectionEmpty>
      ) : (
        <>
          <ul className="flex flex-col gap-0.5">
            {visible.map((booking) => (
              <BookingRow
                key={booking.id}
                booking={booking}
                timeZone={timeZoneOf(booking.calendarId)}
                onChanged={retry}
              />
            ))}
          </ul>
          {all.length > VISIBLE_LIMIT ? (
            <ShowMoreButton
              expanded={expanded}
              hiddenCount={all.length - VISIBLE_LIMIT}
              onToggle={() => setExpanded((value) => !value)}
            />
          ) : null}
        </>
      )}
    </DetailsSection>
  )
})

