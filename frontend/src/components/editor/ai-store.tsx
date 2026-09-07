import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { activeCard, useEditor } from "@/components/editor/editor-store"
import {
  aiCost,
  AiError,
  generateCarousel,
  generateCardImage,
  rewriteSpans,
  suggestCaption,
  type RewriteIntent,
} from "@/lib/ai"
import {
  blockPlainText,
  CENTER_FRAME,
  defaultImage,
  type Block,
  type TextSpan,
} from "@/lib/doc"
import { useStore } from "@/lib/store"

// Orquestra a geração dentro do editor: cobra os créditos, consome o fluxo do
// contrato em lib/ai.ts e vai escrevendo no documento enquanto ele chega.
// Uma operação por vez, sempre interrompível — geração que não dá para parar
// é geração que assusta.

export type AiTask =
  | { kind: "carousel"; produced: number }
  | { kind: "rewrite"; blockId: string }
  | { kind: "image"; cardId: string }
  | { kind: "caption" }

type AiContextValue = {
  task: AiTask | null
  busy: boolean
  creditsLeft: number
  /** Substitui o carrossel inteiro pelo gerado, card a card. */
  runCarousel: (prompt: string) => Promise<void>
  rewrite: (block: Block, intent: RewriteIntent) => Promise<void>
  imageForCard: (cardId: string) => Promise<void>
  /** Legenda sugerida, chegando aos poucos — quem chama decide onde escrever. */
  captionFor: (onChunk: (caption: string) => void) => Promise<void>
  cancel: () => void
}

const AiContext = createContext<AiContextValue | null>(null)

export function AiProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const { state, dispatch } = useEditor()
  const { state: appState, dispatch: appDispatch } = useStore()
  const [task, setTask] = useState<AiTask | null>(null)
  const abort = useRef<AbortController | null>(null)

  const creditsLeft = appState.credits.total - appState.credits.used

  const cancel = useCallback(() => {
    abort.current?.abort()
    abort.current = null
    setTask(null)
  }, [])

  /** Porta de entrada de toda operação: crédito, sinal e tratamento de erro. */
  const guard = useCallback(
    async (cost: number, run: (signal: AbortSignal) => Promise<void>) => {
      if (creditsLeft < cost) {
        toast.error(t("editor.ai.errors.noCredits"))
        return
      }
      const controller = new AbortController()
      abort.current = controller
      try {
        await run(controller.signal)
        appDispatch({ type: "credits/consume", amount: cost })
      } catch (error) {
        const code = error instanceof AiError ? error.code : "failed"
        if (code !== "cancelled") toast.error(t(`editor.ai.errors.${code}`))
      } finally {
        abort.current = null
        setTask(null)
      }
    },
    [appDispatch, creditsLeft, t]
  )

  const runCarousel = useCallback(
    (prompt: string) =>
      guard(aiCost().carousel, async (signal) => {
        setTask({ kind: "carousel", produced: 0 })
        // Sai o que havia: gerar substitui, não empilha em cima do antigo.
        for (const card of [...state.doc.cards]) {
          dispatch({ type: "card/remove", id: card.id })
        }
        let produced = 0
        for await (const card of generateCarousel(prompt, {
          format: state.doc.format,
          signal,
        })) {
          dispatch({ type: "card/insert", index: produced, card })
          produced += 1
          setTask({ kind: "carousel", produced })
        }
        dispatch({ type: "block/select", id: null })
        toast.success(t("editor.ai.doneToast", { count: produced }))
      }),
    [dispatch, guard, state.doc.cards, state.doc.format, t]
  )

  const rewrite = useCallback(
    (block: Block, intent: RewriteIntent) =>
      guard(aiCost().rewrite, async (signal) => {
        if (block.type !== "text" && block.type !== "quote") return
        setTask({ kind: "rewrite", blockId: block.id })
        let latest: TextSpan[] = block.spans
        for await (const spans of rewriteSpans(block.spans, intent, signal)) {
          latest = spans
          dispatch({ type: "block/update", block: { ...block, spans } })
        }
        if (latest.length === 0) {
          dispatch({ type: "block/update", block })
        }
      }),
    [dispatch, guard]
  )

  const imageForCard = useCallback(
    (cardId: string) =>
      guard(aiCost().image, async (signal) => {
        setTask({ kind: "image", cardId })
        const card = state.doc.cards.find((c) => c.id === cardId)
        if (!card) return
        const hint = card.blocks.map(blockPlainText).join(" ")
        const source = await generateCardImage(hint, signal)
        dispatch({
          type: "card/update",
          id: cardId,
          patch: {
            image: { ...(card.image ?? defaultImage(1)), source, ...CENTER_FRAME },
            layout: card.layout === "no-image" ? "image-top" : card.layout,
          },
        })
      }),
    [dispatch, guard, state.doc.cards]
  )

  const captionFor = useCallback(
    (onChunk: (caption: string) => void) =>
      guard(aiCost().caption, async (signal) => {
        setTask({ kind: "caption" })
        const first = state.doc.cards[0]
        const hint = first ? first.blocks.map(blockPlainText).join(" ") : ""
        for await (const caption of suggestCaption(state.doc.title, hint, signal)) {
          onChunk(caption)
        }
      }),
    [guard, state.doc.cards, state.doc.title]
  )

  const value = useMemo(
    () => ({
      task,
      busy: task !== null,
      creditsLeft,
      runCarousel,
      rewrite,
      imageForCard,
      captionFor,
      cancel,
    }),
    [cancel, captionFor, creditsLeft, imageForCard, rewrite, runCarousel, task]
  )

  return <AiContext.Provider value={value}>{children}</AiContext.Provider>
}

export function useAi(): AiContextValue {
  const ctx = useContext(AiContext)
  if (!ctx) throw new Error("useAi precisa estar dentro de <AiProvider>")
  return ctx
}

/** O card em foco — atalho para os menus que operam sobre ele. */
export function useAiTargetCardId(): string | undefined {
  const { state } = useEditor()
  return activeCard(state)?.id
}
