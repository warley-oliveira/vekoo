import type { CarouselTheme, ListBlock } from "@/lib/doc"
import { cn } from "@/lib/utils"

import { inkClass } from "./shared"
import { SpansView } from "./spans"

/** Marcador de item — compartilhado com o editor inline da lista. */
export function ListMarker({
  style,
  index,
  theme,
}: {
  style: ListBlock["style"]
  index: number
  theme: CarouselTheme
}) {
  if (style === "bullet") {
    return (
      <span
        aria-hidden
        className="mt-[1.7cqw] size-[1.7cqw] shrink-0"
        style={{ backgroundColor: theme.accent }}
      />
    )
  }
  if (style === "number") {
    return (
      <span
        className="shrink-0 font-semibold tabular-nums"
        style={{ color: theme.accent }}
      >
        {index + 1}.
      </span>
    )
  }
  return (
    <span
      aria-hidden
      className="shrink-0 font-bold"
      style={{ color: theme.accent }}
    >
      ✓
    </span>
  )
}

export function ListBlockView({
  block,
  theme,
}: {
  block: ListBlock
  theme: CarouselTheme
}) {
  return (
    <ul className={cn("flex flex-col gap-[2.4cqw]", inkClass(block.color))}>
      {block.items.map((item, index) => (
        <li
          key={index}
          className="flex items-start gap-[2.6cqw] text-[4.4cqw] leading-[1.35]"
        >
          <ListMarker style={block.style} index={index} theme={theme} />
          <span className="min-w-0">
            <SpansView spans={item} theme={theme} />
          </span>
        </li>
      ))}
    </ul>
  )
}
