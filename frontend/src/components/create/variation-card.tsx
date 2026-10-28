import { useState } from "react"
import { Link } from "react-router"
import { useTranslation } from "react-i18next"
import { motion, useReducedMotion } from "motion/react"
import { AlertTriangle, Download, ExternalLink, ImageOff, Loader2, Wand2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import type { AgentVariation } from "@/lib/agent"
import { pieceErrorMessage, pieceHref, type Piece } from "@/lib/engines"
import { slideHeadline } from "@/lib/piece-document"
import { cn } from "@/lib/utils"

type VariationCardProps = {
  variation: AgentVariation
  piece: Piece | undefined
  index: number
  onAdjust: (variation: AgentVariation) => void
  onVary: (variation: AgentVariation) => void
  disabled?: boolean
}

/**
 * Uma variação entregue: a imagem, o porquê daquela composição e o que dá
 * para fazer com ela.
 *
 * A imagem chega **depois** do texto — o agente decide num tempo, o motor
 * desenha noutro. Enquanto ela não vem, o cartão mostra o esqueleto no lugar
 * exato onde ela vai entrar, e não um vazio que salta quando preenche.
 *
 * Cantos retos na arte de propósito: é obra do usuário, e o Instagram não
 * arredonda imagem.
 */
export function VariationCard({ variation, piece, index, onAdjust, onVary, disabled }: VariationCardProps) {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const [downloading, setDownloading] = useState(false)
  const image = piece?.images[0]
  const ratio = variation.format === "story" ? "aspect-[9/16]" : variation.format === "feed_square" ? "aspect-square" : "aspect-[4/5]"
  const pending = !piece || piece.status === "queued" || piece.status === "rendering" || piece.status === "generating"
  // Peça-documento ainda sem render: o texto da primeira lâmina no lugar da
  // imagem, em vez de um carregando que não termina.
  const headline = piece?.kind === "document" ? slideHeadline(piece.document?.slides[0]) : ""

  async function download() {
    if (!image) return
    setDownloading(true)
    try {
      const response = await fetch(image.url)
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `${variation.title.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase()}.png`
      link.click()
      URL.revokeObjectURL(url)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <motion.article
      layout={!reduced}
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: "easeOut", delay: reduced ? 0 : index * 0.05 }}
      className="flex min-w-0 flex-col gap-2"
    >
      <div className={cn("relative w-full overflow-hidden border bg-muted", ratio)}>
        {image ? (
          <img src={image.url} alt={variation.title} className="size-full object-cover" loading="lazy" />
        ) : (
          <div className="flex size-full items-center justify-center">
            {piece?.status === "failed" ? (
              <AlertTriangle className="size-6 text-destructive" aria-hidden />
            ) : piece?.kind === "document" && !pending ? (
              <div className="flex size-full flex-col justify-between p-4">
                <p className="line-clamp-6 text-lg leading-tight font-semibold text-pretty">{headline}</p>
                <p className="font-mono text-[11px] text-muted-foreground">{t("pieces.documentPending")}</p>
              </div>
            ) : piece?.status === "ready" ? (
              <ImageOff className="size-6 text-muted-foreground" aria-hidden />
            ) : (
              <Skeleton className="size-full rounded-none" />
            )}
          </div>
        )}
        {piece && piece.images.length > 1 && (
          <span className="absolute top-2 right-2 rounded-full bg-background/90 px-2 py-0.5 text-[11px] font-medium">
            {t("pieces.list.frames", { count: piece.images.length })}
          </span>
        )}
      </div>

      <div className="min-w-0 space-y-0.5">
        <p className="truncate text-sm font-medium">{variation.title}</p>
        {variation.why && <p className="line-clamp-2 text-xs text-muted-foreground">{variation.why}</p>}
        {piece?.status === "failed" && (
          <p className="line-clamp-2 text-xs text-destructive">{pieceErrorMessage(t, piece)}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <Button
          size="sm"
          variant="outline"
          disabled={!image || downloading}
          onClick={() => void download()}
        >
          {downloading ? <Loader2 className="animate-spin" /> : <Download />}
          {t("agent.variation.download")}
        </Button>
        <Button size="sm" variant="ghost" disabled={disabled || pending} onClick={() => onAdjust(variation)}>
          <Wand2 /> {t("agent.variation.adjust")}
        </Button>
        <Button size="sm" variant="ghost" disabled={disabled || pending} onClick={() => onVary(variation)}>
          {t("agent.variation.vary")}
        </Button>
        {piece && (
          <Button size="sm" variant="ghost" render={<Link to={pieceHref(piece.brandId, piece.id)} />}>
            <ExternalLink /> <span className="sr-only">{t("agent.variation.open", { title: variation.title })}</span>
          </Button>
        )}
      </div>
    </motion.article>
  )
}
