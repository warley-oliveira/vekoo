import type { CarouselTheme, StepsBlock } from "@/lib/doc"
import { cn } from "@/lib/utils"

import { inkClass } from "./shared"
import { SpansView } from "./spans"

/**
 * Passos numerados: o numeral grande no acento carrega a ordem, o texto fica
 * ao lado. É o formato de "como fazer" que carrossel de Instagram vive usando.
 */
export function StepsBlockView({
  block,
  theme,
}: {
  block: StepsBlock
  theme: CarouselTheme
}) {
  return (
    <ol className={cn("flex flex-col gap-[3cqw]", inkClass(block.color))}>
      {block.items.map((item, index) => (
        <li key={index} className="flex items-baseline gap-[3cqw]">
          <span
            aria-hidden
            className="font-heading w-[7cqw] shrink-0 text-[7cqw] leading-none font-bold tabular-nums"
            style={{ color: theme.accent }}
          >
            {index + 1}
          </span>
          <span className="min-w-0 text-[4.4cqw] leading-[1.35]">
            <SpansView spans={item} theme={theme} />
          </span>
        </li>
      ))}
    </ol>
  )
}
