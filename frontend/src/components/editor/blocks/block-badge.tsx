import type { BadgeBlock, CarouselTheme } from "@/lib/doc"
import { cn } from "@/lib/utils"

import { JUSTIFY_ALIGN } from "./shared"

/**
 * Selo curto — a numeração "1/8" e as etiquetas de seção. Menor e mais
 * discreto que o botão: não convida a agir, só situa.
 */
export function BadgeBlockView({
  block,
  theme,
}: {
  block: BadgeBlock
  theme: CarouselTheme
}) {
  const solid = block.variant === "solid"

  return (
    <div className={cn("flex w-full", JUSTIFY_ALIGN[block.align])}>
      <span
        className={cn(
          "inline-flex w-fit items-center rounded-full px-[3.4cqw] py-[1.2cqw]",
          "text-[3.2cqw] font-semibold tracking-[0.1em] uppercase"
        )}
        style={
          solid
            ? { backgroundColor: theme.accent, color: theme.accentInk }
            : {
                backgroundColor: `color-mix(in oklab, ${theme.accent} 16%, transparent)`,
                color: theme.accent,
              }
        }
      >
        {block.label}
      </span>
    </div>
  )
}
