import { Reorder, useReducedMotion } from "motion/react"
import { useTranslation } from "react-i18next"

import { CardArt } from "@/components/editor/card-art"
import {
  cardTitle,
  type CarouselCard,
  type CarouselFormat,
  type CarouselTheme,
} from "@/lib/doc"
import { cn } from "@/lib/utils"

export type TrailView = "thumbs" | "titles"

const LAYOUT_SPRING = { type: "spring", stiffness: 500, damping: 40 } as const

type TrailItemProps = {
  card: CarouselCard
  theme: CarouselTheme
  format: CarouselFormat
  index: number
  active: boolean
  view: TrailView
  onSelect: () => void
  onDragStart: () => void
  onDragEnd: () => void
}

/**
 * Um card na trilha: item arrastável (Reorder) que ganha peso e leve
 * inclinação enquanto viaja; os vizinhos abrem espaço com mola.
 */
export function TrailItem({
  card,
  theme,
  format,
  index,
  active,
  view,
  onSelect,
  onDragStart,
  onDragEnd,
}: TrailItemProps) {
  const { t } = useTranslation()
  const reducedMotion = useReducedMotion()
  const label =
    cardTitle(card) || t("editor.trail.cardFallback", { number: index + 1 })
  const entryDelay = reducedMotion ? 0 : Math.min(index * 0.04, 0.4)

  return (
    <Reorder.Item
      as="li"
      value={card.id}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      initial={reducedMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        opacity: { duration: 0.18, delay: entryDelay, ease: "easeOut" },
        y: { duration: 0.18, delay: entryDelay, ease: "easeOut" },
        layout: reducedMotion ? { duration: 0 } : LAYOUT_SPRING,
      }}
      whileDrag={
        reducedMotion
          ? { zIndex: 20 }
          : {
              zIndex: 20,
              scale: 1.04,
              rotate: 1.5,
              boxShadow: "0 12px 24px -12px oklch(0.185 0.005 285 / 0.5)",
            }
      }
      className="relative active:cursor-grabbing"
    >
      {view === "titles" ? (
        <button
          type="button"
          onClick={onSelect}
          aria-current={active ? "true" : undefined}
          aria-label={t("editor.trail.cardAria", {
            number: index + 1,
            title: label,
          })}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs",
            "outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            active
              ? "bg-accent font-medium text-accent-foreground"
              : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
          )}
        >
          <span className="w-4 shrink-0 text-right font-medium tabular-nums">
            {index + 1}
          </span>
          <span className="min-w-0 truncate">{label}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={onSelect}
          aria-current={active ? "true" : undefined}
          aria-label={t("editor.trail.cardAria", {
            number: index + 1,
            title: label,
          })}
          className="group/thumb flex w-full items-start gap-2 outline-none"
        >
          <span className="w-4 shrink-0 pt-0.5 text-right text-[11px] font-medium tabular-nums text-muted-foreground">
            {index + 1}
          </span>
          <span
            className={cn(
              "block min-w-0 flex-1 transition-shadow duration-150",
              active
                ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                : "ring-1 ring-border group-hover/thumb:ring-ring/50",
              "group-focus-visible/thumb:ring-3 group-focus-visible/thumb:ring-ring/50"
            )}
          >
            <CardArt card={card} theme={theme} format={format} />
          </span>
        </button>
      )}
    </Reorder.Item>
  )
}
