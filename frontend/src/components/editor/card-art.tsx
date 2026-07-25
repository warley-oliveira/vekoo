import type { CSSProperties, ReactNode } from "react"

import { ButtonBlockView } from "@/components/editor/blocks/block-button"
import { DividerBlockView } from "@/components/editor/blocks/block-divider"
import { ImageBlockView } from "@/components/editor/blocks/block-image"
import { ListBlockView } from "@/components/editor/blocks/block-list"
import { QuoteBlockView } from "@/components/editor/blocks/block-quote"
import { StatBlockView } from "@/components/editor/blocks/block-stat"
import { TableBlockView } from "@/components/editor/blocks/block-table"
import { TextBlockView } from "@/components/editor/blocks/block-text"
import { CardImage } from "@/components/editor/card-image"
import {
  FORMAT_RATIOS,
  type Block,
  type CarouselCard,
  type CarouselFormat,
  type CarouselTheme,
  type VerticalAlign,
} from "@/lib/doc"
import { cn } from "@/lib/utils"

// O renderizador do card — a arte real, do thumbnail da busca ao canvas do
// editor. Tipografia em cqw (container queries) para escalar sem mídia query;
// cantos retos de propósito: Instagram não arredonda imagem, e é isso que
// separa a obra da ferramenta.
//
// O canvas interativo (card-editable.tsx) reaproveita as mesmas peças:
// CardShell (moldura), CardImageRegions (disposição da imagem) e
// CardBlockView (cada bloco) — para o que se edita ser exatamente o que sai.

const V_ALIGN: Record<VerticalAlign, string> = {
  top: "justify-start",
  center: "justify-center",
  bottom: "justify-end",
}

/** Coluna de conteúdo do card — o mesmo fluxo no modo estático e no editor. */
export function cardContentClass(align: VerticalAlign): string {
  return cn(
    "flex min-h-0 flex-1 flex-col gap-[3.4cqw] overflow-hidden p-[7cqw]",
    V_ALIGN[align]
  )
}

type CardShellProps = {
  card: CarouselCard
  theme: CarouselTheme
  format?: CarouselFormat
  className?: string
  /** No canvas o card é ferramenta viva; fora dele, arte decorativa. */
  interactive?: boolean
  children: ReactNode
}

export function CardShell({
  card,
  theme,
  format = "4:5",
  className,
  interactive = false,
  children,
}: CardShellProps) {
  const style: CSSProperties = {
    containerType: "inline-size",
    aspectRatio: String(FORMAT_RATIOS[format]),
    backgroundColor: card.bg ?? theme.bg,
    color: theme.ink,
  }

  return (
    <div
      aria-hidden={interactive ? undefined : true}
      style={style}
      className={cn(
        "relative w-full overflow-hidden rounded-none",
        !interactive && "select-none",
        className
      )}
    >
      {children}
    </div>
  )
}

export function CardImageRegions({
  card,
  theme,
  content,
}: {
  card: CarouselCard
  theme: CarouselTheme
  content: ReactNode
}) {
  const image = card.image

  if (card.layout === "image-full" && image) {
    return (
      <>
        <div className="absolute inset-0">
          <CardImage image={image} theme={theme} />
        </div>
        {/* Véu na cor do card para o texto seguir legível sobre a arte. */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-45"
          style={{ backgroundColor: card.bg ?? theme.bg }}
        />
        <div className="relative flex h-full flex-col">{content}</div>
      </>
    )
  }
  if (card.layout === "image-top" && image) {
    return (
      <div className="flex h-full flex-col">
        <div className="min-h-0 shrink-0 basis-[36%] overflow-hidden">
          <CardImage image={image} theme={theme} />
        </div>
        {content}
      </div>
    )
  }
  if (card.layout === "image-left" && image) {
    return (
      <div className="flex h-full">
        <div className="min-w-0 shrink-0 basis-[38%] overflow-hidden">
          <CardImage image={image} theme={theme} />
        </div>
        {content}
      </div>
    )
  }
  if (card.layout === "image-right" && image) {
    return (
      <div className="flex h-full">
        {content}
        <div className="min-w-0 shrink-0 basis-[38%] overflow-hidden">
          <CardImage image={image} theme={theme} />
        </div>
      </div>
    )
  }
  return <div className="flex h-full flex-col">{content}</div>
}

export function CardBlockView({
  block,
  theme,
}: {
  block: Block
  theme: CarouselTheme
}) {
  switch (block.type) {
    case "text":
      return <TextBlockView block={block} theme={theme} />
    case "image":
      return <ImageBlockView block={block} theme={theme} />
    case "list":
      return <ListBlockView block={block} theme={theme} />
    case "stat":
      return <StatBlockView block={block} theme={theme} />
    case "quote":
      return <QuoteBlockView block={block} theme={theme} />
    case "divider":
      return <DividerBlockView block={block} theme={theme} />
    case "table":
      return <TableBlockView block={block} theme={theme} />
    case "button":
      return <ButtonBlockView block={block} theme={theme} />
  }
}

type CardArtProps = {
  card: CarouselCard
  theme: CarouselTheme
  format?: CarouselFormat
  className?: string
}

/** Modo estático: trilha, miniaturas da biblioteca, prévias futuras. */
export function CardArt({ card, theme, format = "4:5", className }: CardArtProps) {
  return (
    <CardShell card={card} theme={theme} format={format} className={className}>
      <CardImageRegions
        card={card}
        theme={theme}
        content={
          <div className={cardContentClass(card.align)}>
            {card.blocks.map((block) => (
              <CardBlockView key={block.id} block={block} theme={theme} />
            ))}
          </div>
        }
      />
    </CardShell>
  )
}
