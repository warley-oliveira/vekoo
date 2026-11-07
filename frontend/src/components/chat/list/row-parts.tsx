import { memo, type MouseEvent, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import {
  Check,
  CheckCheck,
  FileText,
  Image as ImageIcon,
  Mic,
  Sticker,
  Video,
} from "lucide-react"

import { Skeleton } from "@/components/ui/skeleton"
import { LoadingRegion } from "@/components/shared"
import { useLongPress } from "@/hooks/use-long-press"
import { formatDate, formatTime } from "@/lib/date-format"
import { useLanguage } from "@/lib/i18n"
import { meaningfulContent, messageKind } from "@/lib/chat/message-rules"
import { formatNumber } from "@/lib/format-number"
import { cn } from "@/lib/utils"

const DAY_MS = 24 * 60 * 60 * 1000
const HOLD_MS = 450

const NOTHING = () => {}

/** "14:32" hoje, "ontem", o dia da semana até uma semana atrás, e depois a data. */
function useListTime(at: number | null | undefined): string {
  const { t } = useTranslation()
  const language = useLanguage()
  if (!at) return ""

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const startOfToday = today.getTime()

  if (at >= startOfToday) return formatTime(at, language)
  if (at >= startOfToday - DAY_MS) return t("chat.list.yesterday")
  if (at >= startOfToday - 6 * DAY_MS) {
    return new Intl.DateTimeFormat(language, { weekday: "short" }).format(at).replace(".", "")
  }
  return formatDate(at, language, "short")
}

/**
 * A linha da lista: um link de verdade, que abre em outra aba com Ctrl+clique. O clique comum
 * passa pela função estável que a lista recebe, para o `Link` do roteador não assinar a rota em
 * cada linha: trocar de conversa desenharia todas elas.
 */
export function ListRow({
  href,
  selected,
  onOpen,
  avatar,
  title,
  meta,
  children,
  "aria-label": ariaLabel,
  selection,
  onHold,
}: {
  href: string
  selected: boolean
  onOpen: () => void
  avatar: ReactNode
  title: ReactNode
  meta: ReactNode
  children: ReactNode
  "aria-label"?: string
  /** Escolhendo conversas: a linha deixa de abrir, e tocar nela marca. */
  selection?: { checked: boolean; onToggle: () => void; label: string }
  /** Segurar a linha, no celular: é como se entra na escolha de conversas. */
  onHold?: () => void
}) {
  const hold = useLongPress(onHold ?? NOTHING, { delay: HOLD_MS })
  // Só o toque: em tela larga, segurar o botão do mouse continua sendo arrastar ou selecionar.
  const holdHandlers = onHold
    ? {
        onTouchStart: hold.handlers.onTouchStart,
        onTouchMove: hold.handlers.onTouchMove,
        onTouchEnd: hold.handlers.onTouchEnd,
        onTouchCancel: hold.handlers.onTouchCancel,
        onContextMenu: hold.handlers.onContextMenu,
      }
    : undefined

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    onOpen()
  }

  if (selection) {
    return (
      <div className="px-1.5 py-px">
        <button
          type="button"
          role="checkbox"
          aria-checked={selection.checked}
          aria-label={selection.label}
          onClick={selection.onToggle}
          className={cn(
            "flex min-h-[4.25rem] w-full items-start gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-[3.75rem] md:py-2 md:select-auto",
            selection.checked ? "bg-accent text-accent-foreground" : "hover:bg-muted/70"
          )}
        >
          <span className="flex size-10 shrink-0 items-center justify-center">
            <span
              aria-hidden
              className={cn(
                "flex size-[1.125rem] items-center justify-center rounded-[4px] border transition-colors",
                selection.checked
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-background"
              )}
            >
              {selection.checked ? <Check className="size-3.5" /> : null}
            </span>
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex items-baseline justify-between gap-2">
              {title}
              <span className="flex shrink-0 items-center gap-1">{meta}</span>
            </span>
            {children}
          </span>
        </button>
      </div>
    )
  }

  return (
    <div className="px-1.5 py-px">
      <a
        href={href}
        onClick={handleClick}
        aria-current={selected ? "true" : undefined}
        aria-label={ariaLabel}
        {...holdHandlers}
        className={cn(
          "flex min-h-[4.25rem] items-start gap-3 rounded-lg px-2.5 py-2.5 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:active:bg-muted/70 md:min-h-[3.75rem] md:py-2",
          selected ? "bg-accent text-accent-foreground" : "hover:bg-muted/70",
          onHold && "select-none [-webkit-touch-callout:none]"
        )}
      >
        <span className="relative mt-0.5 shrink-0">{avatar}</span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-baseline justify-between gap-2">
            {title}
            <span className="flex shrink-0 items-center gap-1">{meta}</span>
          </span>
          {children}
        </span>
      </a>
    </div>
  )
}

