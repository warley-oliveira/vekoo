import { lazy, Suspense, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Target } from "lucide-react"

import { ResponsivePopover } from "@/components/shared"
import type { GoalDialogState } from "@/components/pipelines-admin/goal-dialog"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useBoardChannelParams } from "@/hooks/pipelines/use-board-realtime"
import { useGoalProgress } from "@/hooks/pipelines-admin/use-goals"
import { useChannel } from "@/hooks/use-channel"
import { useDebouncedCallback } from "@/hooks/use-debounced-value"
import { useOpenCount, useRetained } from "@/hooks/use-panel-session"
import { formatPercent } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { formatMonth, monthOf } from "@/lib/pipelines-admin/format"
import type { Board } from "@/lib/pipelines/types"
import { cn } from "@/lib/utils"

// O número fica no topo do pipeline, e o resto (mês a mês, por pessoa, gráfico) em chunk próprio: só
// quem abre paga por ele.
const BoardGoalsContent = lazy(() => import("./board-goals-content"))
const GoalDialog = lazy(() => import("@/components/pipelines-admin/goal-dialog"))

const LIVE_REFRESH_DELAY_MS = 5_000
const IDLE_TIMEOUT_MS = 1_500

const RING_STROKE = 3
const REACHED = 100

/** Depois que o pipeline já desenhou: o número da meta não disputa o primeiro carregamento. */
function useAfterIdle() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (typeof window.requestIdleCallback !== "function") {
      const timer = window.setTimeout(() => setReady(true), IDLE_TIMEOUT_MS / 3)
      return () => window.clearTimeout(timer)
    }
    const id = window.requestIdleCallback(() => setReady(true), { timeout: IDLE_TIMEOUT_MS })
    return () => window.cancelIdleCallback(id)
  }, [])
  return ready
}

function GoalRing({ percentage, size, className }: { percentage: number; size: number; className?: string }) {
  const radius = (size - RING_STROKE) / 2
  const circumference = 2 * Math.PI * radius
  const value = Math.min(REACHED, Math.max(0, percentage))

  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn("-rotate-90", value >= REACHED ? "text-status-success" : "text-primary", className)}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={RING_STROKE}
        className="stroke-muted-foreground/20"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={RING_STROKE}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - value / REACHED)}
        className="motion-safe:transition-[stroke-dashoffset] motion-safe:duration-300"
      />
    </svg>
  )
}

type Editing = { state: GoalDialogState; addable: { id: string; name: string }[] }

/**
 * Como vai a meta do mês, no topo do pipeline de vendas: o anel, o número e, ao tocar, as metas
 * mês a mês e por pessoa, de onde dá para definir e ajustar sem sair do quadro.
 */
export function BoardGoalsControl({ board, compact = false }: { board: Board; compact?: boolean }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const currentMonth = useMemo(() => monthOf(new Date()), [])

  const ready = useAfterIdle()
  const { progress, isLoading, reload } = useGoalProgress(board.id, currentMonth, { enabled: ready })

  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(currentMonth)
  const [editing, setEditing] = useState<Editing | null>(null)
  const dialogKey = useOpenCount(editing !== null)
  const shownEditing = useRetained(editing)

  // Venda ganha, valor mudado: o que vale é o que o servidor soma. Em lote, e sem pressa.
  const refreshSoon = useDebouncedCallback(() => void reload(), LIVE_REFRESH_DELAY_MS)
  const channelParams = useBoardChannelParams(board.id)
  useChannel<{ event?: string }>("PipelineBoardChannel", channelParams, (message) => {
    if (message?.event === "card_updated" || message?.event === "card_deleted") refreshSoon()
  })

  if (!ready || (isLoading && !progress)) {
    return (
      <Skeleton
        aria-hidden
        className={cn("rounded-full", compact ? "size-8 pointer-coarse:size-10" : "h-8 w-32")}
      />
    )
  }

  const funnel = progress?.funnel ?? null
  const percentage = funnel?.progressPercentage ?? null
  const percentText =
    percentage === null ? null : formatPercent(percentage / REACHED, language, { maximumFractionDigits: 0 })
  const monthName = formatMonth(currentMonth, language)
  const label = percentText
    ? t("pipelines.goals.pill", { month: monthName, percent: percentText })
    : t("pipelines.goals.pillEmpty", { month: monthName })

  return (
    <>
      <ResponsivePopover
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (next) setMonth(currentMonth)
        }}
        title={t("pipelines.goals.title")}
        align="end"
        className="w-[26rem] max-w-[calc(100vw-2rem)] gap-0 p-0"
        trigger={
          <Button
            type="button"
            variant="ghost"
            size={compact ? "icon" : "default"}
            aria-label={label}
            title={label}
            className={cn(
              "text-muted-foreground",
              compact ? "relative pointer-coarse:size-10" : "gap-2 px-2"
            )}
          >
            {percentage === null ? (
              <Target />
            ) : compact ? (
              <>
                <GoalRing percentage={percentage} size={32} />
                <span
                  aria-hidden
                  className="absolute inset-0 flex items-center justify-center text-[0.5625rem] font-medium text-foreground tabular-nums"
                >
                  {Math.round(percentage)}
                </span>
              </>
            ) : (
              <GoalRing percentage={percentage} size={20} />
            )}
            {compact ? null : percentText ? (
              <span className="flex items-baseline gap-1.5">
                {t("pipelines.goals.monthly")}
                <span className="font-medium text-foreground tabular-nums">{percentText}</span>
              </span>
            ) : (
              t("pipelines.goals.define")
            )}
          </Button>
        }
      >
        <Suspense fallback={<div aria-hidden className="h-72 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />}>
          <BoardGoalsContent
            board={board}
            month={month}
            currentMonth={currentMonth}
            onMonthChange={setMonth}
            onEdit={(next) => {
              setOpen(false)
              setEditing(next)
            }}
            onLeave={() => setOpen(false)}
          />
        </Suspense>
      </ResponsivePopover>

      {shownEditing ? (
        <Suspense fallback={null}>
          <GoalDialog
            key={dialogKey}
            boardId={board.id}
            month={month}
            state={shownEditing.state}
            addable={shownEditing.addable}
            open={editing !== null}
            onOpenChange={(next) => {
              if (next) return
              setEditing(null)
              // Volta para onde estava, para ver o número novo.
              setOpen(true)
            }}
          />
        </Suspense>
      ) : null}
    </>
  )
}
