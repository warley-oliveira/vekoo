import { CardImage } from "@/components/editor/card-image"
import type { CarouselTheme, ImageBlock } from "@/lib/doc"

/** Imagem no fluxo do conteúdo — a de destaque é do card, não deste bloco. */
export function ImageBlockView({
  block,
  theme,
}: {
  block: ImageBlock
  theme: CarouselTheme
}) {
  return (
    <div className="h-[30cqw] w-full shrink-0 overflow-hidden">
      <CardImage image={block.image} theme={theme} />
    </div>
  )
}
