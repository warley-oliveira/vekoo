import { lazy, memo, Suspense, useCallback, useState, type MouseEvent } from "react"
import { motion } from "motion/react"
import { useTranslation } from "react-i18next"
import { AlertTriangle, ArrowRightLeft, Bot, RefreshCw, TriangleAlert, UserPlus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { useRowEngaged } from "@/hooks/chat/use-row-engaged"
import { useLongPress } from "@/hooks/use-long-press"
import { haptic } from "@/lib/chat-mobile/haptics"
import { useMotionPreset } from "@/lib/motion"
import { bubbleText, meaningfulContent, messageKind } from "@/lib/chat/message-rules"
import { useMessageSelection, useThreadUi } from "@/lib/chat/stores"
import { useThreadStore, type OutgoingMessage } from "@/lib/chat/thread-store"
import type { ThreadRow } from "@/lib/chat/thread-rows"
import type { ChatMessage } from "@/lib/chat/types"
import { cn } from "@/lib/utils"
import { FileCard } from "../media/file-card"
import { MediaGrid, MessageMedia, StickerImage } from "../media/message-media"
import { ActionsSentinel, MessageActions } from "./message-actions"
import {
  DaySeparator,
  DeletedText,
  MessageMeta,
  MessageText,
  QuotedMessage,
  StatusIcon,
  WaitingText,
} from "./message-parts"
import { MessageReactions } from "./message-reactions"
import { AdGreeting, WidgetContext } from "./special-cards"
import { useThreadContext } from "./thread-context"

// O player traz o canvas da onda e o caminho do fallback de Opus: desce com o primeiro áudio.
const AudioPlayer = lazy(() => import("../media/audio-player"))

const ENTER_WINDOW_MS = 4_000

/** Mensagem que acabou de chegar entra com um movimento curto; rolar a lista não anima nada. */
function useIsFresh(createdAt: number): boolean {
  const [fresh] = useState(() => Date.now() - createdAt < ENTER_WINDOW_MS)
  return fresh
}

function FreshEntry({
  createdAt,
  own,
  className,
  children,
  ...rest
}: {
  createdAt: number
  own: boolean
  className?: string
  children: React.ReactNode
  "data-message-id"?: string
  onPointerEnter?: () => void
}) {
  const fresh = useIsFresh(createdAt)
  const preset = useMotionPreset()

  if (!fresh) {
    return (
      <div className={className} {...rest}>
        {children}
      </div>
    )
  }

  return (
    <motion.div
      className={className}
      initial={
        preset.reduced ? { opacity: 0 } : { opacity: 0, y: 6, x: own ? 4 : -4 }
      }
      animate={preset.reduced ? { opacity: 1 } : { opacity: 1, y: 0, x: 0 }}
      transition={preset.springSoft}
      {...rest}
    >
      {children}
    </motion.div>
  )
}

/** O que o envio avisa sem ter falhado: o resto foi, e isto não. */
function SendNotice({ text }: { text: string }) {
  return (
    <p className="mt-1 flex max-w-full items-start justify-end gap-1 px-1 text-xs text-status-warning">
      <TriangleAlert aria-hidden className="mt-0.5 size-3 shrink-0" />
      <span className="min-w-0 text-right">{text}</span>
    </p>
  )
}

/** O conteúdo pelo tipo. */
function BubbleContent({ message, own }: { message: ChatMessage; own: boolean }) {
  const { t } = useTranslation()
  const { threadKey } = useThreadContext()
  const kind = messageKind(message)
  const caption = meaningfulContent(message.caption)

  if (kind === "text") {
    const text = bubbleText(message)
    return (
      <div className="text-sm leading-5 break-words whitespace-pre-wrap">
        {/* Sobra vazio quando a mensagem era só a citação de um anexo que não existe mais. */}
        {text ? (
          <MessageText text={text} />
        ) : (
          <span className="text-muted-foreground italic">{t("chat.message.attachmentMissing")}</span>
        )}
        <MessageMeta message={message} own={own} />
      </div>
    )
  }

  if (kind === "audio") {
    const transcript = meaningfulContent(message.content)
    return (
      <div className="flex flex-col gap-1">
        <Suspense fallback={<Skeleton className="h-11 w-64 max-w-full rounded-lg" />}>
          <AudioPlayer
            source={message.audioUrl ?? message.mediaUrl}
            mediaId={message.id}
            hintedDuration={message.mediaProperties?.seconds ?? undefined}
          />
        </Suspense>
        {transcript ? (
          <p className="text-xs leading-5 text-muted-foreground italic">{transcript}</p>
        ) : null}
        <div className="flex justify-end">
          <MessageMeta message={message} own={own} floating={false} />
        </div>
      </div>
    )
  }

  if (kind === "document") {
    return (
      <div className="flex flex-col gap-1">
        <FileCard message={message} />
        {caption ? (
          <p className="text-sm leading-5 break-words whitespace-pre-wrap">
            <MessageText text={caption} />
          </p>
        ) : null}
        <div className="flex justify-end">
          <MessageMeta message={message} own={own} floating={false} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <MessageMedia message={message} threadKey={threadKey} />
      {caption ? (
        <div className="px-1 text-sm leading-5 break-words whitespace-pre-wrap">
          <MessageText text={caption} />
          <MessageMeta message={message} own={own} />
        </div>
      ) : (
        <div className="flex justify-end px-1">
          <MessageMeta message={message} own={own} floating={false} />
        </div>
      )}
    </div>
  )
}

/** Segurar a bolha, no toque, mostra as ações. Uma de cada vez: tocar fora esconde. */
function useTouchActions(id: string, inSheet: boolean) {
  const active = useThreadUi((state) => state.activeMessageId === id)
  const show = useCallback(() => {
    if (inSheet) haptic()
    useThreadUi.setState({ activeMessageId: id })
  }, [id, inSheet])
  const { handlers, didFire } = useLongPress(show, { delay: 450 })
  return { active, handlers, didFire }
}

/** Soltar logo depois de segurar ainda gera um clique: ele não pode abrir a foto ou tocar o áudio. */
function swallowClickAfterHold(didFire: () => boolean) {
  return (event: MouseEvent) => {
    if (!didFire()) return
    event.preventDefault()
    event.stopPropagation()
  }
}

/** No celular a bolha é um alvo de segurar: nem seleção de texto, nem o menu do sistema por cima. */
const HOLD_TARGET = "select-none [-webkit-touch-callout:none]"

function SelectionCheckbox({ id, disabled }: { id: string; disabled?: boolean }) {
  const { t } = useTranslation()
  const selected = useMessageSelection((state) => state.ids.has(id))

  return (
    <span className="flex w-8 shrink-0 items-center justify-center self-center">
      <Checkbox
        checked={selected}
        disabled={disabled}
        aria-label={t("chat.message.selectOne")}
        onCheckedChange={() => useMessageSelection.getState().toggle(id)}
      />
    </span>
  )
}

function useRowSelection(id: string) {
  const selecting = useMessageSelection((state) => state.active)
  const selected = useMessageSelection((state) => state.ids.has(id))

  const onClickCapture = selecting
    ? (event: MouseEvent) => {
        // Escolhendo várias, a linha inteira é o alvo: clicar não abre foto nem toca áudio.
        event.preventDefault()
        event.stopPropagation()
        useMessageSelection.getState().toggle(id)
      }
    : undefined

  return { selecting, selected, onClickCapture }
}

const MessageBubble = memo(function MessageBubble({
  row,
}: {
  row: Extract<ThreadRow, { kind: "message" }>
}) {
  const { t } = useTranslation()
  const { message, startsGroup, endsGroup } = row
  const { chatId, threadKey, contactName, sheetActions, react, retry, scrollToMessage, renderOrigin } =
    useThreadContext()
  const own = message.role === "assistant"

  const quoted = useThreadStore((state) =>
    message.replyToMessageId
      ? state.threads[threadKey]?.messages.find((item) => item.id === message.replyToMessageId)
      : undefined
  )
  const quoteIsOlder = useThreadStore(
    (state) => Boolean(message.replyToMessageId) && (state.threads[threadKey]?.hasMore ?? false)
  )

  const { selecting, selected, onClickCapture } = useRowSelection(message.id)
  const touch = useTouchActions(message.id, sheetActions)
  const { engaged, engage } = useRowEngaged()
  const showActions = !sheetActions && (engaged || touch.active)
  const flash = useThreadUi((state) => state.flashId === message.id)

  const kind = messageKind(message)
  const deleted = Boolean(message.deletedAt)
  const sticker = kind === "sticker" && !deleted
  const failed = message.status === "failed"
  const hasReactions = (message.reactions ?? []).some((reaction) => reaction.emoji)
  const showName = own && startsGroup && Boolean(message.senderName)
  const isMedia = (kind === "image" || kind === "video") && !deleted && !message.missingMessage

  return (
    <FreshEntry
      createdAt={message.createdAt}
      own={own}
      data-message-id={message.id}
      className={cn(
        "group/message flex items-end gap-1 px-3 md:px-5",
        startsGroup ? "pt-3" : "pt-0.5",
        hasReactions && "pb-2.5",
        selecting && "cursor-pointer",
        selected && "bg-accent/60",
        sheetActions && HOLD_TARGET,
        sheetActions && touch.active && "bg-accent/60"
      )}
    >
      {selecting ? <SelectionCheckbox id={message.id} /> : null}
      <div
        className={cn("flex min-w-0 flex-1 items-end gap-1", own ? "justify-end" : "justify-start")}
        onClickCapture={
          onClickCapture ?? (sheetActions ? swallowClickAfterHold(touch.didFire) : undefined)
        }
        onPointerEnter={sheetActions ? undefined : engage}
        {...(selecting || (sheetActions && !chatId) ? {} : touch.handlers)}
      >
        {!showActions && chatId && !selecting ? (
          sheetActions ? (
            <ActionsSentinel
              onClick={() => useThreadUi.setState({ activeMessageId: message.id })}
            />
          ) : (
            <ActionsSentinel onFocus={engage} />
          )
        ) : null}
        {own && showActions ? <MessageActions message={message} own visible={touch.active} /> : null}

        <div
          className={cn(
            "relative flex max-w-[min(36rem,82%)] min-w-0 flex-col",
            own ? "items-end" : "items-start"
          )}
        >
          {renderOrigin ? <div className="mb-0.5 px-1">{renderOrigin(message)}</div> : null}
          {showName ? (
            <span className="mb-0.5 px-1 text-xs font-medium text-muted-foreground">
              {message.senderName}
            </span>
          ) : null}

          <div
            className={cn(
              "relative min-w-0 rounded-2xl",
              sticker ? "" : own ? "bg-accent" : "bg-muted",
              !sticker && (isMedia ? "p-1" : "px-3 py-1.5"),
              own && !startsGroup && !sticker && "rounded-tr-md",
              own && !endsGroup && !sticker && "rounded-br-md",
              !own && !startsGroup && !sticker && "rounded-tl-md",
              !own && !endsGroup && !sticker && "rounded-bl-md",
              "transition-shadow duration-300",
              failed && "ring-1 ring-status-danger/40",
              flash && "ring-2 ring-primary/50"
            )}
          >
            {message.replyToMessageId && !deleted ? (
              <QuotedMessage
                message={quoted}
                contactName={contactName}
                onClick={
                  (quoted || quoteIsOlder) && !selecting
                    ? () => scrollToMessage(message.replyToMessageId as string)
                    : undefined
                }
                className={cn("mb-1", isMedia && "mx-0")}
              />
            ) : null}

            {deleted ? (
              <div className="flex items-center gap-3">
                <DeletedText />
                <MessageMeta message={{ ...message, status: null }} own={own} floating={false} />
              </div>
            ) : message.missingMessage ? (
              <WaitingText />
            ) : sticker ? (
              <div className="flex flex-col items-end gap-1">
                <StickerImage message={message} />
                <MessageMeta message={message} own={own} floating={false} />
              </div>
            ) : (
              <BubbleContent message={message} own={own} />
            )}

            <MessageReactions
              reactions={message.reactions}
              own={own}
              contactName={contactName}
              onRemoveOwn={chatId ? () => react(message, "") : undefined}
            />
          </div>

          {failed && chatId ? (
            <div className="mt-1 flex max-w-full flex-wrap items-center justify-end gap-x-2 px-1 text-xs text-status-danger">
              {/* O motivo vem do provedor e às vezes é longo: duas linhas, e o resto em `title`. */}
              <span className="line-clamp-2 min-w-0 text-right" title={message.statusMessage ?? undefined}>
                {message.statusMessage
                  ? t("chat.message.failedWithReason", { reason: message.statusMessage })
                  : t("chat.message.failed")}
              </span>
              {kind === "text" && bubbleText(message) ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="h-5 px-1.5 text-status-danger hover:text-status-danger"
                  onClick={() => retry(message)}
                >
                  <RefreshCw />
                  {t("chat.message.retry")}
                </Button>
              ) : null}
            </div>
          ) : null}

          {row.notice ? <SendNotice text={row.notice} /> : null}
        </div>

        {!own && showActions ? (
          <MessageActions message={message} own={false} visible={touch.active} />
        ) : null}
      </div>
    </FreshEntry>
  )
})

const MediaGroupRow = memo(function MediaGroupRow({
  row,
}: {
  row: Extract<ThreadRow, { kind: "media-group" }>
}) {
  const { threadKey, renderOrigin, chatId, sheetActions } = useThreadContext()
  const first = row.messages[0]
  const last = row.messages[row.messages.length - 1]
  const own = first.role === "assistant"
  const selecting = useMessageSelection((state) => state.active)
  const { engaged, engage } = useRowEngaged()
  const touch = useTouchActions(last.id, sheetActions)
  const holdable = sheetActions && Boolean(chatId) && !selecting

  return (
    <FreshEntry
      createdAt={last.createdAt}
      own={own}
      data-message-id={sheetActions ? last.id : undefined}
      className={cn(
        "group/message flex items-end gap-1 px-3 md:px-5",
        own ? "justify-end" : "justify-start",
        row.startsGroup ? "pt-3" : "pt-0.5",
        sheetActions && HOLD_TARGET,
        sheetActions && touch.active && "bg-accent/60"
      )}
      onPointerEnter={sheetActions ? undefined : engage}
    >
      {holdable ? (
        <ActionsSentinel onClick={() => useThreadUi.setState({ activeMessageId: last.id })} />
      ) : !sheetActions && !engaged && !selecting ? (
        <ActionsSentinel onFocus={engage} />
      ) : null}
      {!sheetActions && own && engaged ? <MessageActions message={last} own visible={false} /> : null}
      <div
        className={cn(
          "flex w-[min(20rem,82%)] flex-col",
          own ? "items-end" : "items-start"
        )}
        onClickCapture={holdable ? swallowClickAfterHold(touch.didFire) : undefined}
        {...(holdable ? touch.handlers : {})}
      >
        {renderOrigin ? <div className="mb-0.5 px-1">{renderOrigin(first)}</div> : null}
        {own && row.startsGroup && first.senderName ? (
          <span className="mb-0.5 px-1 text-xs font-medium text-muted-foreground">
            {first.senderName}
          </span>
        ) : null}
        <div className={cn("w-full rounded-2xl p-1", own ? "bg-accent" : "bg-muted")}>
          <MediaGrid messages={row.messages} threadKey={threadKey} selecting={selecting} />
          <div className="flex justify-end px-1 pt-1">
            <MessageMeta message={last} own={own} floating={false} />
          </div>
        </div>
        {row.notice ? <SendNotice text={row.notice} /> : null}
      </div>
      {!sheetActions && !own && engaged ? (
        <MessageActions message={last} own={false} visible={false} />
      ) : null}
    </FreshEntry>
  )
})

const NOTE_ICONS: Record<string, typeof Bot> = {
  "assigned-user-notation": UserPlus,
  "automation-toggle-notation": Bot,
  "automation-stopped": AlertTriangle,
  error: AlertTriangle,
}

/** Nota do histórico: quem assumiu, automação. Discreta, é contexto e não conversa. */
const NoteRow = memo(function NoteRow({ message }: { message: ChatMessage }) {
  const Icon = NOTE_ICONS[message.roleBaseType ?? ""] ?? ArrowRightLeft
  const warning = message.roleBaseType === "error" || message.roleBaseType === "automation-stopped"

  return (
    <div className="flex justify-center px-4 pt-3" data-message-id={message.id}>
      <p
        className={cn(
          "flex max-w-md items-center gap-1.5 text-center text-xs",
          warning ? "text-status-warning" : "text-muted-foreground"
        )}
      >
        <Icon aria-hidden className="size-3.5 shrink-0" />
        <span>{message.content}</span>
      </p>
    </div>
  )
})

const WaitingRow = memo(function WaitingRow({ message }: { message: ChatMessage }) {
  return (
    <div className="flex justify-start px-3 pt-3 md:px-5" data-message-id={message.id}>
      <div className="rounded-2xl bg-muted px-3 py-2">
        <WaitingText />
      </div>
    </div>
  )
})

/** A mensagem que a pessoa acabou de enviar, antes do servidor responder. */
const OutgoingRow = memo(function OutgoingRow({ outgoing }: { outgoing: OutgoingMessage }) {
  const { t } = useTranslation()
  const { retry, threadKey } = useThreadContext()
  const failed = outgoing.status === "failed"

  return (
    <div className="flex justify-end px-3 pt-3 md:px-5">
      <div className="flex max-w-[min(36rem,82%)] flex-col items-end">
        <div
          className={cn(
            "min-w-0 rounded-2xl bg-accent px-3 py-1.5 text-sm leading-5 break-words whitespace-pre-wrap",
            failed && "ring-1 ring-status-danger/40"
          )}
        >
          <MessageText text={outgoing.text} />
          <span className="float-right mt-1.5 ml-3 inline-flex items-center text-muted-foreground">
            <StatusIcon
              status={failed ? "failed" : "pending"}
              label={t(`chat.message.status.${failed ? "failed" : "pending"}`)}
            />
          </span>
        </div>
        {failed ? (
          <div className="mt-1 flex flex-wrap items-center justify-end gap-x-2 px-1 text-xs text-status-danger">
            <span>{t(`chat.message.outgoing.${outgoing.failure ?? "timeout"}`)}</span>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="h-5 px-1.5 text-status-danger hover:text-status-danger"
              onClick={() =>
                retry({
                  id: outgoing.localId,
                  chatId: threadKey,
                  content: outgoing.payload,
                  replyToMessageId: outgoing.replyToMessageId,
                } as ChatMessage)
              }
            >
              <RefreshCw />
              {t("chat.message.retry")}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
})

/** Uma linha da lista virtual, com o separador de data quando é a primeira do dia. */
export const MessageRow = memo(function MessageRow({ row }: { row: ThreadRow }) {
  return (
    <>
      {row.day !== null ? <DaySeparator day={row.day} /> : null}
      {row.kind === "message" ? <MessageBubble row={row} /> : null}
      {row.kind === "media-group" ? <MediaGroupRow row={row} /> : null}
      {row.kind === "note" ? <NoteRow message={row.message} /> : null}
      {row.kind === "waiting" ? <WaitingRow message={row.message} /> : null}
      {row.kind === "ad-greeting" ? <AdGreeting message={row.message} /> : null}
      {row.kind === "widget-context" ? <WidgetContext message={row.message} /> : null}
      {row.kind === "outgoing" ? <OutgoingRow outgoing={row.outgoing} /> : null}
    </>
  )
})
