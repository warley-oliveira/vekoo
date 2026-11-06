import { memo } from "react"
import { motion } from "motion/react"
import { useTranslation } from "react-i18next"
import { ArrowRight, Check } from "lucide-react"

import { SelectInput } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useMotionPreset } from "@/lib/motion"
import { agingDays, dealStatusOf } from "@/lib/pipelines/card-meta"
import type { Card, Stage } from "@/lib/pipelines/types"
import { cn } from "@/lib/utils"

type StageTrackProps = {
  card: Card
  stages: Stage[]
  onMove: (stageId: string) => void
}

/**
 * Onde o card está no caminho: marcos da primeira à última etapa, a etapa atual, há quanto tempo
 * está nela, e a próxima a um clique. O marcador viaja entre as etapas (`layoutId`), o que mostra
 * para onde o card foi quando a mudança vem de fora.
 */
export const StageTrack = memo(function StageTrack({ card, stages, onMove }: StageTrackProps) {
  const { t } = useTranslation()
  const preset = useMotionPreset()

  const currentIndex = stages.findIndex((stage) => stage.id === card.stageId)
  const next = currentIndex >= 0 ? stages[currentIndex + 1] : undefined
  const status = dealStatusOf(card)
  const days = agingDays(card)
  const closed = status !== "open"

  return (
    <section aria-label={t("pipelines.track.title")} className="flex flex-col gap-3">
      <ol className="flex items-center">
        {stages.map((stage, index) => {
          const done = index < currentIndex
          const current = index === currentIndex
          return (
            <li key={stage.id} className={cn("flex items-center", index > 0 && "flex-1")}>
              {index > 0 ? (
                <span
                  aria-hidden
                  className={cn(
                    "h-px flex-1 bg-border transition-colors",
                    index <= currentIndex && "bg-primary/60",
                    closed && index <= currentIndex && status === "won" && "bg-status-success/60",
                    closed && index <= currentIndex && status === "lost" && "bg-muted-foreground/40"
                  )}
                />
              ) : null}
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      aria-label={t("pipelines.track.moveTo", { name: stage.name })}
                      aria-current={current ? "step" : undefined}
                      onClick={current ? undefined : () => onMove(stage.id)}
                      className="relative flex size-6 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:size-8"
                    />
                  }
                >
                  {current ? (
                    <motion.span
                      layoutId="pipeline-stage-marker"
                      transition={preset.spring}
                      className={cn(
                        "absolute inset-1 rounded-full ring-2",
                        status === "won"
                          ? "bg-status-success-soft ring-status-success"
                          : status === "lost"
                            ? "bg-muted ring-muted-foreground"
                            : "bg-accent ring-primary"
                      )}
                    />
                  ) : null}
                  <span
                    className={cn(
                      "relative flex size-3 items-center justify-center rounded-full",
                      done
                        ? status === "won"
                          ? "bg-status-success text-primary-foreground"
                          : status === "lost"
                            ? "bg-muted-foreground text-primary-foreground"
                            : "bg-primary text-primary-foreground"
                        : current
                          ? ""
                          : "bg-border"
                    )}
                  >
                    {done ? <Check className="size-2.5" strokeWidth={3} aria-hidden /> : null}
                  </span>
                </TooltipTrigger>
                <TooltipContent>{stage.name}</TooltipContent>
              </Tooltip>
            </li>
          )
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        <SelectInput
          aria-label={t("pipelines.card.stage")}
          className="w-auto min-w-40"
          value={card.stageId}
          options={stages.map((stage) => ({ value: stage.id, label: stage.name }))}
          onChange={(stageId) => {
            if (stageId && stageId !== card.stageId) onMove(stageId)
          }}
        />
        {days > 0 ? (
          <span className="text-xs text-muted-foreground">
            {t("pipelines.track.daysHere", { count: days })}
          </span>
        ) : null}
        {!closed && next ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-auto max-w-full min-w-0 pointer-coarse:h-10"
            onClick={() => onMove(next.id)}
          >
            <span className="truncate">{t("pipelines.track.advance", { name: next.name })}</span>
            <ArrowRight />
          </Button>
        ) : null}
      </div>
    </section>
  )
})
