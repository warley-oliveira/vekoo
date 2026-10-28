import { useTranslation } from "react-i18next"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { AlertTriangle, HelpCircle, RefreshCw, Sparkles, Wand2 } from "lucide-react"

import { PhotoTile } from "@/components/create/photo-tile"
import { PhotoStrip, TurnProgress } from "@/components/create/turn-progress"
import { VariationCard } from "@/components/create/variation-card"
import { Button } from "@/components/ui/button"
import { formatRelative } from "@/lib/format"
import { turnPhotos, type AgentTurn, type AgentVariation } from "@/lib/agent"
import type { BrandAsset } from "@/lib/brand-core"
import type { Piece } from "@/lib/engines"
import { useLanguage } from "@/lib/i18n"

type TurnBlockProps = {
  turn: AgentTurn
  pieces: Map<string, Piece>
  onAdjust: (variation: AgentVariation) => void
  onVary: (variation: AgentVariation) => void
  onAnswer: (question: string) => void
  onRetry: (turn: AgentTurn) => void
  /** "Usar numa peça": a foto criada vira anexo do próximo pedido. */
  onUsePhoto: (asset: BrandAsset, caption: string) => void
  busy?: boolean
}

/**
 * Um turno na conversa: o que a pessoa pediu e o que voltou.
 *
 * São cinco finais possíveis e todos são desenhados aqui, porque nenhum é
 * exceção: as variações (o caminho feliz), **só fotos** (a pessoa pediu
 * imagem, não peça), a **pergunta** (faltou um fato e o agente não inventou —
 * não é erro, é acerto), a falha (com o caminho de volta) e o "ainda
 * pensando", que mostra a trilha ao vivo.
 *
 * A foto que o agente criou aparece em todos eles: ela já é da marca e já
 * custou crédito, então nunca some de vista — nem quando o resto deu errado.
 */
export function TurnBlock({ turn, pieces, onAdjust, onVary, onAnswer, onRetry, onUsePhoto, busy }: TurnBlockProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const reduced = useReducedMotion()
  const photos = turnPhotos(turn)
  const pickPhoto = (caption: string) => (asset: BrandAsset) => onUsePhoto(asset, caption)

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
            exit={reduced ? undefined : { opacity: 0, transition: { duration: 0.15 } }}
          >
            <TurnProgress turn={turn} />
          </motion.div>
        ) : turn.status === "question" ? (
          <motion.div
            key="question"
            initial={reduced ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            <PhotoStrip turn={turn} onUse={onUsePhoto} disabled={busy} />
            <div className="max-w-[42rem] space-y-3 rounded-2xl rounded-bl-sm border bg-card p-4">
              <p className="flex items-start gap-2 text-sm">
                <HelpCircle className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <span>{turn.question}</span>
              </p>
              <p className="text-xs text-muted-foreground">{t("agent.turn.questionHint")}</p>
              <Button size="sm" variant="outline" onClick={() => onAnswer(turn.question ?? "")} disabled={busy}>
                {t("agent.turn.answer")}
              </Button>
            </div>
          </motion.div>
        ) : turn.status === "failed" ? (
          <motion.div
            key="failed"
            initial={reduced ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            <PhotoStrip turn={turn} onUse={onUsePhoto} disabled={busy} />
            <div className="max-w-[42rem] space-y-3 rounded-2xl rounded-bl-sm border border-destructive/40 bg-card p-4">
              <p className="flex items-start gap-2 text-sm">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
                <span>{t(`agent.errors.${turn.error?.code ?? "failed"}`, { defaultValue: t("agent.errors.failed") })}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {photos.length > 0 ? t("agent.turn.failedHintPhotos") : t("agent.turn.failedHint")}
              </p>
              <Button size="sm" variant="outline" onClick={() => onRetry(turn)} disabled={busy}>
                <RefreshCw /> {t("agent.turn.retry")}
              </Button>
            </div>
          </motion.div>
        ) : turn.onlyImages ? (
          <motion.div key="photos" initial={false} className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("agent.turn.photos", { count: photos.length })}</p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {photos.map(({ asset, step }, index) => (
                <PhotoTile
                  key={asset.id}
                  step={step}
                  asset={asset}
                  index={index}
                  onUse={pickPhoto(step.caption)}
                  disabled={busy}
                />
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div key="answered" initial={false} className="space-y-3">
            <PhotoStrip turn={turn} onUse={onUsePhoto} disabled={busy} />
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
