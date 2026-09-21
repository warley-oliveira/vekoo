import { useTranslation } from "react-i18next"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { AlertTriangle, HelpCircle, RefreshCw, Sparkles, Wand2 } from "lucide-react"

import { VariationCard } from "@/components/create/variation-card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { formatRelative } from "@/lib/format"
import type { AgentTurn, AgentVariation } from "@/lib/agent"
import type { Piece } from "@/lib/engines"
import { useLanguage } from "@/lib/i18n"

type TurnBlockProps = {
  turn: AgentTurn
  pieces: Map<string, Piece>
  onAdjust: (variation: AgentVariation) => void
  onVary: (variation: AgentVariation) => void
  onAnswer: (question: string) => void
  onRetry: (turn: AgentTurn) => void
  busy?: boolean
}

/**
 * Um turno na conversa: o que a pessoa pediu e o que voltou.
 *
 * São quatro finais possíveis e todos são desenhados aqui, porque nenhum é
 * exceção: as variações (o caminho feliz), a **pergunta** (faltou um fato e o
 * agente não inventou — não é erro, é acerto), a falha (com o caminho de
 * volta) e o "ainda pensando".
 */
export function TurnBlock({ turn, pieces, onAdjust, onVary, onAnswer, onRetry, busy }: TurnBlockProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const reduced = useReducedMotion()

  return (
    <motion.section
      layout={!reduced}
      initial={reduced ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: "easeOut" }}
      className="space-y-4"
      aria-label={t("agent.turn.aria", { when: formatRelative(turn.createdAt, language) })}
    >
      {/* O pedido, do lado de quem pediu. */}
      <div className="flex justify-end">
        <div className="max-w-[42rem] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
          {turn.kind === "vary" ? (
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="size-3.5" aria-hidden /> {t("agent.turn.varyRequest")}
            </span>
          ) : (
            <p className="whitespace-pre-wrap">{turn.prompt}</p>
          )}
          {turn.kind === "adjust" && (
            <p className="mt-1 flex items-center gap-1.5 text-xs opacity-80">
              <Wand2 className="size-3" aria-hidden /> {t("agent.turn.adjustLabel")}
            </p>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {turn.status === "thinking" ? (
          <motion.div
            key="thinking"
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduced ? undefined : { opacity: 0 }}
            className="space-y-3"
          >
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Sparkles className="size-4 animate-pulse text-primary" aria-hidden />
              {t("agent.turn.thinking")}
            </p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3" aria-busy>
              {Array.from({ length: turn.kind === "adjust" ? 1 : 3 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="aspect-[4/5] w-full rounded-none" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
            </div>
          </motion.div>
        ) : turn.status === "question" ? (
          <motion.div
            key="question"
            initial={reduced ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-[42rem] space-y-3 rounded-2xl rounded-bl-sm border bg-card p-4"
          >
            <p className="flex items-start gap-2 text-sm">
              <HelpCircle className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <span>{turn.question}</span>
            </p>
            <p className="text-xs text-muted-foreground">{t("agent.turn.questionHint")}</p>
            <Button size="sm" variant="outline" onClick={() => onAnswer(turn.question ?? "")} disabled={busy}>
              {t("agent.turn.answer")}
            </Button>
          </motion.div>
        ) : turn.status === "failed" ? (
          <motion.div
            key="failed"
            initial={reduced ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-[42rem] space-y-3 rounded-2xl rounded-bl-sm border border-destructive/40 bg-card p-4"
          >
            <p className="flex items-start gap-2 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
              <span>{t(`agent.errors.${turn.error?.code ?? "failed"}`, { defaultValue: t("agent.errors.failed") })}</span>
            </p>
            <p className="text-xs text-muted-foreground">{t("agent.turn.failedHint")}</p>
            <Button size="sm" variant="outline" onClick={() => onRetry(turn)} disabled={busy}>
              <RefreshCw /> {t("agent.turn.retry")}
            </Button>
          </motion.div>
        ) : (
          <motion.div key="answered" initial={false} className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {turn.variations.length === 1
                ? t("agent.turn.oneResult")
                : t("agent.turn.results", { count: turn.variations.length })}
            </p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {turn.variations.map((variation, index) => (
                <VariationCard
                  key={variation.pieceId}
                  variation={variation}
                  piece={pieces.get(variation.pieceId)}
                  index={index}
                  onAdjust={onAdjust}
                  onVary={onVary}
                  disabled={busy}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  )
}
