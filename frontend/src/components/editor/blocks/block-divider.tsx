import type { CarouselTheme, DividerBlock } from "@/lib/doc"

export function DividerBlockView({
  block,
  theme,
}: {
  block: DividerBlock
  theme: CarouselTheme
}) {
  if (block.style === "dots") {
    return (
      <div className="flex items-center gap-[2.4cqw]" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-[1.5cqw] rounded-full bg-current opacity-60"
          />
        ))}
      </div>
    )
  }
  if (block.style === "accent") {
    return (
      <div
        aria-hidden
        className="h-[1.2cqw] w-[12cqw] shrink-0"
        style={{ backgroundColor: theme.accent }}
      />
    )
  }
  return <div aria-hidden className="h-[0.35cqw] w-full shrink-0 bg-current opacity-25" />
}
