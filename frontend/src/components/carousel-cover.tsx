import type { CSSProperties } from "react"

import type { CoverSpec } from "@/lib/mock-data"
import { cn } from "@/lib/utils"

// A capa é a arte real do card 1 do carrossel — nunca um retângulo cinza.
// Tipografia dimensionada em cqw para a mesma capa funcionar do thumbnail da
// busca ao mosaico da tela de entrada. Cantos retos de propósito: Instagram
// não arredonda imagem, e é isso que separa a obra da ferramenta.

type CarouselCoverProps = {
  cover: CoverSpec
  className?: string
}

export function CarouselCover({ cover, className }: CarouselCoverProps) {
  const style: CSSProperties = {
    containerType: "inline-size",
    backgroundColor: cover.bg,
    color: cover.ink,
  }

  return (
    <div
      aria-hidden
      style={style}
      className={cn(
        "relative aspect-[4/5] w-full overflow-hidden rounded-none select-none",
        className
      )}
    >
      {cover.layout === "poster" && <PosterLayout cover={cover} />}
      {cover.layout === "editorial" && <EditorialLayout cover={cover} />}
      {cover.layout === "split" && <SplitLayout cover={cover} />}
      {cover.layout === "badge" && <BadgeLayout cover={cover} />}
    </div>
  )
}

function Kicker({ cover, className }: CarouselCoverProps) {
  if (!cover.kicker) return null
  return (
    <p
      className={cn(
        "text-[4.2cqw] font-semibold tracking-[0.14em] uppercase opacity-90",
        className
      )}
    >
      {cover.kicker}
    </p>
  )
}

function Footer({ cover, className }: CarouselCoverProps) {
  if (!cover.footer) return null
  return (
    <div className={cn("flex items-center justify-between gap-2", className)}>
      <p className="truncate text-[3.8cqw] font-medium opacity-80">
        {cover.footer}
      </p>
      <span
        style={{ backgroundColor: cover.accent, color: cover.bg }}
        className="flex size-[8cqw] shrink-0 items-center justify-center text-[4.5cqw] leading-none font-bold"
      >
        →
      </span>
    </div>
  )
}

function PosterLayout({ cover }: CarouselCoverProps) {
  return (
    <div className="flex h-full flex-col justify-between p-[7cqw]">
      <div className="flex items-center gap-[2.5cqw]">
        <span
          style={{ backgroundColor: cover.accent }}
          className="h-[1.2cqw] w-[9cqw]"
        />
        <Kicker cover={cover} />
      </div>
      <h3 className="font-heading text-[11.5cqw] leading-[1.04] font-bold tracking-tight text-balance">
        {cover.title}
      </h3>
      <Footer cover={cover} />
    </div>
  )
}

function EditorialLayout({ cover }: CarouselCoverProps) {
  return (
    <div className="flex h-full flex-col p-[7cqw]">
      <div
        style={{ borderColor: cover.ink }}
        className="border-b-[0.6cqw] pb-[3.5cqw]"
      >
        <Kicker cover={cover} />
      </div>
      <div className="flex flex-1 items-center">
        <h3 className="font-heading text-[10cqw] leading-[1.08] font-bold tracking-tight text-balance">
          {cover.title}
        </h3>
      </div>
      <div
        style={{ borderColor: cover.ink }}
        className="border-t-[0.3cqw] pt-[3.5cqw]"
      >
        <Footer cover={cover} />
      </div>
    </div>
  )
}

function SplitLayout({ cover }: CarouselCoverProps) {
  return (
    <div className="flex h-full flex-col">
      <div
        style={{ backgroundColor: cover.accent, color: cover.bg }}
        className="flex basis-[42%] items-end p-[7cqw]"
      >
        <p className="font-heading text-[8cqw] leading-[1.05] font-bold tracking-tight uppercase">
          {cover.kicker}
        </p>
      </div>
      <div className="flex flex-1 flex-col justify-between p-[7cqw]">
        <h3 className="font-heading text-[9.5cqw] leading-[1.06] font-bold tracking-tight text-balance">
          {cover.title}
        </h3>
        <Footer cover={cover} />
      </div>
    </div>
  )
}

function BadgeLayout({ cover }: CarouselCoverProps) {
  return (
    <div className="flex h-full flex-col items-center justify-between p-[7cqw] text-center">
      {cover.kicker ? (
        <span
          style={{ borderColor: cover.accent, color: cover.ink }}
          className="rounded-full border-[0.5cqw] px-[4cqw] py-[1.5cqw] text-[3.8cqw] font-semibold tracking-[0.14em] uppercase"
        >
          {cover.kicker}
        </span>
      ) : (
        <span />
      )}
      <h3 className="font-heading text-[10.5cqw] leading-[1.06] font-bold tracking-tight text-balance">
        {cover.title}
      </h3>
      <div className="w-full">
        <div
          style={{ backgroundColor: cover.accent }}
          className="mx-auto mb-[4cqw] h-[1cqw] w-[14cqw]"
        />
        <p className="truncate text-[3.8cqw] font-medium opacity-80">
          {cover.footer}
        </p>
      </div>
    </div>
  )
}
