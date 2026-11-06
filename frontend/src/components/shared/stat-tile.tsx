import { useMemo, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react"

import { Skeleton } from "@/components/ui/skeleton"
import { formatCompactNumber, formatNumber, formatPercent } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/** A partir daqui o número vira "12,9 mil": o tile é para bater o olho. */
const COMPACT_FROM = 10_000

export type StatDelta = {
  /** Razão em relação ao período anterior: `0.125` é +12,5%. */
  value: number
  /** Contra o quê se compara: "vs. mês passado". */
  label?: string
  /** O que é bom aqui. Tempo de espera melhora caindo: `down`. `neutral` não pinta. */
  goodWhen?: "up" | "down" | "neutral"
}

export type StatTileProps = {
  label: string
  /** Número formata sozinho; para outra unidade, passe `<Money />` ou um texto pronto. */
  value: ReactNode
  delta?: StatDelta
  hint?: ReactNode
  /** Série em ordem cronológica. A linha aparece a partir de dois pontos. */
  sparkline?: number[]
  /** Como mostrar um ponto da série ao passar o mouse. */
  formatSparklineValue?: (value: number) => string
  loading?: boolean
  className?: string
}

function deltaTone(delta: StatDelta) {
  const direction = Math.sign(delta.value)
  const goodWhen = delta.goodWhen ?? "up"
  if (direction === 0 || goodWhen === "neutral") return "text-muted-foreground"

  const good = goodWhen === "up" ? direction > 0 : direction < 0
  return good ? "text-status-success" : "text-status-danger"
}

/** Um número e o que ele significa. A cor só entra na variação, e sempre com seta e sinal. */
export function StatTile({
  label,
  value,
  delta,
  hint,
  sparkline,
  formatSparklineValue,
  loading = false,
  className,
}: StatTileProps) {
  const language = useLanguage()

  const compacted = typeof value === "number" && Math.abs(value) >= COMPACT_FROM
  const display =
    typeof value === "number"
      ? compacted
        ? formatCompactNumber(value, language)
        : formatNumber(value, language)
      : value

  if (loading) {
    return (
      <div
        aria-hidden
        className={cn(
          "flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10",
          className
        )}
      >
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-7 w-20" />
        <Skeleton className="h-3 w-28" />
      </div>
    )
  }

  const DeltaIcon =
    delta && delta.value !== 0 ? (delta.value > 0 ? ArrowUpRight : ArrowDownRight) : Minus

  return (
    <div
      data-slot="stat-tile"
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-xl bg-card p-4 ring-1 ring-foreground/10",
        className
      )}
    >
      <p className="truncate text-sm text-muted-foreground">{label}</p>
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
        <p
          title={compacted ? formatNumber(value as number, language) : undefined}
          className="font-heading text-2xl leading-tight font-semibold tracking-tight whitespace-nowrap tabular-nums"
        >
          {display}
        </p>
        {sparkline && sparkline.length > 1 ? (
          <Sparkline
            values={sparkline}
            label={label}
            formatValue={formatSparklineValue}
            className="mb-1 shrink-0"
          />
        ) : null}
      </div>
      {delta ? (
        <p className="flex min-w-0 flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
          <span className={cn("inline-flex items-center gap-0.5 font-medium", deltaTone(delta))}>
            <DeltaIcon aria-hidden className="size-3.5" />
            {formatPercent(delta.value, language, { signed: true })}
          </span>
          {delta.label}
        </p>
      ) : null}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

/* ---------- sparkline ---------- */

const WIDTH = 72
const HEIGHT = 28
const PADDING = 3

export type SparklineProps = {
  values: number[]
  /** O que a série mede, para o leitor de tela. */
  label: string
  formatValue?: (value: number) => string
  className?: string
}

/**
 * Tendência em miniatura: linha discreta e o período atual marcado com o acento. Ao
 * passar o mouse, mostra o valor do ponto. Quem usa leitor de tela ouve o começo e o
 * fim da série. Tem só um eixo implícito, sem grade: a leitura exata é do número ao lado.
 */
export function Sparkline({ values, label, formatValue, className }: SparklineProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const [hovered, setHovered] = useState<number | null>(null)

  const format = formatValue ?? ((value: number) => formatNumber(value, language))

  const points = useMemo(() => {
    const min = Math.min(...values)
    const max = Math.max(...values)
    const range = max - min || 1
    const step = (WIDTH - PADDING * 2) / (values.length - 1)

    return values.map((value, index) => ({
      x: PADDING + index * step,
      y: HEIGHT - PADDING - ((value - min) / range) * (HEIGHT - PADDING * 2),
    }))
  }, [values])

  const line = points.map((point) => `${point.x},${point.y}`).join(" ")
  const active = hovered ?? values.length - 1
  const marker = points[active]

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const box = event.currentTarget.getBoundingClientRect()
    const ratio = (event.clientX - box.left) / box.width
    setHovered(Math.round(Math.min(1, Math.max(0, ratio)) * (values.length - 1)))
  }

  return (
    <span className={cn("relative inline-flex", className)}>
      <svg
        role="img"
        aria-label={t("kit.stat.trend", {
          label,
          first: format(values[0]),
          last: format(values[values.length - 1]),
        })}
        width={WIDTH}
        height={HEIGHT}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="touch-none overflow-visible"
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHovered(null)}
      >
        <polyline
          points={line}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-muted-foreground/40"
        />
        <circle
          cx={marker.x}
          cy={marker.y}
          r="3"
          strokeWidth="2"
          className="fill-primary stroke-card"
        />
      </svg>
      {hovered !== null ? (
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-full z-10 mb-1 -translate-x-1/2 rounded-md bg-foreground px-1.5 py-0.5 text-xs whitespace-nowrap text-background tabular-nums"
          style={{ left: marker.x }}
        >
          {format(values[hovered])}
        </span>
      ) : null}
    </span>
  )
}
