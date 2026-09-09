import { useNavigate } from "react-router"
import { useTranslation } from "react-i18next"
import { AlertTriangle, Loader2 } from "lucide-react"

import { CardArt } from "@/components/editor/card-art"
import { PieceStatusBadge } from "@/components/pieces/piece-status-badge"
import { Badge } from "@/components/ui/badge"
import { useActiveBrand } from "@/lib/brand-context"
import { pieceHref, type Piece } from "@/lib/engines"
import { formatRelative } from "@/lib/format"
import { useLanguage } from "@/lib/i18n"
import type { CarouselSummary } from "@/lib/types"
import { cn } from "@/lib/utils"

// A biblioteca de conteúdos mistura duas coisas: peças (dos motores) e
// carrosséis (do editor). `ContentItem` é a forma comum que a lista ordena,
// filtra e desenha; cada um mantém o seu objeto original para as ações.

export type ContentItem =
  | { key: string; kind: "piece"; at: number; format: string; engineId: string; piece: Piece }
  | { key: string; kind: "carousel"; at: number; format: string; engineId: "carousel"; carousel: CarouselSummary }

export function mergeContents(pieces: Piece[], carousels: CarouselSummary[]): ContentItem[] {
  const items: ContentItem[] = [
    ...pieces.map((piece): ContentItem => ({ key: `p-${piece.id}`, kind: "piece", at: piece.createdAt, format: piece.format, engineId: piece.engineId, piece })),
    ...carousels.map((carousel): ContentItem => ({ key: `c-${carousel.id}`, kind: "carousel", at: carousel.editedAt, format: carousel.format, engineId: "carousel", carousel })),
  ]
  return items.sort((a, b) => b.at - a.at)
}

export function ContentCard({ item }: { item: ContentItem }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const navigate = useNavigate()
  const { path } = useActiveBrand()

  if (item.kind === "carousel") {
    const { carousel } = item
    return (
      <button
        type="button"
        onClick={() => navigate(path(`/carousels/${carousel.id}/edit`))}
        aria-label={t("carousels.openAria", { title: carousel.title })}
        className="group flex w-full flex-col gap-2 rounded-lg text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <div className={cn("w-full overflow-hidden border", carousel.format === "1:1" ? "aspect-square" : "aspect-[4/5]")}>
          <CardArt card={carousel.cards[0]} theme={carousel.theme} format={carousel.format} />
        </div>
        <div className="min-w-0 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-medium">{carousel.title}</p>
            <Badge variant="outline">{t("contents.kind.carousel")}</Badge>
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {t("contents.meta", {
              format: carousel.format,
              when: formatRelative(carousel.editedAt, language),
              version: carousel.brandCoreVersion ? `v${carousel.brandCoreVersion}` : "—",
            })}
          </p>
        </div>
      </button>
    )
  }

  const { piece } = item
  const first = piece.images[0]
  return (
    <button
      type="button"
      onClick={() => navigate(pieceHref(piece.brandId, piece.id))}
      aria-label={t("pieces.list.openAria", { title: piece.title })}
      className="group flex w-full flex-col gap-2 rounded-lg text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <div className={cn("relative w-full overflow-hidden border bg-muted", piece.format === "story" ? "aspect-[9/16]" : "aspect-[4/5]")}>
        {first ? (
          <img src={first.url} alt="" className={cn("size-full object-cover", piece.outdated && "opacity-80")} loading="lazy" />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            {piece.status === "failed" ? <AlertTriangle className="size-6 text-destructive" /> : <Loader2 className="size-6 animate-spin" />}
          </div>
        )}
        {piece.images.length > 1 && (
          <span className="absolute top-2 right-2 rounded-full bg-background/90 px-2 py-0.5 text-[11px] font-medium">
            {t("pieces.list.frames", { count: piece.images.length })}
          </span>
        )}
      </div>
      <div className="min-w-0 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium">{piece.title}</p>
          <PieceStatusBadge piece={piece} />
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {piece.engineName} · {t("contents.meta", {
            format: t(`pieces.catalog.formatShort.${piece.format}`),
            when: formatRelative(piece.createdAt, language),
            version: piece.brandCoreVersion ? `v${piece.brandCoreVersion}` : "—",
          })}
        </p>
      </div>
    </button>
  )
}
