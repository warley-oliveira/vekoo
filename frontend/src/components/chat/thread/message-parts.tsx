import { memo, useMemo } from "react"
import { useTranslation } from "react-i18next"
import {
  AlertCircle,
  Ban,
  Bot,
  Check,
  CheckCheck,
  Clock,
  FileText,
  Hourglass,
  Image as ImageIcon,
  Mic,
  Video,
} from "lucide-react"

import { useDayLabel } from "@/hooks/chat/use-day-label"
import { formatTime } from "@/lib/date-format"
import { useLanguage } from "@/lib/i18n"
import { formatMessage } from "@/lib/chat/format-message"
import { mediaSource } from "@/lib/chat/media"
import { meaningfulContent, messageKind } from "@/lib/chat/message-rules"
import type { ChatMessage, MessageStatus } from "@/lib/chat/types"
import { cn } from "@/lib/utils"

/** O texto da mensagem, com links e formatação do WhatsApp. Só recalcula se o texto mudar. */
export const MessageText = memo(function MessageText({ text }: { text: string }) {
  const html = useMemo(() => formatMessage(text), [text])

  return (
    <span
      className="[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2"
      // O conteúdo passou por DOMPurify em `formatMessage`, com lista curta de marcas.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
})

export function StatusIcon({ status, label }: { status: MessageStatus; label: string }) {
  const className = "size-3.5 shrink-0"

  switch (status) {
    case "failed":
      return <AlertCircle role="img" aria-label={label} className={cn(className, "text-status-danger")} />
    case "pending":
      return <Clock role="img" aria-label={label} className={className} />
    case "server_ack":
      return <Check role="img" aria-label={label} className={className} />
    case "delivery_ack":
      return <CheckCheck role="img" aria-label={label} className={className} />
    case "read":
      return <CheckCheck role="img" aria-label={label} className={cn(className, "text-primary")} />
  }
}

/** Hora e status, encaixados no fim da última linha do texto, como nos apps de mensagem. */
export function MessageMeta({
  message,
  own,
  floating = true,
}: {
  message: ChatMessage
  own: boolean
  floating?: boolean
}) {
  const { t } = useTranslation()
  const language = useLanguage()
  const automated = own && message.messageOrigin === "platform"

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[0.6875rem] leading-4 text-muted-foreground tabular-nums select-none",
        floating && "float-right mt-1.5 ml-3"
      )}
    >
      {automated ? (
        <Bot role="img" aria-label={t("chat.message.automated")} className="size-3" />
      ) : null}
      <span>{formatTime(message.createdAt, language)}</span>
      {own && message.status ? (
        <StatusIcon status={message.status} label={t(`chat.message.status.${message.status}`)} />
      ) : null}
    </span>
  )
}

export function DeletedText() {
  const { t } = useTranslation()
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground italic">
      <Ban aria-hidden className="size-3.5" />
      {t("chat.message.deleted")}
    </span>
  )
}

export function WaitingText() {
  const { t } = useTranslation()
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground italic">
      <Hourglass aria-hidden className="size-3.5" />
      {t("chat.message.waiting")}
    </span>
  )
}

export const DaySeparator = memo(function DaySeparator({ day }: { day: number }) {
  const label = useDayLabel(day)

  return (
    <div role="separator" aria-label={label} className="flex justify-center pt-5 pb-2">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
    </div>
  )
})

const QUOTE_ICONS = {
  image: ImageIcon,
  video: Video,
  audio: Mic,
  document: FileText,
} as const

/** O que a citação mostra: a mídia pelo nome do tipo, o texto cortado em uma linha. */
export const QuotedMessage = memo(function QuotedMessage({
  message,
  contactName,
  onClick,
  className,
}: {
  message: ChatMessage | undefined
  contactName: string
  onClick?: () => void
  className?: string
}) {
  const { t } = useTranslation()

  if (!message) {
    const unknown = cn(
      "block w-full rounded-md border-l-2 border-border bg-foreground/[0.04] px-2 py-1 text-left text-xs text-muted-foreground italic",
      className
    )

    // Ainda há histórico para trás: ela deve estar lá, e tocar vai buscar.
    return onClick ? (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          unknown,
          "transition-colors outline-none hover:bg-foreground/[0.07] focus-visible:ring-3 focus-visible:ring-ring/50"
        )}
      >
        {t("chat.reply.older")}
      </button>
    ) : (
      <div className={unknown}>{t("chat.reply.unavailable")}</div>
    )
  }

  const kind = messageKind(message)
  const deleted = Boolean(message.deletedAt)
  const Icon = kind === "text" || kind === "sticker" || deleted ? null : QUOTE_ICONS[kind]
  const text = meaningfulContent(message.caption ?? message.content)
  const preview = deleted
    ? t("chat.message.deleted")
    : text || (kind === "text" ? "" : t(`chat.preview.${kind}`))
  const sender =
    message.role === "assistant" ? (message.senderName ?? t("chat.reply.you")) : contactName
  const thumbnail =
    !deleted && kind === "image" ? mediaSource(message.mediaUrl) : null

  const content = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-primary">{sender}</span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          {Icon ? <Icon aria-hidden className="size-3 shrink-0" /> : null}
          <span className={cn("truncate", deleted && "italic")}>{preview}</span>
        </span>
      </span>
      {thumbnail ? (
        <img src={thumbnail} alt="" loading="lazy" className="size-8 shrink-0 rounded object-cover" />
      ) : null}
    </>
  )

  const classes = cn(
    "flex w-full items-center gap-2 rounded-md border-l-2 border-primary bg-foreground/[0.04] px-2 py-1 text-left",
    className
  )

  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        classes,
        "transition-colors outline-none hover:bg-foreground/[0.07] focus-visible:ring-3 focus-visible:ring-ring/50"
      )}
    >
      {content}
    </button>
  ) : (
    <div className={classes}>{content}</div>
  )
})
