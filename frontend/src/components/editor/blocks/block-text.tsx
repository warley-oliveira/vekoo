import type { CarouselTheme, TextBlock, TextRole } from "@/lib/doc"
import { cn } from "@/lib/utils"

import { inkClass, inkStyle, TEXT_ALIGN } from "./shared"

export const ROLE_CLASS: Record<TextRole, string> = {
  title:
    "font-heading text-[10cqw] leading-[1.06] font-bold tracking-tight text-balance",
  subtitle:
    "font-heading text-[6.2cqw] leading-[1.18] font-semibold tracking-tight text-balance",
  body: "text-[4.6cqw] leading-[1.45]",
  caption: "text-[3.9cqw] font-semibold tracking-[0.14em] uppercase",
}

export function TextBlockView({
  block,
  theme,
}: {
  block: TextBlock
  theme: CarouselTheme
}) {
  const Tag = block.role === "title" ? "h3" : "p"
  return (
    <Tag
      className={cn(
        ROLE_CLASS[block.role],
        TEXT_ALIGN[block.align],
        inkClass(block.color)
      )}
      style={inkStyle(block.color, theme)}
    >
      {block.text}
    </Tag>
  )
}
