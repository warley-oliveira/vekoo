import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Ref,
} from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useTranslation } from "react-i18next"
import { ArrowDown, Loader2, MessageCircleDashed } from "lucide-react"
import { Virtuoso, type Components, type VirtuosoHandle } from "react-virtuoso"

import { ErrorState, InlineError } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useMotionPreset } from "@/lib/motion"
import { useThreadUi } from "@/lib/chat/stores"
import { loadOlder, useThreadStore } from "@/lib/chat/thread-store"
import {
  buildThreadRows,
  firstMessageIdOf,
  rowsPrepended,
  type ThreadRow,
} from "@/lib/chat/thread-rows"
import type { ChatMessage } from "@/lib/chat/types"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { MessageRow } from "./message-row"
import { MessagesSkeleton } from "./thread-skeleton"
import { useDayLabel } from "./message-parts"

/**
 * O Virtuoso exige que o índice do primeiro item diminua quando itens entram no topo: é o que mantém
 * a posição na tela ao carregar mensagens antigas. Começa alto para ter como descer.
 */
const FIRST_INDEX_START = 1_000_000

const FLASH_MS = 1_400

const NO_MESSAGES: ChatMessage[] = []
const NO_OUTBOX: never[] = []

type ListContext = {
  loadingOlder: boolean
  olderError: unknown
  hasMore: boolean
  onRetryOlder: () => void
  typing: boolean
}

function OlderEdge({ context }: { context?: ListContext }) {
  const { t } = useTranslation()
  if (!context) return null

  return (
    <div className="flex min-h-10 justify-center py-3">
      {context.olderError ? (
        <InlineError onRetry={context.onRetryOlder} />
      ) : context.loadingOlder ? (
        <span role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 aria-hidden className="size-3.5 animate-spin" />
          {t("chat.thread.loadingOlder")}
        </span>
      ) : context.hasMore ? (
        // A rolagem carrega sozinha; o botão é o caminho de quem navega por teclado.
        <Button type="button" variant="ghost" size="sm" onClick={context.onRetryOlder}>
          {t("chat.thread.loadOlder")}
        </Button>
      ) : null}
    </div>
  )
}

function BottomEdge({ context }: { context?: ListContext }) {
  const { t } = useTranslation()

  return (
    <div className="px-3 pt-1 pb-3 md:px-5">
      {context?.typing ? (
        <span role="status" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="flex gap-0.5" aria-hidden>
            <span className="size-1 animate-pulse rounded-full bg-muted-foreground" />
            <span className="size-1 animate-pulse rounded-full bg-muted-foreground [animation-delay:150ms]" />
            <span className="size-1 animate-pulse rounded-full bg-muted-foreground [animation-delay:300ms]" />
          </span>
          {t("chat.thread.typing")}
        </span>
      ) : null}
    </div>
  )
}

// Fora do componente: um objeto novo a cada render remontaria a lista inteira.
const LIST_COMPONENTS: Components<ThreadRow, ListContext> = {
  Header: OlderEdge,
  Footer: BottomEdge,
}

/** A data do que está no alto, enquanto rola: situa quem desce por um histórico longo. */
const FloatingDay = memo(function FloatingDay({ day }: { day: number }) {
  const label = useDayLabel(day)
  return (
    <span className="rounded-full border bg-background px-2.5 py-0.5 text-xs font-medium text-muted-foreground shadow-xs">
      {label}
    </span>
  )
})

