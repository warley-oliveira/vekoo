import type { CarouselTheme, QuoteBlock } from "@/lib/doc"
import { cn } from "@/lib/utils"

import { inkClass } from "./shared"
import { SpansView } from "./spans"

export function QuoteBlockView({
  block,
  theme,
}: {
  block: QuoteBlock
  theme: CarouselTheme
}) {
  return (
    <blockquote
      className={cn("border-l-[1cqw] pl-[4.5cqw]", inkClass(block.color))}
      style={{ borderColor: theme.accent }}
    >
      <p className="text-[5.4cqw] leading-[1.32] font-medium text-balance">
        <SpansView spans={block.spans} theme={theme} />
      </p>
      {block.attribution && (
        <footer className="mt-[2.2cqw] text-[3.8cqw] opacity-75">
          {block.attribution}
        </footer>
      )}
    </blockquote>
  )
}
