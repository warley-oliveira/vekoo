import type { CarouselTheme, TestimonialBlock } from "@/lib/doc"
import { cn } from "@/lib/utils"

import { inkClass } from "./shared"
import { SpansView } from "./spans"

/** Iniciais de quem falou — o retrato entra quando houver imagem de verdade. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ""
  return (parts[0][0] + (parts.at(-1)?.[0] ?? "")).toUpperCase()
}

export function TestimonialBlockView({
  block,
  theme,
}: {
  block: TestimonialBlock
  theme: CarouselTheme
}) {
  return (
    <figure className={cn("flex flex-col gap-[3cqw]", inkClass(block.color))}>
      <blockquote className="text-[4.8cqw] leading-[1.38] font-medium text-balance">
        <SpansView spans={block.spans} theme={theme} />
      </blockquote>
      <figcaption className="flex items-center gap-[2.8cqw]">
        <span
          aria-hidden
          className="flex size-[9cqw] shrink-0 items-center justify-center rounded-full text-[3.4cqw] font-bold"
          style={{ backgroundColor: theme.accent, color: theme.accentInk }}
        >
          {initials(block.name)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[3.9cqw] font-semibold">
            {block.name}
          </span>
          {block.role && (
            <span className="block truncate text-[3.4cqw] opacity-70">
              {block.role}
            </span>
          )}
        </span>
      </figcaption>
    </figure>
  )
}
