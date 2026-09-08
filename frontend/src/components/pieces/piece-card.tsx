import { useNavigate } from "react-router"
import { useTranslation } from "react-i18next"
import { AlertTriangle, ImageOff, Loader2 } from "lucide-react"

import { PieceStatusBadge } from "@/components/pieces/piece-status-badge"
import { formatRelative } from "@/lib/format"
import { pieceErrorMessage, pieceHref, type Piece } from "@/lib/engines"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/** Uma peça na grade: a primeira imagem (cantos retos, é obra), estado e nome. */
export function PieceCard({ piece }: { piece: Piece }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const navigate = useNavigate()
  const first = piece.images[0]
  const ratio = piece.format === "story" ? "aspect-[9/16]" : "aspect-[4/5]"

  return (
    <button
      type="button"
      onClick={() => navigate(pieceHref(piece.id))}
      aria-label={t("pieces.list.openAria", { title: piece.title })}
      className="group flex w-full flex-col gap-2 rounded-lg text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <div className={cn("relative w-full overflow-hidden border bg-muted", ratio)}>
        {first ? (
          <img src={first.url} alt="" className={cn("size-full object-cover transition-opacity", piece.stale && "opacity-70")} loading="lazy" />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            {piece.status === "failed" ? (
              <AlertTriangle className="size-6 text-destructive" />
            ) : piece.status === "ready" ? (
              <ImageOff className="size-6" />
            ) : (
              <Loader2 className="size-6 animate-spin" />
            )}
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
          {piece.engineName} · {formatRelative(piece.createdAt, language)}
        </p>
        {piece.status === "failed" && (
          <p className="line-clamp-2 text-xs text-destructive">{pieceErrorMessage(t, piece)}</p>
        )}
      </div>
    </button>
  )
}
