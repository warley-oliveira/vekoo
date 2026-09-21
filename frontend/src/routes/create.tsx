import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, Navigate, useNavigate, useParams } from "react-router"
import { useTranslation } from "react-i18next"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Palette, Settings2, Sparkles, X } from "lucide-react"
import { toast } from "sonner"

import { Composer } from "@/components/create/composer"
import { ConversationList } from "@/components/create/conversation-list"
import { TurnBlock } from "@/components/create/turn-block"
import { EmptyState } from "@/components/empty-state"
import { ErrorState } from "@/components/error-state"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useAgentLive } from "@/hooks/use-agent-live"
import { useBrandCore } from "@/hooks/use-brand-core"
import {
  useConversation,
  useConversationMutations,
  useConversations,
} from "@/hooks/use-conversations"
import { usePieces } from "@/hooks/use-pieces"
import { usePiecesLive } from "@/hooks/use-pieces-live"
import { ApiError } from "@/lib/api"
import { isBusy, type AgentTurn, type AgentVariation, type StartTurnInput } from "@/lib/agent"
import { useActiveBrand } from "@/lib/brand-context"
import { useCatalog } from "@/lib/catalog"

/**
 * `/brands/:brandId/create` — a criação por conversa.
 *
 * É o caminho principal do produto: a pessoa descreve a peça numa frase e
 * recebe 2–3 variações prontas. Quem escolhe o motor e preenche o manifesto é
 * o agente; o catálogo continua existindo, mas mudou de lugar — virou o modo
 * avançado, no link discreto do rodapé.
 *
 * Dois canais alimentam esta tela, e é isso que a faz parecer viva: o
 * `AgentChannel` traz a decisão do agente (as variações aparecem com o
 * esqueleto no lugar da arte) e o `PieceChannel` traz cada imagem quando o
 * motor termina de desenhar.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function CreatePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const reduced = useReducedMotion()
  const { conversationId } = useParams()
  const { brandId, path } = useActiveBrand()

  // `/create/<motor>` era o formulário manual até esta etapa. Um id que não é
  // UUID só pode ser um motor: manda para o modo avançado em vez de mostrar
  // "conversa não encontrada" para um link que já foi válido.
  const legacyEngine = conversationId && !UUID.test(conversationId) ? conversationId : null

  const costs = useCatalog().aiCosts
  const brand = useBrandCore(brandId)
  const list = useConversations(brandId)
  const { conversation, isLoading, error, reload } = useConversation(brandId, conversationId)
  const { pieces } = usePieces(brandId)
  const { start, send } = useConversationMutations(brandId)

  const [adjusting, setAdjusting] = useState<AgentVariation | null>(null)
  const [sending, setSending] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)

  useAgentLive()
  usePiecesLive()

  const pieceIndex = useMemo(() => new Map((pieces ?? []).map((piece) => [piece.id, piece])), [pieces])
  const busy = sending || isBusy(conversation)

  // Toda vez que a conversa cresce (ou o último turno muda de estado), a tela
  // acompanha — como qualquer conversa faz.
  const turnCount = conversation?.turns.length ?? 0
  const lastStatus = conversation?.turns.at(-1)?.status
  useEffect(() => {
    if (!turnCount) return
    bottom.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "end" })
  }, [turnCount, lastStatus, reduced])

  const fail = useCallback(
    (error: unknown) => {
      if (error instanceof ApiError && error.code === "noCredits") {
        toast.error(t("agent.errors.noCredits"))
      } else if (error instanceof ApiError && error.code === "busy") {
        toast.error(t("agent.errors.busy"))
      } else if (error instanceof ApiError && error.code === "costCapReached") {
        toast.error(t("agent.errors.costCapReached"))
      } else if (error instanceof ApiError && error.serverMessage) {
        toast.error(error.serverMessage)
      } else {
        toast.error(t("agent.errors.sendFailed"))
      }
    },
    [t]
  )

  /** Manda um turno: abre a conversa quando ainda não há uma. */
  const submit = useCallback(
    async (input: StartTurnInput) => {
      setSending(true)
      try {
        if (conversationId) {
          await send(conversationId, input)
        } else {
          const created = await start(input)
          navigate(path(`/create/${created.id}`), { replace: true })
        }
        setAdjusting(null)
      } catch (error) {
        fail(error)
      } finally {
        setSending(false)
      }
    },
    [conversationId, fail, navigate, path, send, start]
  )

  const onSubmit = useCallback(
    async (prompt: string, attachments: string[]) => {
      await submit(
        adjusting
          ? { kind: "adjust", prompt, basePieceId: adjusting.pieceId }
          : { kind: "create", prompt, attachments }
      )
    },
    [adjusting, submit]
  )

  const onVary = useCallback(
    (variation: AgentVariation) => void submit({ kind: "vary", basePieceId: variation.pieceId }),
    [submit]
  )

  const onAdjust = useCallback((variation: AgentVariation) => {
    setAdjusting(variation)
    // O foco vai para o campo: "ajustar" é um convite a escrever, não um menu.
    window.requestAnimationFrame(() => document.getElementById("agent-prompt")?.focus())
  }, [])

  const onAnswer = useCallback(() => {
    setAdjusting(null)
    window.requestAnimationFrame(() => document.getElementById("agent-prompt")?.focus())
  }, [])

  const onRetry = useCallback(
    (turn: AgentTurn) =>
      void submit({
        kind: turn.kind,
        prompt: turn.prompt,
        basePieceId: turn.basePieceId ?? undefined,
        attachments: turn.attachments,
      }),
    [submit]
  )

  /* ---------- estados que não são a conversa ---------- */

  if (legacyEngine) return <Navigate to={path(`/advanced/${legacyEngine}`)} replace />

  if (brand.error && !brand.brandCore) {
    return (
      <Shell>
        <ErrorState error={brand.error} onRetry={brand.reload} />
      </Shell>
    )
  }

  if (!brand.brandCore) {
    return (
      <Shell>
        <div className="space-y-4" aria-busy>
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-28 w-full rounded-2xl" />
        </div>
      </Shell>
    )
  }

  // Sem marca publicada não há de onde tirar cor, fonte nem fato — e o agente
  // não deve inventar nenhum dos três.
  if (brand.brandCore.status !== "published") {
    return (
      <Shell>
        <EmptyState
          icon={<Palette className="size-6" />}
          title={t("agent.brandNotPublished.title")}
          description={t("agent.brandNotPublished.description")}
          action={{
            label: t("agent.brandNotPublished.cta"),
            onClick: () => navigate(path("/settings")),
          }}
        />
      </Shell>
    )
  }

  if (conversationId && error && !conversation) {
    return (
      <Shell>
        <ErrorState error={error} onRetry={reload} />
        <Button variant="outline" className="mt-4" onClick={() => navigate(path("/create"))}>
          {t("agent.backToNew")}
        </Button>
      </Shell>
    )
  }

  const empty = !conversationId

  return (
    <Shell>
      <AnimatePresence mode="wait" initial={false}>
        {empty ? (
          <motion.div
            key="hero"
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? undefined : { opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="mx-auto flex max-w-2xl flex-col justify-center gap-6 py-10 md:py-16"
          >
            <header className="space-y-2 text-center">
              <h1 className="font-heading text-3xl font-semibold tracking-tight text-balance md:text-4xl">
                {t("agent.hero.title")}
              </h1>
              <p className="mx-auto max-w-md text-sm text-muted-foreground text-pretty">
                {t("agent.hero.description", { brand: brand.brandCore.name })}
              </p>
            </header>

            <Composer brandId={brandId} onSubmit={onSubmit} busy={busy} autoFocus />

            <ConversationList
              brandId={brandId}
              conversations={list.conversations}
              isLoading={list.isLoading}
              retentionDays={list.retentionDays}
            />

            <AdvancedLink to={path("/advanced")} />
          </motion.div>
        ) : (
          <motion.div
            key="thread"
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex min-h-[calc(100dvh-8rem)] flex-col"
          >
            <header className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
              <div className="min-w-0">
                <h1 className="truncate font-heading text-lg font-semibold tracking-tight">
                  {conversation?.title ?? t("agent.hero.title")}
                </h1>
              </div>
              <Button variant="outline" size="sm" onClick={() => navigate(path("/create"))}>
                <Sparkles /> {t("agent.newRequest")}
              </Button>
            </header>

            <div className="flex-1 space-y-8 py-6">
              {isLoading && !conversation ? (
                <div className="space-y-4" aria-busy>
                  <Skeleton className="ml-auto h-10 w-64 rounded-2xl" />
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="aspect-[4/5] w-full rounded-none" />
                    ))}
                  </div>
                </div>
              ) : (
                conversation?.turns.map((turn) => (
                  <TurnBlock
                    key={turn.id}
                    turn={turn}
                    pieces={pieceIndex}
                    onAdjust={onAdjust}
                    onVary={onVary}
                    onAnswer={onAnswer}
                    onRetry={onRetry}
                    busy={busy}
                  />
                ))
              )}
              <div ref={bottom} />
            </div>

            <div className="sticky bottom-0 space-y-2 bg-gradient-to-t from-background via-background to-transparent pt-4 pb-4">
              <AnimatePresence initial={false}>
                {adjusting && (
                  <motion.div
                    initial={reduced ? false : { opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduced ? undefined : { opacity: 0, y: 4 }}
                    className="flex items-center gap-2 text-xs"
                  >
                    <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1">
                      {t("agent.adjustingChip", { title: adjusting.title })}
                      <button
                        type="button"
                        onClick={() => setAdjusting(null)}
                        aria-label={t("agent.adjustingCancel")}
                        className="rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
              <Composer
                brandId={brandId}
                onSubmit={onSubmit}
                busy={busy}
                variant="bar"
                placeholderKey={adjusting ? "agent.composer.adjustExamples" : "agent.composer.examples"}
                cost={adjusting ? costs.agentAdjust : costs.agent}
              />
              <AdvancedLink to={path("/advanced")} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-4xl px-4 py-6 md:px-6">{children}</div>
}

/**
 * A porta para o catálogo de motores e os formulários manuais. Discreta de
 * propósito: continua servindo a quem sabe o que quer (e à própria operação
 * da Vekoo), mas não é mais a experiência principal.
 */
function AdvancedLink({ to }: { to: string }) {
  const { t } = useTranslation()
  return (
    <p className="text-center text-xs text-muted-foreground">
      <Link
        to={to}
        className="inline-flex items-center gap-1 rounded outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Settings2 className="size-3" aria-hidden /> {t("agent.advancedLink")}
      </Link>
    </p>
  )
}
