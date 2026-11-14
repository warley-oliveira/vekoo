import {
  memo,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent,
  type Ref,
} from "react"
import { useTranslation } from "react-i18next"
import { ChevronDown, Paperclip } from "lucide-react"

import { QuickReplyPreview } from "@/components/content/quick-reply-preview"
import { InlineError } from "@/components/shared"
import { Skeleton } from "@/components/ui/skeleton"
import { Kbd } from "@/components/ui/kbd"
import { useQuickReplyItems } from "@/hooks/chat/use-quick-reply-items"
import { useAttachmentLibrary } from "@/hooks/content/use-attachments"
import { useIsTouch } from "@/hooks/use-media-query"
import { meaningfulContent } from "@/lib/chat/message-rules"
import {
  citedAttachmentIds,
  fillQuickReply,
  type QuickReplyContext,
} from "@/lib/content/quick-reply-content"
import type { QuickReply } from "@/lib/content/types"
import { cn } from "@/lib/utils"

export type QuickReplyMenuHandle = {
  /** O composer passa as teclas para cá. `true` quer dizer que o menu cuidou. */
  handleKey: (event: KeyboardEvent<HTMLTextAreaElement>) => boolean
}

/** Como a mensagem sai, com os dados desta conversa: anexo separado, e o que falta em destaque. */
function ReplyPreview({ reply, context }: { reply: QuickReply; context: QuickReplyContext }) {
  const { t } = useTranslation()
  const { attachments } = useAttachmentLibrary()

  return (
    <div className="flex flex-col gap-1.5 p-3">
      <p className="text-xs font-medium text-muted-foreground">{t("chat.quickReplies.preview")}</p>
      <QuickReplyPreview
        content={reply.content}
        attachments={attachments}
        customFields={undefined}
        context={context}
      />
    </div>
  )
}

/**
 * Mensagens rápidas, abertas com `/` no composer. O foco fica na caixa de texto: as setas chegam
 * por `handleKey`, e o destaque mora aqui, para andar pela lista sem desenhar o composer.
 */
export const QuickReplyMenu = memo(function QuickReplyMenu({
  query,
  context,
  onPick,
  className,
  inlinePreview = false,
  ref,
}: {
  query: string
  context: QuickReplyContext
  onPick: (reply: QuickReply) => void
  className?: string
  /** Sem espaço para a coluna de prévia: abre embaixo da própria linha, ao tocar na seta. */
  inlinePreview?: boolean
  ref?: Ref<QuickReplyMenuHandle>
}) {
  const { t } = useTranslation()
  const isTouch = useIsTouch()
  const { items, total, isLoading, error, reload } = useQuickReplyItems(query)

  const [expandedId, setExpandedId] = useState<string | null>(null)
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
      className={cn(
        "absolute inset-x-0 bottom-full z-20 mb-2 flex max-h-[min(24rem,60dvh)] overflow-hidden rounded-xl border bg-popover shadow-md",
        className
      )}
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
            <InlineError onRetry={() => void reload()} />
          ) : items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              {total === 0 ? t("chat.quickReplies.empty") : t("chat.quickReplies.noMatch")}
            </p>
          ) : (
            items.map((reply, index) => {
              const attachments = citedAttachmentIds(reply.content).length
              const row = (
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
                      {meaningfulContent(fillQuickReply(reply.content, context))}
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

              if (!inlinePreview) return row

              const expanded = expandedId === reply.id
              return (
                <div key={reply.id} role="presentation">
                  <div role="presentation" className="flex items-center gap-0.5">
                    <div role="presentation" className="min-w-0 flex-1">
                      {row}
                    </div>
                    <button
                      type="button"
                      data-slot="preview-toggle"
                      aria-expanded={expanded}
                      aria-label={t("chat.quickReplies.preview")}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => setExpandedId(expanded ? null : reply.id)}
                      className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted"
                    >
                      <ChevronDown
                        aria-hidden
                        className={cn("size-4 transition-transform", expanded && "rotate-180")}
                      />
                    </button>
                  </div>
                  {expanded ? <ReplyPreview reply={reply} context={context} /> : null}
                </div>
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
              {/* i18n-exempt: nome da tecla */}
              <Kbd>Esc</Kbd>
              {t("chat.quickReplies.hintClose")}
            </span>
          </p>
        ) : null}
      </div>

      {active && !inlinePreview ? (
        <div className="hidden w-72 shrink-0 overflow-y-auto border-l lg:block">
          <ReplyPreview reply={active} context={context} />
        </div>
      ) : null}
    </div>
  )
})
