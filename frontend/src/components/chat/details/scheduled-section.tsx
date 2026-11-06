import { memo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Bell, X } from "lucide-react"
import { toast } from "sonner"

import { RelativeTime, useConfirm } from "@/components/shared"
import { Button } from "@/components/ui/button"
import {
  removeScheduledActionFromCache,
  useCalendarTimeZone,
  useChatBookings,
  useScheduledActions,
} from "@/hooks/chat-details/use-chat-details-data"
import { apiDelete } from "@/lib/api"
import { formatBookingDate } from "@/lib/chat-details/bookings"
import type { ScheduledAction } from "@/lib/chat-details/types"
import { formatDateTime } from "@/lib/date-format"
import { useLanguage } from "@/lib/i18n"
import { DetailsSection, SectionError, ShowMoreButton } from "./section"

/** Só o próximo envio fica à vista: é o único que a pessoa costuma precisar. */
const VISIBLE_LIMIT = 1

function ActionRow({
  action,
  timeZone,
  onCancel,
}: {
  action: ScheduledAction
  timeZone: string | null | undefined
  onCancel: (action: ScheduledAction) => void
}) {
  const { t } = useTranslation()
  const language = useLanguage()
  const start = action.metadata?.bookingStart
  const professional = action.metadata?.professionalName
  const detail = [
    start
      ? t("chatDetails.scheduled.forBooking", {
          when: formatBookingDate(start, language, timeZone),
        })
      : null,
    professional,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <li className="group/action flex items-center gap-2.5 py-1">
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
      >
        <Bell className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{action.name}</span>
        <span className="block truncate text-xs text-muted-foreground tabular-nums">
          <RelativeTime value={action.scheduledAt} className="font-medium text-foreground" />
          {detail ? ` · ${detail}` : null}
        </span>
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t("chatDetails.scheduled.cancelNamed", { name: action.name })}
        title={t("chatDetails.scheduled.cancel")}
        className="shrink-0 text-muted-foreground opacity-0 group-hover/action:opacity-100 focus-visible:opacity-100 pointer-coarse:size-10 pointer-coarse:opacity-100"
        onClick={() => onCancel(action)}
      >
        <X />
      </Button>
    </li>
  )
}

/**
 * O que a conversa ainda vai enviar sozinha. A seção só existe quando tem o que dizer: a maioria das
 * conversas não tem nada agendado, e não há o que criar daqui. Um erro aparece, porque "nada agendado"
 * é uma afirmação que a pessoa usa para decidir.
 */
export const ScheduledSection = memo(function ScheduledSection({ chatId }: { chatId: string }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const confirm = useConfirm()
  const { actions, error, retry } = useScheduledActions(chatId)
  // A ação diz de qual agendamento é, e o agendamento diz de qual calendário: é dele o fuso.
  const { upcoming, past } = useChatBookings(chatId)
  const timeZoneOf = useCalendarTimeZone()
  const [expanded, setExpanded] = useState(false)

  if (!error && actions.length === 0) return null

  const visible = expanded ? actions : actions.slice(0, VISIBLE_LIMIT)
  const calendarOf = (action: ScheduledAction) =>
    [...upcoming, ...past].find((booking) => booking.id === action.bookingId)?.calendarId

  const cancel = async (action: ScheduledAction) => {
    const confirmed = await confirm({
      title: t("chatDetails.scheduled.cancelTitle"),
      description: t("chatDetails.scheduled.cancelHint", {
        name: action.name,
        when: formatDateTime(action.scheduledAt, language),
      }),
      confirmLabel: t("chatDetails.scheduled.cancelConfirm"),
      cancelLabel: t("chatDetails.scheduled.keep"),
      destructive: true,
      onConfirm: () => apiDelete(`/chats/${chatId}/scheduled-actions/${action.id}`),
    })
    if (confirmed) {
      removeScheduledActionFromCache(chatId, action.id)
      toast.success(t("chatDetails.scheduled.canceled"))
    }
  }

  return (
    <DetailsSection id="scheduled" title={t("chatDetails.scheduled.title")} count={actions.length}>
      {error ? (
        <SectionError message={t("chatDetails.scheduled.loadFailed")} onRetry={retry} />
      ) : (
        <>
          <ul className="flex flex-col gap-0.5">
            {visible.map((action) => (
              <ActionRow
                key={action.id}
                action={action}
                timeZone={timeZoneOf(calendarOf(action))}
                onCancel={(target) => void cancel(target)}
              />
            ))}
          </ul>
          {actions.length > VISIBLE_LIMIT ? (
            <ShowMoreButton
              expanded={expanded}
              hiddenCount={actions.length - VISIBLE_LIMIT}
              onToggle={() => setExpanded((value) => !value)}
            />
          ) : null}
        </>
      )}
    </DetailsSection>
  )
})
