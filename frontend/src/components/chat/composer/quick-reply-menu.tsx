import {
  memo,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type Ref,
} from "react"
import { useTranslation } from "react-i18next"
import { Paperclip } from "lucide-react"

import { FileTypeIcon, InlineError } from "@/components/shared"
import { Skeleton } from "@/components/ui/skeleton"
import { Kbd } from "@/components/ui/kbd"
import { useAttachmentLibrary, useQuickReplies } from "@/hooks/chat/use-chat-refs"
import { mediaSource } from "@/lib/chat/media"
import {
  countAttachments,
  splitReplyContent,
  stripReferencesForPreview,
} from "@/lib/chat/quick-reply-content"
import type { QuickReply } from "@/lib/chat/types"
import { matchesSearch } from "@/lib/search-text"
import { useIsTouch } from "@/hooks/use-media-query"
import { cn } from "@/lib/utils"

const MAX_ITEMS = 8

export type QuickReplyMenuHandle = {
  /** O composer passa as teclas para cá. `true` quer dizer que o menu cuidou. */
  handleKey: (event: KeyboardEvent<HTMLTextAreaElement>) => boolean
}

/** As mensagens em bolhas, como vão sair: anexo separado, parágrafo separado. */
function ReplyPreview({ reply }: { reply: QuickReply }) {
  const { t } = useTranslation()
  const { byId } = useAttachmentLibrary()
  const pieces = useMemo(() => splitReplyContent(reply.content, byId), [byId, reply.content])

  return (
    <div className="flex flex-col gap-1.5 p-3">
      <p className="text-xs font-medium text-muted-foreground">{t("chat.quickReplies.preview")}</p>
      {pieces.map((piece, index) =>
        piece.kind === "text" ? (
          <p
            key={index}
            className="max-w-full self-end rounded-2xl bg-accent px-3 py-1.5 text-sm leading-5 break-words whitespace-pre-wrap"
          >
            {piece.text}
          </p>
        ) : piece.attachment?.file?.contentType.startsWith("image/") ? (
          <img
            key={index}
            src={mediaSource(piece.attachment.file.url) ?? undefined}
            alt={piece.attachment.name}
            loading="lazy"
            className="max-h-36 self-end rounded-xl object-cover"
          />
        ) : (
          <span
            key={index}
            className="flex items-center gap-2 self-end rounded-xl bg-accent px-3 py-2 text-sm"
          >
            <FileTypeIcon
              mediaType={piece.attachment?.file?.contentType}
              fileName={piece.attachment?.file?.filename}
              className="size-4 shrink-0 text-muted-foreground"
            />
            <span className="truncate">
              {piece.attachment?.name ?? t("chat.quickReplies.missingAttachment")}
            </span>
          </span>
        )
      )}
    </div>
  )
}

/**
 * Mensagens rápidas, abertas com `/` no composer. O foco fica na caixa de texto: as setas chegam
 * por `handleKey`, e o destaque mora aqui, para andar pela lista sem desenhar o composer.
 */
export const QuickReplyMenu = memo(function QuickReplyMenu({
  query,
  onPick,
  ref,
}: {
  query: string
  onPick: (reply: QuickReply) => void
  ref?: Ref<QuickReplyMenuHandle>
}) {
  const { t } = useTranslation()
  const isTouch = useIsTouch()
  const { quickReplies, isLoading, error, mutate } = useQuickReplies()

  const items = useMemo(
    () =>
      quickReplies
        .filter((reply) => !query || matchesSearch(`${reply.trigger} ${reply.name}`, query))
        .slice(0, MAX_ITEMS),
    [query, quickReplies]
  )

  const [highlight, setHighlight] = useState(0)
  const [lastQuery, setLastQuery] = useState(query)
  if (query !== lastQuery) {
    setLastQuery(query)
    setHighlight(0)
  }

  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${highlight}"]`)
      ?.scrollIntoView({ block: "nearest" })
  }, [highlight])

  useImperativeHandle(
    ref,
    () => ({
      handleKey: (event) => {
        if (items.length === 0) return false

        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault()
          const step = event.key === "ArrowDown" ? 1 : -1
          setHighlight((current) => (current + step + items.length) % items.length)
          return true
        }
        if ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab") {
          event.preventDefault()
          onPick(items[Math.min(highlight, items.length - 1)])
          return true
        }
        return false
      },
    }),
    [highlight, items, onPick]
  )

  const active = items[Math.min(highlight, items.length - 1)]

  return (
    <div
      role="listbox"
      aria-label={t("chat.quickReplies.title")}
      className="absolute inset-x-0 bottom-full z-20 mb-2 flex max-h-[min(24rem,60dvh)] overflow-hidden rounded-xl border bg-popover shadow-md"
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-1">
          {isLoading ? (
            <div className="flex flex-col gap-2 p-2" aria-hidden>
              <Skeleton className="h-9" />
              <Skeleton className="h-9" />
              <Skeleton className="h-9" />
            </div>
          ) : error ? (
            <InlineError onRetry={() => void mutate()} />
          ) : items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              {quickReplies.length === 0 ? t("chat.quickReplies.empty") : t("chat.quickReplies.noMatch")}
            </p>
          ) : (
            items.map((reply, index) => {
              const attachments = countAttachments(reply.content)
              return (
                <button
                  key={reply.id}
                  type="button"
                  role="option"
                  aria-selected={index === highlight}
                  data-index={index}
                  // Não tira o foco da caixa de texto: o cursor precisa continuar lá.
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => onPick(reply)}
                  className={cn(
                    "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left outline-none",
                    index === highlight && "bg-accent"
                  )}
                >
                  <span className="mt-0.5 max-w-24 shrink-0 truncate rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                    /{reply.trigger}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{reply.name}</span>
                    <span className="line-clamp-1 text-xs text-muted-foreground">
                      {stripReferencesForPreview(reply.content)}
                    </span>
                  </span>
                  {attachments > 0 ? (
                    <span
                      className="mt-1 flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground"
                      aria-label={t("chat.quickReplies.attachments", { count: attachments })}
                    >
                      <Paperclip aria-hidden className="size-3" />
                      {attachments}
                    </span>
                  ) : null}
                </button>
              )
            })
          )}
        </div>
        {!isTouch ? (
          <p className="flex shrink-0 items-center gap-3 border-t px-3 py-1.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
              {t("chat.quickReplies.hintNavigate")}
            </span>
            <span className="flex items-center gap-1">
              <Kbd>↵</Kbd>
              {t("chat.quickReplies.hintInsert")}
            </span>
            <span className="flex items-center gap-1">
              <Kbd>Esc</Kbd>
              {t("chat.quickReplies.hintClose")}
            </span>
          </p>
        ) : null}
      </div>

      {active ? (
        <div className="hidden w-64 shrink-0 overflow-y-auto border-l lg:block">
          <ReplyPreview reply={active} />
        </div>
      ) : null}
    </div>
  )
})
