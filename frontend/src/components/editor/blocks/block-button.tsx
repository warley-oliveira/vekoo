import type { ButtonBlock, CarouselTheme } from "@/lib/doc"
import { cn } from "@/lib/utils"

import { SELF_ALIGN } from "./shared"

/**
 * Botão do card — parte da obra, não da ferramenta: é um convite visual
 * ("link na bio"), não um controle clicável de verdade.
 */
export function ButtonBlockView({
  block,
  theme,
}: {
  block: ButtonBlock
  theme: CarouselTheme
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-full px-[5.5cqw] py-[2.4cqw] text-[4.2cqw] font-semibold tracking-tight",
        block.variant === "outline" && "border-[0.6cqw]",
        SELF_ALIGN[block.align]
      )}
      style={
        block.variant === "solid"
          ? { backgroundColor: theme.accent, color: theme.accentInk }
          : { borderColor: theme.accent }
      }
    >
      {block.label}
    </span>
  )
}
