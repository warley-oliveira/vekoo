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
import { useSWRConfig } from "swr"

import { QuickReplyPreview } from "@/components/content/quick-reply-preview"
import { InlineError } from "@/components/shared"
import { Skeleton } from "@/components/ui/skeleton"
import { Kbd } from "@/components/ui/kbd"
import { ATTACHMENT_LIBRARY_KEY, useAttachmentLibrary } from "@/hooks/content/use-attachments"
import { QUICK_REPLIES_KEY, useQuickReplies } from "@/hooks/content/use-quick-replies"
import { useIsTouch } from "@/hooks/use-media-query"
import { meaningfulContent } from "@/lib/chat/message-rules"
import {
  citedAttachmentIds,
  fillQuickReply,
  type QuickReplyContext,
} from "@/lib/content/quick-reply-content"
import type { QuickReply } from "@/lib/content/types"
import { matchesSearch } from "@/lib/search-text"
import { cn } from "@/lib/utils"

/** A lista rola: o limite só poupa desenho numa organização com centenas de mensagens. */
const MAX_ITEMS = 50

const NO_REPLIES: QuickReply[] = []

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
  ref,
}: {
  query: string
  context: QuickReplyContext
  onPick: (reply: QuickReply) => void
  ref?: Ref<QuickReplyMenuHandle>
}) {
  const { t } = useTranslation()
  const isTouch = useIsTouch()
  const { quickReplies = NO_REPLIES, isLoading, error, reload } = useQuickReplies()

  // Abriu: mostra o que já tem, e confere por trás se alguém mudou alguma coisa.
  const { mutate } = useSWRConfig()
  useEffect(() => {
    void mutate(QUICK_REPLIES_KEY)
    void mutate(ATTACHMENT_LIBRARY_KEY)
  }, [mutate])

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
            <InlineError onRetry={() => void reload()} />
          ) : items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              {quickReplies.length === 0 ? t("chat.quickReplies.empty") : t("chat.quickReplies.noMatch")}
            </p>
          ) : (
            items.map((reply, index) => {
              const attachments = citedAttachmentIds(reply.content).length
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
        <div className="hidden w-72 shrink-0 overflow-y-auto border-l lg:block">
          <ReplyPreview reply={active} context={context} />
        </div>
      ) : null}
    </div>
  )
})