function dayOfRow(row: ThreadRow | undefined): number | null {
  if (!row || row.kind === "outgoing") return null
  const date = new Date(row.messages[0].createdAt)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

export type MessageListHandle = {
  scrollToBottom: () => void
  scrollToMessage: (id: string) => void
}

/**
 * O histórico, numa lista virtual ao contrário: começa no fim, as antigas entram no topo sem a tela
 * pular, e o que chega só rola quem já estava no fim. Quem rolou para cima vê o botão de descer, com
 * quantas mensagens chegaram. Um por conversa: trocar de conversa remonta a lista, e começa no fim.
 */
export const MessageList = memo(function MessageList({
  threadKey,
  onRetry,
  ref,
}: {
  threadKey: string
  onRetry: () => void
  ref?: Ref<MessageListHandle>
}) {
  const { t } = useTranslation()
  const language = useLanguage()
  const reduced = useReducedMotion()
  const preset = useMotionPreset()

  const status = useThreadStore((state) => state.threads[threadKey]?.status ?? "loading")
  const error = useThreadStore((state) => state.threads[threadKey]?.error)
  const messages = useThreadStore((state) => state.threads[threadKey]?.messages ?? NO_MESSAGES)
  const outbox = useThreadStore((state) => state.threads[threadKey]?.outbox ?? NO_OUTBOX)
  const hasMore = useThreadStore((state) => state.threads[threadKey]?.hasMore ?? false)
  const loadingOlder = useThreadStore((state) => state.threads[threadKey]?.loadingOlder ?? false)
  const olderError = useThreadStore((state) => state.threads[threadKey]?.olderError ?? null)
  const typing = useThreadStore((state) => state.threads[threadKey]?.typing ?? false)

  const previousRows = useRef<ThreadRow[]>([])
  const rows = useMemo(
    () => buildThreadRows(messages, outbox, previousRows.current),
    [messages, outbox]
  )
  useLayoutEffect(() => {
    previousRows.current = rows
  }, [rows])

  // Itens novos no topo baixam o índice na mesma quantidade.
  const firstId = firstMessageIdOf(rows)
  const [anchor, setAnchor] = useState({ firstId, index: FIRST_INDEX_START })
  if (firstId !== anchor.firstId) {
    const moved = rowsPrepended(rows, anchor.firstId)
    setAnchor({ firstId, index: anchor.index - moved })
  }

  const virtuoso = useRef<VirtuosoHandle>(null)
  const [atBottom, setAtBottom] = useState(true)
  const rowsRef = useRef(rows)
  useLayoutEffect(() => {
    rowsRef.current = rows
  })

  // Quantas chegaram desde que a pessoa saiu do fim da conversa.
  const [missed, setMissed] = useState(0)
  const seenCount = useRef(messages.length)
  useEffect(() => {
    const added = messages.length - seenCount.current
    seenCount.current = messages.length
    if (atBottom) setMissed(0)
    else if (added > 0 && !loadingOlder) setMissed((count) => count + added)
  }, [atBottom, loadingOlder, messages.length])

  const scrollToBottom = useCallback(() => {
    setMissed(0)
    virtuoso.current?.scrollToIndex({
      index: "LAST",
      align: "end",
      behavior: reduced ? "auto" : "smooth",
    })
  }, [reduced])

  const scrollToMessage = useCallback((id: string) => {
    const index = rowsRef.current.findIndex(
      (row) => row.kind !== "outgoing" && row.messages.some((message) => message.id === id)
    )
    if (index < 0) return

    virtuoso.current?.scrollToIndex({ index, align: "center", behavior: "smooth" })
    useThreadUi.setState({ flashId: id })
    window.setTimeout(() => {
      if (useThreadUi.getState().flashId === id) useThreadUi.setState({ flashId: null })
    }, FLASH_MS)
  }, [])

  useImperativeHandle(ref, () => ({ scrollToBottom, scrollToMessage }), [
    scrollToBottom,
    scrollToMessage,
  ])

  // A data flutuante: só aparece enquanto rola, e só muda quando muda o dia.
  const [floatingDay, setFloatingDay] = useState<number | null>(null)
  const [scrolling, setScrolling] = useState(false)
  const onRange = useCallback(
    ({ startIndex }: { startIndex: number }) => {
      const day = dayOfRow(rowsRef.current[startIndex - anchorRef.current])
      if (day !== null) setFloatingDay((current) => (current === day ? current : day))
    },
    []
  )
  const anchorRef = useRef(anchor.index)
  useLayoutEffect(() => {
    anchorRef.current = anchor.index
  })

  const loadOlderIfAny = useCallback(() => {
    void loadOlder(threadKey)
  }, [threadKey])

  const context = useMemo<ListContext>(
    () => ({
      loadingOlder,
      olderError,
      hasMore,
      onRetryOlder: loadOlderIfAny,
      typing,
    }),
    [hasMore, loadOlderIfAny, loadingOlder, olderError, typing]
  )

  // No toque, as ações de uma bolha ficam à mostra até tocar em outro lugar.
  const activeMessageId = useThreadUi((state) => state.activeMessageId)
  useEffect(() => {
    if (!activeMessageId) return
    const dismiss = () => useThreadUi.setState({ activeMessageId: null })
    const timer = window.setTimeout(() => document.addEventListener("pointerdown", dismiss), 0)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener("pointerdown", dismiss)
    }
  }, [activeMessageId])

  if (status === "loading" && rows.length === 0) return <MessagesSkeleton />

  if (status === "error" && rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <ErrorState error={error} onRetry={onRetry} className="border-0" />
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <MessageCircleDashed aria-hidden className="size-5 text-muted-foreground" />
        <p className="text-sm font-medium">{t("chat.thread.empty")}</p>
        <p className="max-w-xs text-sm text-muted-foreground">{t("chat.thread.emptyHint")}</p>
      </div>
    )
  }

  return (
    <div className="relative h-full min-h-0">
      <Virtuoso<ThreadRow, ListContext>
        key={threadKey}
        ref={virtuoso}
        aria-label={t("chat.thread.history")}
        className="outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
        style={{ height: "100%" }}
        data={rows}
        context={context}
        components={LIST_COMPONENTS}
        computeItemKey={(_, row) => row.key}
        itemContent={(_, row) => <MessageRow row={row} />}
        firstItemIndex={anchor.index}
        initialTopMostItemIndex={{ index: rows.length - 1, align: "end" }}
        alignToBottom
        followOutput={(isAtBottom) => (isAtBottom ? (reduced ? "auto" : "smooth") : false)}
        startReached={hasMore && !loadingOlder && !olderError ? loadOlderIfAny : undefined}
        atBottomStateChange={setAtBottom}
        atBottomThreshold={80}
        increaseViewportBy={{ top: 600, bottom: 200 }}
        rangeChanged={onRange}
        isScrolling={setScrolling}
      />

      <AnimatePresence>
        {scrolling && floatingDay !== null ? (
          <motion.div
            key="day"
            {...preset.fade}
            className="pointer-events-none absolute inset-x-0 top-2 flex justify-center"
          >
            <FloatingDay day={floatingDay} />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {!atBottom ? (
          <motion.div
            key="down"
            {...preset.slideUp}
            className="absolute right-4 bottom-3 md:right-6"
          >
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="relative size-9 rounded-full bg-background shadow-sm pointer-coarse:size-10"
              aria-label={
                missed > 0
                  ? t("chat.thread.scrollDownWithNew", { count: missed })
                  : t("chat.thread.scrollDown")
              }
              onClick={scrollToBottom}
            >
              <ArrowDown />
              {missed > 0 ? (
                <span className="absolute -top-1.5 -right-1 flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-primary px-1 text-[0.6875rem] font-semibold text-primary-foreground tabular-nums">
                  {missed > 99 ? "99+" : formatNumber(missed, language)}
                </span>
              ) : null}
            </Button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
})