export function RowName({
  children,
  unread,
  officialApi = false,
}: {
  children: ReactNode
  unread: boolean
  /** No celular, o selo de WhatsApp oficial: a marca do canal é a mesma nos dois tipos de número. */
  officialApi?: boolean
}) {
  const { t } = useTranslation()
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className={cn("truncate text-sm", unread ? "font-semibold" : "font-medium")}>
        {children}
      </span>
      {officialApi ? (
        <span
          aria-label={t("chat.channel.whatsapp_cloud")}
          title={t("chat.channel.whatsapp_cloud")}
          className="shrink-0 rounded-sm bg-muted px-1 text-[0.625rem] leading-4 font-medium text-muted-foreground"
        >
          {t("chatMobile.list.officialApi")}
        </span>
      ) : null}
    </span>
  )
}

export function RowTime({ at, unread }: { at: number | null | undefined; unread: boolean }) {
  const label = useListTime(at)
  return (
    <span
      className={cn(
        "text-xs whitespace-nowrap tabular-nums",
        unread ? "font-medium text-primary" : "text-muted-foreground"
      )}
    >
      {label}
    </span>
  )
}

export function UnreadBadge({ count, label }: { count: number; label: string }) {
  const language = useLanguage()
  if (count <= 0) return null

  return (
    <span
      aria-label={label}
      className="flex h-[1.125rem] min-w-[1.125rem] shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[0.6875rem] font-semibold text-primary-foreground tabular-nums"
    >
      {count > 99 ? "99+" : formatNumber(count, language)}
    </span>
  )
}

const KIND_ICONS = {
  audio: Mic,
  image: ImageIcon,
  video: Video,
  sticker: Sticker,
  document: FileText,
} as const

/** O que foi dito por último: o tipo manda, porque áudio sem transcrição guarda só um traço. */
export const LastMessagePreview = memo(function LastMessagePreview({
  type,
  content,
  by,
  unread,
}: {
  type: string | null
  content: string | null
  by: string | null
  unread: boolean
}) {
  const { t } = useTranslation()

  // Figurinha chega como `sticker` em `lastMessageType`; o resto, como o elemento da mensagem.
  const kind =
    type === "sticker"
      ? "sticker"
      : type === "text" || !type
        ? "text"
        : messageKind({ typeElement: type, mediaType: type === "media" ? "document" : type })
  const text = meaningfulContent(content)

  const Icon = kind === "text" ? null : KIND_ICONS[kind]
  const fallback = kind === "text" ? t("chat.list.noMessages") : t(`chat.preview.${kind}`)

  return (
    <span
      className={cn(
        "flex min-w-0 items-center gap-1 text-[0.8125rem] leading-5",
        unread ? "text-foreground" : "text-muted-foreground"
      )}
    >
      {by === "assistant" ? <CheckCheck aria-hidden className="size-3.5 shrink-0 opacity-60" /> : null}
      {Icon ? <Icon aria-hidden className="size-3.5 shrink-0" /> : null}
      <span className="truncate">{text || fallback}</span>
    </span>
  )
})

/** Esqueleto que espelha a linha: avatar, nome e hora, prévia. */
export function ChatListSkeleton({ rows = 9 }: { rows?: number }) {
  const widths = ["w-2/5", "w-1/2", "w-1/3", "w-3/5", "w-2/5", "w-1/2"]
  return (
    <LoadingRegion className="flex flex-col px-1.5 pt-1">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-start gap-3 px-2.5 py-2.5">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className={cn("h-3.5", widths[index % widths.length])} />
              <Skeleton className="h-3 w-8" />
            </div>
            <Skeleton className={cn("h-3", index % 2 === 0 ? "w-4/5" : "w-3/5")} />
          </div>
        </div>
      ))}
    </LoadingRegion>
  )
}
