import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export type BarListItem = {
  id: string
  label: ReactNode
  /** Só para o comprimento da barra. Sem valor, a linha fica sem barra. */
  value: number | null
  /** O número escrito, sempre à vista: a leitura não depende de passar o mouse. */
  display: ReactNode
  detail?: ReactNode
  /** O que a pessoa precisa ver primeiro leva o acento; o resto é contexto. */
  emphasized?: boolean
}

/**
 * Barras horizontais em HTML, no lugar de um gráfico: rótulo e número sempre escritos, e a barra só
 * para comparar. É a forma quieta da skill de dataviz, e funciona igual em leitor de tela, porque é
 * uma lista de textos.
 */
export function BarList({ items, "aria-label": ariaLabel }: { items: BarListItem[]; "aria-label"?: string }) {
  const max = Math.max(...items.map((item) => item.value ?? 0), 0)

  return (
    <ul aria-label={ariaLabel} className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.id} className="flex min-w-0 flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{item.label}</span>
            <span className="shrink-0 font-medium tabular-nums">{item.display}</span>
          </div>
          <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-muted">
            {item.value ? (
              <div
                className={cn(
                  "h-full origin-left rounded-full motion-safe:transition-transform motion-safe:duration-300",
                  item.emphasized ? "bg-primary" : "bg-chart-2"
                )}
                style={{ transform: `scaleX(${max > 0 ? item.value / max : 0})` }}
              />
            ) : null}
          </div>
          {item.detail ? <p className="text-xs text-muted-foreground">{item.detail}</p> : null}
        </li>
      ))}
    </ul>
  )
}
