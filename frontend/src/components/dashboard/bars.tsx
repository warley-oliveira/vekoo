import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

// As barras em HTML: comparação por comprimento, com o número escrito ao lado. Em HTML, e não no
// Recharts, porque o rótulo é longo e varia de tamanho, e a linha inteira precisa quebrar bem em 390 px.

export type RankedItem = {
  id: string
  leading?: ReactNode
  label: ReactNode
  /** Nome em texto, para o rótulo que não é só texto (etiqueta, pessoa). */
  title?: string
  value: number
  valueLabel: string
  shareLabel?: string
}

type RankedBarsProps = {
  items: RankedItem[]
  /** Referência da barra cheia. Sem ela, o maior da lista. */
  max?: number
  /** Um matiz só: a identidade está no nome, e o comprimento já diz quem é maior. */
  color?: string
  className?: string
}

/** Partes de um todo, para comparar: uma linha por parte, a maior primeiro, na mesma base. */
export function RankedBars({ items, max, color = "var(--viz-ink)", className }: RankedBarsProps) {
  const top = max ?? Math.max(...items.map((item) => item.value), 1)

  return (
    <ul className={cn("flex flex-col gap-3", className)}>
      {items.map((item) => (
        <li key={item.id} className="flex items-center gap-3">
          {item.leading}
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2 text-sm">
              <span title={item.title} className="min-w-0 flex-1 truncate">
                {item.label}
              </span>
              <span className="font-medium tabular-nums">{item.valueLabel}</span>
              {item.shareLabel ? (
                <span className="w-12 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                  {item.shareLabel}
                </span>
              ) : null}
            </div>
            <div
              aria-hidden
              className="mt-1 h-1.5 rounded-r-full"
              style={{
                backgroundColor: color,
                width: `${Math.max((item.value / top) * 100, item.value > 0 ? 1.5 : 0)}%`,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

type MeterProps = {
  /** De 0 a 100. */
  value: number
  label: string
  valueText?: string
  color?: string
  className?: string
}

/** Uma razão contra um limite: a parte cheia e, atrás, o trilho. */
export function Meter({ value, label, valueText, color = "var(--viz-ink)", className }: MeterProps) {
  const clamped = Math.min(100, Math.max(0, value))

  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      aria-valuetext={valueText}
      className={cn("h-2 overflow-hidden rounded-full bg-(--viz-track)", className)}
    >
      <div
        className="h-full rounded-full"
        style={{ width: `${clamped > 0 ? Math.max(clamped, 1.5) : 0}%`, backgroundColor: color }}
      />
    </div>
  )
}

export type SegmentPart = { key: string; label: string; value: number; color: string }

/** Um todo, partido: 8 px, sem texto, porque a lista ao lado já traz os números. Parte zerada não desenha. */
export function SegmentBar({ parts, label, className }: { parts: SegmentPart[]; label: string; className?: string }) {
  const total = parts.reduce((sum, part) => sum + part.value, 0)
  const visible = parts.filter((part) => part.value > 0)

  return (
    <div role="img" aria-label={label} className={cn("flex h-2 gap-0.5 overflow-hidden rounded-full", className)}>
      {total > 0 ? (
        visible.map((part) => (
          <span key={part.key} className="h-full" style={{ flexGrow: part.value, flexBasis: 0, backgroundColor: part.color }} />
        ))
      ) : (
        <span className="h-full w-full bg-(--viz-track)" />
      )}
    </div>
  )
}
