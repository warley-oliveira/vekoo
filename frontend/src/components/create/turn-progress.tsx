import { useTranslation } from "react-i18next"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { AlertTriangle, Check, ImagePlus } from "lucide-react"

import { PhotoTile } from "@/components/create/photo-tile"
import { Skeleton } from "@/components/ui/skeleton"
import { useElapsed } from "@/hooks/use-elapsed"
import { turnPhase, type AgentStep, type AgentTurn } from "@/lib/agent"
import type { BrandAsset } from "@/lib/brand-core"
import { cn } from "@/lib/utils"

/** Mola de interface: chega firme, sem quicar (bounce < 0.1). */
const SPRING = { type: "spring", bounce: 0.05, duration: 0.45 } as const

/**
 * O turno enquanto o agente trabalha — o que ele está fazendo **agora**.
 *
 * Três tempos, na ordem do servidor: lê o pedido e a marca; cria a foto (se
 * a peça precisar, ou se foi isso que a pessoa pediu); monta as peças. A
 * linha de status troca de frase a cada tempo; cada foto vira uma linha na
 * trilha (com o rótulo que o agente escreveu e o relógio) e um ladrilho que
 * revela no lugar exato onde a foto vai ficar.
 */
export function TurnProgress({ turn }: { turn: AgentTurn }) {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const phase = turnPhase(turn)
  const running = turn.steps.find((step) => step.status === "running")
  const seconds = useElapsed(turn.createdAt, true)
  const slots = turn.kind === "adjust" ? 1 : 3

  return (
    <div className="space-y-4" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="relative grid size-4 place-items-center" aria-hidden>
          <span className="absolute size-4 rounded-full bg-holo opacity-30 blur-[3px] motion-safe:animate-pulse" />
          <span className="size-1.5 rounded-full bg-vk-fg" />
        </span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={`${phase}-${running?.id ?? ""}`}
            initial={reduced ? false : { opacity: 0, y: 4, filter: "blur(2px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={reduced ? undefined : { opacity: 0, y: -4, filter: "blur(2px)" }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="min-w-0 truncate"
          >
            {phase === "photo" && running
              ? t("agent.progress.photo", { caption: running.caption })
              : t(`agent.progress.${phase}`)}
          </motion.span>
        </AnimatePresence>
        <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-vk-muted">{t("agent.progress.seconds", { seconds })}</span>
      </div>

      {turn.steps.length > 0 && <StepTrail steps={turn.steps} />}

      {/* A área da obra: as fotos revelando enquanto saem; depois, o lugar das peças. */}
      <AnimatePresence mode="popLayout" initial={false}>
        {phase === "photo" ? (
          <motion.div
            key="photos"
            layout={!reduced}
            exit={reduced ? undefined : { opacity: 0, transition: { duration: 0.2 } }}
            className="grid grid-cols-2 gap-4 sm:grid-cols-3"
          >
            {turn.steps.flatMap((step) =>
              step.status === "running"
                ? Array.from({ length: step.count }, (_, i) => <PhotoTile key={`${step.id}-${i}`} step={step} index={i} />)
                : step.assets.map((asset, i) => <PhotoTile key={asset.id} step={step} asset={asset} index={i} />)
            )}
          </motion.div>
        ) : (
          <motion.div
            key="pieces"
            layout={!reduced}
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25 }}
            className="space-y-4"
          >
            {phase === "composing" && <PhotoStrip turn={turn} />}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3" aria-busy>
              {Array.from({ length: slots }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="aspect-[4/5] w-full rounded-none" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** A trilha: uma linha por foto pedida, com o estado e quanto levou. */
function StepTrail({ steps }: { steps: AgentStep[] }) {
  const reduced = useReducedMotion()
  return (
    <ol className="space-y-1.5 border-l border-vk-border pl-3">
      <AnimatePresence initial={false}>
        {steps.map((step) => (
          <motion.li
            key={step.id}
            layout={!reduced}
            initial={reduced ? false : { opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={SPRING}
          >
            <StepRow step={step} />
          </motion.li>
        ))}
      </AnimatePresence>
    </ol>
  )
}

function StepRow({ step }: { step: AgentStep }) {
  const { t } = useTranslation()
  const running = step.status === "running"
  const seconds = useElapsed(step.startedAt, running, step.finishedAt)

  return (
    <p className="flex min-w-0 items-center gap-2 font-mono text-[11px] text-vk-muted">
      <span className="grid size-4 shrink-0 place-items-center" aria-hidden>
        {running ? (
          <ImagePlus className="size-3.5 text-vk-fg motion-safe:animate-pulse" />
        ) : step.status === "done" ? (
          <motion.span initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", bounce: 0.08, duration: 0.35 }}>
            <Check className="size-3.5 text-vk-green" />
          </motion.span>
        ) : (
          <AlertTriangle className="size-3.5 text-destructive" />
        )}
      </span>
      <span className={cn("min-w-0 truncate", running && "text-vk-fg")}>
        {step.status === "failed"
          ? t(`agent.photo.errors.${step.error ?? "failed"}`, { defaultValue: t("agent.photo.errors.failed") })
          : t(step.count === 1 ? "agent.photo.stepOne" : "agent.photo.stepMany", { caption: step.caption, count: step.count })}
      </span>
      <span className="ml-auto shrink-0 tabular-nums">{t("agent.progress.seconds", { seconds })}</span>
    </p>
  )
}

/**
 * As fotos criadas para as peças, em miniatura, acima delas: a pessoa vê de
 * onde veio a imagem e pode ampliar ou baixar a foto sem a peça.
 */
export function PhotoStrip({
  turn,
  onUse,
  disabled,
}: {
  turn: AgentTurn
  onUse?: (asset: BrandAsset, caption: string) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const done = turn.steps.filter((step) => step.assets.length > 0)
  if (done.length === 0) return null

  const count = done.reduce((sum, step) => sum + step.assets.length, 0)
  return (
    <div className="flex items-center gap-3">
      <ul className="flex shrink-0 gap-2">
        {done.flatMap((step) =>
          step.assets.map((asset, i) => (
            <li key={asset.id} className="w-14">
              <PhotoTile
                step={step}
                asset={asset}
                index={i}
                size="strip"
                onUse={onUse ? (picked) => onUse(picked, step.caption) : undefined}
                disabled={disabled}
              />
            </li>
          ))
        )}
      </ul>
      <p className="min-w-0 text-xs text-muted-foreground">
        {t("agent.photo.strip", { count })}
      </p>
    </div>
  )
}
