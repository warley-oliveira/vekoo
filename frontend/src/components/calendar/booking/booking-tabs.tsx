import { useLayoutEffect, useMemo, useRef } from "react"
import { useTranslation } from "react-i18next"
import {
  ArrowRight,
  CalendarCheck2,
  CalendarClock,
  CalendarPlus,
  CircleSlash,
  FileText,
  ImageIcon,
  ListChecks,
  ListX,
  Mic,
  PencilLine,
  Sticker,
  UserCheck,
  UserX,
  Video,
  type LucideIcon,
} from "lucide-react"

import {
  EmptyState,
  ErrorState,
  KeyValueList,
  Timeline,
  type StatusTone,
  type TimelineItem,
} from "@/components/shared"
import { Skeleton } from "@/components/ui/skeleton"
import { useBookingPreviewMessages } from "@/hooks/calendar/use-attendance-sequences"
import { useCustomFields } from "@/hooks/content/use-custom-fields"
import { ApiError } from "@/lib/api"
import { contactLine } from "@/lib/calendar/contact"
import { formatEventWhen, formatInZone, formatTimeInZone } from "@/lib/calendar/timezone"
import type { BookingEvent, BookingHistoryEntry, PreviewMessage } from "@/lib/calendar/types"
import { humanizeKey, isFilled, parseStoredDate } from "@/lib/chat-details/field-values"
import { meaningfulContent, messageKind, type MessageKind } from "@/lib/chat/message-rules"
import type { CustomField } from "@/lib/content/types"
import { formatDate } from "@/lib/date-format"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/* ---------- contato ---------- */

type DisplayField = Pick<CustomField, "name" | "valueType">

/**
 * O valor como gente lê, pelo tipo do campo cadastrado, como no chat e em Contatos: número no
 * jeito do idioma, data por extenso, sim ou não. O que um fluxo gravou sem campo vai como veio.
 */
function attributeValue(
  field: DisplayField | undefined,
  value: unknown,
  t: (key: string) => string,
  language: string
): string {
  const raw = typeof value === "string" ? value : typeof value === "number" ? String(value) : null
  if (typeof value === "boolean" || field?.valueType === "checkbox") {
    return t(value === true || raw === "true" ? "calendar.common.yes" : "calendar.common.no")
  }
  if (raw === null) return JSON.stringify(value)
  if (field?.valueType === "number" || typeof value === "number") {
    const parsed = Number(raw)
    if (Number.isFinite(parsed)) return formatNumber(parsed, language)
  }
  if (field?.valueType === "date" || /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const date = parseStoredDate(raw)
    if (date) return formatDate(date, language, "long")
  }
  return raw
}

/**
 * O que se sabe do contato deste agendamento: telefone e os campos da conversa. Nome e foto já
 * estão no título do modal, e a conversa abre pelo rodapé, no mesmo lugar em qualquer aba.
 */
export function BookingContactTab({ event }: { event: BookingEvent }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const { customFields } = useCustomFields()

  // A API já entrega os campos pelo nome cadastrado (`CustomFieldLabels`); o que não tem cadastro
  // vem pela chave. Os dois servem para achar o tipo.
  const fieldsByKey = useMemo(
    () =>
      new Map(
        (customFields ?? []).flatMap((field) => [
          [field.key, field],
          [field.name, field],
        ])
      ),
    [customFields]
  )

  const attributes = useMemo(() => {
    return Object.entries(event.customAttributes ?? {})
      .map(([key, value]) => {
        const field = fieldsByKey.get(key)
        return { key, value, field, label: field?.name ?? humanizeKey(key) }
      })
      .sort((a, b) => {
        const filled = Number(isFilled(b.value)) - Number(isFilled(a.value))
        return filled || a.label.localeCompare(b.label, language)
      })
  }, [event.customAttributes, fieldsByKey, language])

  if (!event.chatId) {
    return (
      <EmptyState
        title={t("calendar.booking.contact.none.title")}
        description={t("calendar.booking.contact.none.description")}
      />
    )
  }

  const phone = contactLine(event.contactExternalId)
  const copyable = Boolean(event.contactExternalId && /^\d+$/.test(event.contactExternalId))

  return (
    <div className="flex flex-col gap-5">
      {phone ? (
        <KeyValueList
          items={[
            {
              label: t("calendar.booking.contact.phone"),
              value: <span className="tabular-nums">{phone}</span>,
              copyValue: copyable ? (event.contactExternalId ?? undefined) : undefined,
            },
          ]}
        />
      ) : null}

      <section aria-labelledby="booking-contact-fields" className="flex flex-col gap-3">
        <h3 id="booking-contact-fields" className="text-sm font-medium">
          {t("calendar.booking.contact.attributes")}
        </h3>
        {attributes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("calendar.booking.contact.noAttributes")}</p>
        ) : (
          <KeyValueList
            items={attributes.map(({ value, field, label }) => ({
              label,
              value: isFilled(value) ? attributeValue(field, value, t, language) : null,
            }))}
          />
        )}
      </section>
    </div>
  )
}

