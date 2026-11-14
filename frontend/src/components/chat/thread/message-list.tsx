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
  type UIEvent,
} from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useTranslation } from "react-i18next"
import { ArrowDown, Loader2 } from "lucide-react"
import { Virtuoso, type Components, type VirtuosoHandle } from "react-virtuoso"

import { ErrorState, InlineError } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useDayLabel } from "@/hooks/chat/use-day-label"
import { useMotionPreset } from "@/lib/motion"
import { useThreadUi } from "@/lib/chat/stores"
import {
  getThreadMessages,
  loadOlder,
  useThreadStore,
  type ContactPresence,
} from "@/lib/chat/thread-store"
import {
  buildThreadRows,
  firstMessageIdOf,
  rowsPrepended,
  type ThreadRow,
} from "@/lib/chat/thread-rows"
import type { ChatMessage } from "@/lib/chat/types"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { DAY_PILL } from "./day-pill"
import { ConversationArt } from "./conversation-art"
import { MessageRow } from "./message-row"
import { PresenceIndicator } from "./presence-indicator"
import { createFreshTracker, FreshContext, NEVER_FRESH, useThreadContext } from "./thread-context"
import { MessagesSkeleton } from "./thread-skeleton"

/**
 * O Virtuoso exige que o índice do primeiro item diminua quando itens entram no topo: é o que mantém
 * a posição na tela ao carregar mensagens antigas. Começa alto para ter como descer.
 */
const FIRST_INDEX_START = 1_000_000

const FLASH_MS = 1_400

/** Quantas páginas buscar atrás de uma mensagem citada, antes de desistir. */
const MAX_PAGES_FOR_QUOTE = 20

/** Até aqui do fim, ainda conta como estar no fim. */
const AT_BOTTOM_THRESHOLD = 80

/** A essa distância do topo, em linhas, as mais antigas já começam a descer. */
const PRELOAD_ROWS = 20

/** Até aqui, em linhas, ir até a mensagem citada é rolar; mais longe, é pular. */
const NEAR_ROWS = 30

const GO_TO_ATTEMPTS = 4
const GO_TO_RETRY_MS = 200

/**
 * Nada desenhado acima da tela. As linhas novas no topo entram com um tamanho estimado, e só se
 * corrigem ao serem medidas: medidas fora da tela, sem rolagem para cima em curso, o conteúdo
 * saltaria. Desenhadas ao entrar na tela, a própria lista compensa.
 */
const VIEWPORT_MARGIN = { top: 0, bottom: 200 }

const NO_MESSAGES: ChatMessage[] = []
const NO_OUTBOX: never[] = []

