import { useState } from "react"
import { useTranslation } from "react-i18next"
import { AlertTriangle, Download, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { usePieceMutations } from "@/hooks/use-pieces"
import type { Piece, PieceRenderer } from "@/lib/engines"
import { cn } from "@/lib/utils"

const RENDERER_KEY = "vekoo.renderer"
const RENDERERS: PieceRenderer[] = ["react", "libvips"]

function storedRenderer(): PieceRenderer {
  try {
    const value = localStorage.getItem(RENDERER_KEY)
    return value === "libvips" ? "libvips" : "react"
  } catch {
    return "react"
  }
}

/**
 * Os PNGs de uma peça-documento, pelo renderizador escolhido: **navegador**
 * (o React do preview, fotografado por um Chromium) ou **servidor** (libvips).
 * Os dois desenham a mesma geometria; o seletor existe para comparar e
 * escolher. A escolha fica lembrada neste navegador.
 */
export function DocumentRenders({ piece }: { piece: Piece }) {
  const { t } = useTranslation()
  const { renderDocument } = usePieceMutations(piece.brandId)
  const [renderer, setRenderer] = useState<PieceRenderer>(storedRenderer)
  const [requested, setRequested] = useState<PieceRenderer | null>(null)
  const images = piece.renders?.[renderer] ?? []
  const ratio = piece.format === "story" ? "aspect-[9/16]" : piece.format === "feed_square" ? "aspect-square" : "aspect-[4/5]"
  const waiting = requested === renderer && images.length === 0 && !piece.error

  function choose(next: PieceRenderer) {
    setRenderer(next)
    try {
      localStorage.setItem(RENDERER_KEY, next)
    } catch {
      // Sem armazenamento, só não lembra.
    }
  }

  async function render() {
    setRequested(renderer)
    try {
      await renderDocument(piece.id, renderer)
    } catch {
      setRequested(null)
      toast.error(t("pieces.renderers.failed"))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-xs text-muted-foreground">{t("pieces.renderers.label")}</span>
        <ToggleGroup
          value={[renderer]}
          onValueChange={(value) => {
            const next = value[0] as PieceRenderer | undefined
            if (next) choose(next)
          }}
          variant="outline"
          spacing={0}
          aria-label={t("pieces.renderers.label")}
        >
          {RENDERERS.map((name) => (
            <ToggleGroupItem key={name} value={name}>
              {t(`pieces.renderers.${name}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {images.length > 0 && (
          <Button variant="ghost" size="sm" className="h-10" onClick={() => void render()}>
            {t("pieces.renderers.again")}
          </Button>
        )}
      </div>

      {images.length === 0 ? (
        <div className={cn("flex w-full max-w-md flex-col items-center justify-center gap-3 border bg-muted p-6 text-center text-sm text-muted-foreground", ratio)}>
          {piece.error ? (
            <>
              <AlertTriangle className="size-6 text-destructive" aria-hidden />
              <p>{t("pieces.renderers.error")}</p>
            </>
          ) : waiting ? (
            <>
              <Loader2 className="size-6 animate-spin" aria-hidden />
              <p>{t("pieces.renderers.rendering", { renderer: t(`pieces.renderers.${renderer}`) })}</p>
            </>
          ) : (
            <>
              <p>{t("pieces.renderers.empty", { renderer: t(`pieces.renderers.${renderer}`) })}</p>
              <Button className="h-10" onClick={() => void render()}>
                {t("pieces.renderers.render")}
              </Button>
            </>
          )}
        </div>
      ) : (
        <ul className={cn("grid gap-4", images.length > 1 ? "grid-cols-2 md:grid-cols-3" : "max-w-md")}>
          {images.map((image) => (
            <li key={`${renderer}-${image.index}`} className="space-y-2">
              <img
                src={image.url}
                alt={t("pieces.detail.frame", { index: image.index })}
                className={cn("w-full border object-cover", ratio)}
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-mono">
                  {t("pieces.detail.frame", { index: image.index })} · {image.width}×{image.height}
                </span>
                <a
                  href={image.url}
                  download
                  className="inline-flex items-center gap-1 rounded font-medium text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <Download className="size-3.5" aria-hidden /> {t("pieces.detail.download")}
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
