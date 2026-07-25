import type { CarouselTheme, StatBlock } from "@/lib/doc"
import { cn } from "@/lib/utils"

import { TEXT_ALIGN } from "./shared"

/** Destaque numérico: o número grande, a explicação pequena. */
export function StatBlockView({
  block,
  theme,
}: {
  block: StatBlock
  theme: CarouselTheme
}) {
  return (
    <div className={cn(TEXT_ALIGN[block.align])}>
      <p
        className="font-heading text-[13cqw] leading-none font-bold tracking-tight"
        style={block.color === "accent" ? { color: theme.accent } : undefined}
      >
        {block.value}
      </p>
      <p className="mt-[2cqw] text-[4.2cqw] leading-[1.35] opacity-80">
        {block.label}
      </p>
    </div>
  )
}
