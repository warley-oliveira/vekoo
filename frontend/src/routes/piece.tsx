import { useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { useTranslation } from "react-i18next"
import { AlertTriangle, ArrowLeft, Download, Loader2, RefreshCw, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { ErrorState } from "@/components/error-state"
import { PieceStatusBadge } from "@/components/pieces/piece-status-badge"
import { ProvenancePanel } from "@/components/pieces/provenance-panel"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useEngine } from "@/hooks/use-engines"
import { usePiece, usePieceMutations } from "@/hooks/use-pieces"
import { usePiecesLive } from "@/hooks/use-pieces-live"
import { useActiveBrand } from "@/lib/brand-context"
import { pieceErrorMessage, type Piece } from "@/lib/engines"
import { cn } from "@/lib/utils"

/** `/pieces/:pieceId` — as imagens, os campos e a proveniência de uma peça. */
export function PiecePage() {
  const { t } = useTranslation()
  const { pieceId } = useParams()
  const navigate = useNavigate()
  const { brandId, path } = useActiveBrand()
  const { piece, isLoading, error, reload } = usePiece(brandId, pieceId)
  const { engine } = useEngine(piece?.engineId)
  const { regenerate, remove } = usePieceMutations(brandId)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [working, setWorking] = useState(false)

  usePiecesLive((event) => {
    if (event.piece.id !== pieceId) return
    if (event.piece.status === "ready") toast(t("pieces.live.ready", { title: event.piece.title }))
    if (event.piece.status === "failed") toast.error(t("pieces.live.failed", { title: event.piece.title }))
  })

  if (error && !piece) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 md:px-6">
        <ErrorState error={error} onRetry={reload} />
      </div>
    )
  }
  if (isLoading || !piece) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-6" aria-busy>
        <Skeleton className="h-7 w-64" />
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Skeleton className="aspect-[4/5] w-full max-w-md rounded-none" />
          <Skeleton className="h-64" />
        </div>
      </div>
    )
  }

  async function onRegenerate() {
    setWorking(true)
    try {
      await regenerate(piece!.id)
      toast(t("pieces.detail.regeneratedToast"))
    } catch {
      toast.error(t("pieces.detail.regenerateFailed"))
    } finally {
      setWorking(false)
    }
  }

  async function onDelete() {
    try {
      await remove(piece!.id)
      toast(t("pieces.detail.deletedToast"))
      navigate(path("/contents"))
    } catch {
      toast.error(t("pieces.detail.deleteFailed"))
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Link to={path("/contents")} className="inline-flex items-center gap-1 rounded text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
            <ArrowLeft className="size-3.5" /> {t("pieces.detail.back")}
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-2xl font-semibold tracking-tight">{piece.title}</h1>
            <PieceStatusBadge piece={piece} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {piece.engineName} · {t(`pieces.catalog.formats.${piece.format}`)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void onRegenerate()} disabled={working || piece.status === "rendering" || piece.status === "queued"}>
            {working ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            {t("pieces.detail.regenerate")}
          </Button>
          <Button variant="ghost" onClick={() => setConfirmDelete(true)} aria-label={t("pieces.detail.delete")}>
            <Trash2 />
          </Button>
        </div>
      </header>

      {piece.outdated && (
        <aside className="mt-5 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 text-sm">
          <RefreshCw className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-medium">{t("pieces.detail.outdatedTitle")}</p>
            <p className="text-muted-foreground">{t("pieces.detail.outdatedDescription")}</p>
          </div>
          <Button size="sm" onClick={() => void onRegenerate()} disabled={working}>{t("pieces.detail.regenerate")}</Button>
        </aside>
      )}

      {piece.status === "failed" && (
        <aside role="alert" className="mt-5 flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <AlertTriangle className="size-4 shrink-0 text-destructive" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-medium">{t("pieces.detail.failedTitle")}</p>
            <p className="text-muted-foreground">{pieceErrorMessage(t, piece)}</p>
          </div>
        </aside>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <PieceImages piece={piece} />

        <div className="space-y-4">
          <section className="rounded-lg border p-4" aria-label={t("pieces.detail.values")}>
            <h2 className="text-sm font-medium">{t("pieces.detail.values")}</h2>
            <dl className="mt-2 space-y-2 text-sm">
              {(engine?.fields ?? []).map((field) => {
                const value = piece.values[field.id]
                if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) return null
                return (
                  <div key={field.id}>
                    <dt className="text-xs text-muted-foreground">{field.label}</dt>
                    <dd className="whitespace-pre-line">
                      {Array.isArray(value) ? value.join("\n") : String(value)}
                    </dd>
                  </div>
                )
              })}
            </dl>
          </section>
          <ProvenancePanel piece={piece} />
        </div>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("pieces.detail.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("pieces.detail.deleteDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void onDelete()}>{t("pieces.detail.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function PieceImages({ piece }: { piece: Piece }) {
  const { t } = useTranslation()
  const ratio = piece.format === "story" ? "aspect-[9/16]" : "aspect-[4/5]"

  if (piece.images.length === 0) {
    return (
      <div className={cn("flex w-full max-w-md items-center justify-center border bg-muted p-6 text-center text-sm text-muted-foreground", ratio)}>
        {piece.status === "failed" ? <AlertTriangle className="size-6 text-destructive" /> : (
          <span className="flex flex-col items-center gap-2"><Loader2 className="size-6 animate-spin" /> {t("pieces.detail.waiting")}</span>
        )}
      </div>
    )
  }

  return (
    <ul className={cn("grid gap-4", piece.images.length > 1 ? "grid-cols-2 md:grid-cols-3" : "max-w-md")}>
      {piece.images.map((image) => (
        <li key={image.index} className="space-y-2">
          <img src={image.url} alt={t("pieces.detail.frame", { index: image.index })} className={cn("w-full border object-cover", ratio, piece.outdated && "opacity-80")} />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{t("pieces.detail.frame", { index: image.index })}</span>
            <a
              href={image.url}
              download
              className="inline-flex items-center gap-1 rounded font-medium text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Download className="size-3.5" /> {t("pieces.detail.download")}
            </a>
          </div>
        </li>
      ))}
    </ul>
  )
}