type ListContext = {
  loadingOlder: boolean
  olderError: unknown
  hasMore: boolean
  onRetryOlder: () => void
  presence: ContactPresence
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

/**
 * O fim da conversa, onde o contato "escreve": a bolha de digitando nasce do lado dele, como a
 * mensagem que vai chegar. Crescer aqui mantém o fim à vista (`stayAtBottom`).
 */
function BottomEdge({ context }: { context?: ListContext }) {
  const preset = useMotionPreset()
  const presence = context?.presence ?? null

  return (
    <div className="flex min-h-4 items-start px-3 pt-1.5 pb-2.5 md:px-5" role="status">
      <AnimatePresence initial={false}>
        {presence ? (
          <motion.span
            key="presence"
            initial={preset.reduced ? { opacity: 0 } : { opacity: 0, x: -8, scale: 0.96 }}
            animate={preset.reduced ? { opacity: 1 } : { opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={preset.spring}
            style={{ transformOrigin: "0% 100%" }}
            className="inline-flex h-8 items-center rounded-2xl rounded-bl-md bg-card px-3 text-xs text-muted-foreground shadow-xs ring-1 ring-border/60"
          >
            <PresenceIndicator presence={presence} />
          </motion.span>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

// Fora do componente: um objeto novo a cada render remontaria a lista inteira.
const LIST_COMPONENTS: Components<ThreadRow, ListContext> = {
  Header: OlderEdge,
  Footer: BottomEdge,
}

/**
 * No celular a área do histórico muda de altura o tempo todo: o teclado, o composer crescendo, a
 * resposta citada. A referência é a borda de baixo: o que estava colado no composer continua colado,
 * e o que some é o de cima. A conta roda antes de pintar, então nada salta na tela.
 */
function useBottomAnchor(scroller: HTMLElement | null) {
  useEffect(() => {
    if (!scroller) return

    let height = scroller.clientHeight
    const observer = new ResizeObserver(() => {
      const next = scroller.clientHeight
      if (next !== height) scroller.scrollTop += height - next
      height = next
    })
    observer.observe(scroller)
    return () => observer.disconnect()
  }, [scroller])
}

/**
 * A data do que está no alto, presa no topo enquanto rola: situa quem desce por um histórico longo.
 * É a mesma pílula do separador, para ler como "o separador que ficou preso".
 */
const FloatingDay = memo(function FloatingDay({ day }: { day: number }) {
  const label = useDayLabel(day)
  return <span className={DAY_PILL}>{label}</span>
})

/** Quanto a data presa fica depois que a rolagem para: some sem piscar entre um gesto e outro. */
const DAY_LINGER_MS = 1_200

function dayOfRow(row: ThreadRow | undefined): number | null {
  if (!row || row.kind === "outgoing") return null
  const date = new Date(row.messages[0].createdAt)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

export type MessageListHandle = {
  scrollToBottom: () => void
  scrollToMessage: (id: string) => Promise<void>
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
  const { sheetActions } = useThreadContext()
  const [scroller, setScroller] = useState<HTMLElement | null>(null)
  const captureScroller = useCallback(
    (node: HTMLElement | Window | null) => setScroller(node instanceof HTMLElement ? node : null),
    []
  )
  useBottomAnchor(scroller)

  const status = useThreadStore((state) => state.threads[threadKey]?.status ?? "loading")
  const error = useThreadStore((state) => state.threads[threadKey]?.error)
  const messages = useThreadStore((state) => state.threads[threadKey]?.messages ?? NO_MESSAGES)
  const outbox = useThreadStore((state) => state.threads[threadKey]?.outbox ?? NO_OUTBOX)
  const hasMore = useThreadStore((state) => state.threads[threadKey]?.hasMore ?? false)
  const loadingOlder = useThreadStore((state) => state.threads[threadKey]?.loadingOlder ?? false)
  const olderError = useThreadStore((state) => state.threads[threadKey]?.olderError ?? null)
  const presence = useThreadStore((state) => state.threads[threadKey]?.presence ?? null)

  // O que já estava aqui ao abrir não anima: só o que chegar depois. Nasce com as primeiras linhas,
  // seja do store (reabrir é instantâneo) ou da primeira página.
  const [fresh, setFresh] = useState(NEVER_FRESH)
  if (fresh === NEVER_FRESH && messages.length > 0) {
    setFresh(createFreshTracker(messages.map((message) => message.id)))
  }
  if (fresh === NEVER_FRESH && status !== "loading" && messages.length === 0) {
    setFresh(createFreshTracker([]))
  }

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

  // `followOutput` só cuida de item novo. Quem está no fim também precisa continuar lá quando uma
  // linha cresce: a foto que terminou de carregar, o motivo de uma falha, a reação que entrou. Quem
  // decide é a última rolagem, e não `atBottom`, que chega atrasado: com ele, quem pula para o topo
  // seria puxado de volta pelas linhas que se medem ao aparecer.
  const pinned = useRef(true)
  const onScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget
    pinned.current =
      element.scrollHeight - element.clientHeight - element.scrollTop <= AT_BOTTOM_THRESHOLD
  }, [])
  const lastHeight = useRef(0)
  const stayAtBottom = useCallback((height: number) => {
    const grew = height > lastHeight.current
    lastHeight.current = height
    if (grew && pinned.current) {
      virtuoso.current?.scrollToIndex({ index: "LAST", align: "end", behavior: "auto" })
    }
  }, [])

  // Quantas chegaram desde que a pessoa saiu do fim da conversa. A conta é pela data, e não por
  // quantas entraram: as antigas que descem ao subir não são novidade.
  const [missed, setMissed] = useState(0)
  const seenUntil = useRef(0)
  useEffect(() => {
    if (atBottom) {
      seenUntil.current = messages.at(-1)?.createdAt ?? 0
      setMissed(0)
    } else {
      // Só conversa conta como novidade: nota do histórico (quem assumiu, automação) não chama ninguém.
      setMissed(
        messages.filter(
          (message) =>
            message.createdAt > seenUntil.current &&
            (message.role === "user" || message.role === "assistant") &&
            !message.hasSpan
        ).length
      )
    }
  }, [atBottom, messages])

  const scrollToBottom = useCallback(() => {
    virtuoso.current?.scrollToIndex({
      index: "LAST",
      align: "end",
      behavior: reduced ? "auto" : "smooth",
    })
  }, [reduced])

  const visibleStart = useRef(0)
  const scrollToMessage = useCallback(
    async (id: string) => {
      // Daqui em diante a pessoa quer ver outra coisa: o fim da conversa não a puxa de volta.
      pinned.current = false

      // A citada pode estar antes do que já foi carregado: busca até achar, sem subir sem limite.
      const loaded = () => getThreadMessages(threadKey).some((message) => message.id === id)
      for (let page = 0; page < MAX_PAGES_FOR_QUOTE && !loaded(); page += 1) {
        if (!useThreadStore.getState().threads[threadKey]?.hasMore) break
        await loadOlder(threadKey)
      }
      const indexOfRow = () =>
        rowsRef.current.findIndex(
          (row) => row.kind !== "outgoing" && row.messages.some((message) => message.id === id)
        )

      // Longe, rolar suave passaria por linhas que ainda não têm tamanho, e erraria o destino.
      const near = Math.abs(indexOfRow() - visibleStart.current) <= NEAR_ROWS

      // Logo depois de entrarem linhas no topo, a lista ainda está se acertando e pode ignorar o
      // pedido: confere se a mensagem apareceu, e pede de novo.
      const goTo = (attemptsLeft: number) => {
        const index = indexOfRow()
        if (index < 0) return
        virtuoso.current?.scrollToIndex({
          index,
          align: "center",
          behavior: near && !reduced ? "smooth" : "auto",
        })
        if (near || attemptsLeft === 0) return
        window.setTimeout(() => {
          const shown = document.querySelector(`[data-message-id="${CSS.escape(id)}"]`)
          if (!shown) goTo(attemptsLeft - 1)
        }, GO_TO_RETRY_MS)
      }
      goTo(GO_TO_ATTEMPTS)

      useThreadUi.setState({ flashId: id })
      window.setTimeout(() => {
        if (useThreadUi.getState().flashId === id) useThreadUi.setState({ flashId: null })
      }, FLASH_MS)
    },
    [reduced, threadKey]
  )

  useImperativeHandle(ref, () => ({ scrollToBottom, scrollToMessage }), [
    scrollToBottom,
    scrollToMessage,
  ])

  const anchorRef = useRef(anchor.index)
  useLayoutEffect(() => {
    anchorRef.current = anchor.index
  })

  // A data flutuante só aparece enquanto rola, e só muda quando muda o dia. As antigas descem antes
  // de chegar ao topo; depois de uma falha, só pelo botão, para não insistir sozinho.
  const [floatingDay, setFloatingDay] = useState<number | null>(null)
  const [showDay, setShowDay] = useState(false)
  const [dayInline, setDayInline] = useState(false)
  const dayTimer = useRef<number | undefined>(undefined)
  const onScrolling = useCallback((scrolling: boolean) => {
    window.clearTimeout(dayTimer.current)
    if (scrolling) setShowDay(true)
    else dayTimer.current = window.setTimeout(() => setShowDay(false), DAY_LINGER_MS)
  }, [])
  useEffect(() => () => window.clearTimeout(dayTimer.current), [])
  const onRange = useCallback(
    ({ startIndex }: { startIndex: number }) => {
      const index = startIndex - anchorRef.current
      visibleStart.current = index
      const row = rowsRef.current[index]
      const day = dayOfRow(row)
      if (day !== null) setFloatingDay((current) => (current === day ? current : day))
      // O separador do dia já está no alto da tela: a data presa seria a mesma pílula duas vezes.
      setDayInline(Boolean(row && row.day !== null))

      const thread = useThreadStore.getState().threads[threadKey]
      if (index < PRELOAD_ROWS && thread?.hasMore && !thread.loadingOlder && !thread.olderError) {
        void loadOlder(threadKey)
      }
    },
    [threadKey]
  )

  const retryOlder = useCallback(() => {
    void loadOlder(threadKey)
  }, [threadKey])

  const context = useMemo<ListContext>(
    () => ({
      loadingOlder,
      olderError,
      hasMore,
      onRetryOlder: retryOlder,
      presence,
    }),
    [hasMore, loadingOlder, olderError, presence, retryOlder]
  )

  // No toque, as ações de uma bolha ficam à mostra até tocar em outro lugar.
  const activeMessageId = useThreadUi((state) => state.activeMessageId)
  useEffect(() => {
    if (!activeMessageId || sheetActions) return
    const dismiss = () => useThreadUi.setState({ activeMessageId: null })
    const timer = window.setTimeout(() => document.addEventListener("pointerdown", dismiss), 0)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener("pointerdown", dismiss)
    }
  }, [activeMessageId, sheetActions])

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
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <ConversationArt />
        <div className="space-y-1">
          <p className="font-heading text-base font-semibold tracking-tight">{t("chat.thread.empty")}</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            {t("chat.thread.emptyHint")}
          </p>
        </div>
      </div>
    )
  }

  return (
    <FreshContext.Provider value={fresh}>
      <div className="relative h-full min-h-0">
        <Virtuoso<ThreadRow, ListContext>
          key={threadKey}
          ref={virtuoso}
          scrollerRef={sheetActions ? captureScroller : undefined}
          onScroll={onScroll}
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
          followOutput={(isAtBottom) => (isAtBottom ? "auto" : false)}
          atBottomStateChange={setAtBottom}
          totalListHeightChanged={stayAtBottom}
          atBottomThreshold={AT_BOTTOM_THRESHOLD}
          increaseViewportBy={VIEWPORT_MARGIN}
          rangeChanged={onRange}
          isScrolling={onScrolling}
        />

        <AnimatePresence>
          {showDay && !dayInline && floatingDay !== null ? (
            <motion.div
              key="day"
              {...preset.fade}
              className="pointer-events-none absolute inset-x-0 top-2 flex justify-center"
            >
              <FloatingDay day={floatingDay} />
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* Quem está lendo mais acima não é puxado para baixo: a novidade vira um convite para descer,
            no meio, onde o olho já está. Sem novidade, só a seta discreta no canto. */}
        <AnimatePresence initial={false}>
          {!atBottom && missed > 0 ? (
            <motion.div
              key="new"
              {...preset.slideUp}
              className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center"
            >
              <Button
                type="button"
                variant="outline"
                className="pointer-events-auto h-9 gap-1.5 rounded-full bg-card pr-3 pl-2.5 text-xs font-medium shadow-md ring-1 ring-border/60 pointer-coarse:h-10"
                aria-label={t("chat.thread.scrollDownWithNew", { count: missed })}
                onClick={scrollToBottom}
              >
                <span aria-hidden className="size-1.5 rounded-full bg-primary" />
                {t("chat.thread.newMessages", {
                  count: missed,
                  formatted: missed > 99 ? "99+" : formatNumber(missed, language),
                })}
                <ArrowDown aria-hidden className="size-3.5 text-muted-foreground" />
              </Button>
            </motion.div>
          ) : null}
          {!atBottom && missed === 0 ? (
            <motion.div
              key="down"
              {...preset.slideUp}
              className="absolute right-4 bottom-3 md:right-6"
            >
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-9 rounded-full bg-card shadow-md ring-1 ring-border/60 pointer-coarse:size-10"
                aria-label={t("chat.thread.scrollDown")}
                onClick={scrollToBottom}
              >
                <ArrowDown />
              </Button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </FreshContext.Provider>
  )
})