/* ---------- mensagens ---------- */

const KIND_ICONS: Record<Exclude<MessageKind, "text">, LucideIcon> = {
  audio: Mic,
  image: ImageIcon,
  video: Video,
  sticker: Sticker,
  document: FileText,
}

/** Mídia diz o que é ("Áudio", "Foto"), como no chat; a legenda, se houver, vem embaixo. */
function PreviewBubble({ message, timeZone }: { message: PreviewMessage; timeZone: string }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const fromContact = message.role === "user"
  const kind = messageKind({
    typeElement: message.typeElement ?? "text",
    mediaType: message.mediaType ?? null,
  })
  const text = meaningfulContent(message.content)
  const Icon = kind === "text" ? null : KIND_ICONS[kind]

  return (
    <li
      className={cn(
        "max-w-[85%] rounded-lg px-3 py-2 text-sm",
        fromContact ? "self-start bg-muted" : "self-end bg-accent text-accent-foreground"
      )}
    >
      {Icon ? (
        <p className="flex items-center gap-1.5 opacity-80">
          <Icon aria-hidden className="size-3.5 shrink-0" />
          {t(`calendar.booking.messages.kinds.${kind}`)}
        </p>
      ) : null}
      {text ? <p className="break-words whitespace-pre-wrap">{text}</p> : null}
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
}

/** Bolhas alternadas, da forma das de verdade. */
function MessagesSkeleton() {
  const { t } = useTranslation()
  const widths = ["w-3/5", "w-2/3", "w-2/5", "w-1/2", "w-3/5"]
  return (
    <div role="status" aria-label={t("calendar.booking.messages.loading")} className="flex flex-col gap-2">
      {widths.map((width, index) => (
        <Skeleton
          key={index}
          className={cn("h-14 rounded-lg", width, index % 2 === 0 ? "self-start" : "self-end")}
        />
      ))}
    </div>
  )
}

/**
 * As últimas mensagens da conversa, só para ler: responder é no chat, pelo rodapé. Na coluna que
 * rola sozinha (tela larga), abre no fim, onde está o que foi dito por último.
 */
export function BookingMessagesTab({ event, timeZone }: { event: BookingEvent; timeZone: string }) {
  const { t } = useTranslation()
  const { messages, error, isLoading, reload } = useBookingPreviewMessages(
    event.calendarId,
    event.id
  )
  const listRef = useRef<HTMLOListElement>(null)
  const count = messages?.length ?? 0

  useLayoutEffect(() => {
    const scroller = listRef.current?.closest<HTMLElement>("[data-booking-scroll]")
    if (!scroller || getComputedStyle(scroller).overflowY !== "auto") return
    scroller.scrollTop = scroller.scrollHeight
  }, [count])

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
  if (isLoading && !messages) return <MessagesSkeleton />
  if (!messages?.length) {
    return (
      <EmptyState
        title={t("calendar.booking.messages.empty.title")}
        description={t("calendar.booking.messages.empty.description")}
      />
    )
  }

  return (
    <ol ref={listRef} className="flex flex-col gap-2">
      {messages.map((message) => (
        <PreviewBubble key={message.id} message={message} timeZone={timeZone} />
      ))}
    </ol>
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

  return <Timeline items={items} />
}
