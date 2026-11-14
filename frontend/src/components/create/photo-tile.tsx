import { useState } from "react"
import { useTranslation } from "react-i18next"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { AlertTriangle, Download, Loader2, Maximize2, WandSparkles } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { useElapsed } from "@/hooks/use-elapsed"
import type { AgentStep } from "@/lib/agent"
import type { BrandAsset } from "@/lib/brand-core"
import { downloadUrl, fileSlug } from "@/lib/download"
import { cn } from "@/lib/utils"

/** A curva do "assentar": rápida no começo, macia no fim — como foto revelando. */
const SETTLE = [0.22, 1, 0.36, 1] as const
/** Foto que saiu há mais que isso não revela de novo: reabrir a conversa não é espetáculo. */
const FRESH_MS = 90_000

type PhotoTileProps = {
  step: AgentStep
  /** A foto pronta; sem ela o ladrilho está revelando (ou falhou). */
  asset?: BrandAsset
  index?: number
  /** `strip`: miniatura na faixa acima das peças, ações só em ícone. */
  size?: "result" | "strip"
  /** "Usar numa peça": a foto vai como anexo para o próximo pedido. */
  onUse?: (asset: BrandAsset) => void
  disabled?: boolean
}

/**
 * Uma foto criada pelo agente, do véu à imagem.
 *
 * Enquanto o gerador trabalha, o lugar exato da foto (na proporção pedida)
 * tem o holográfico desfocado à deriva — nada salta quando ela chega. Quando
 * chega, ela **assenta**: entra desfocada e um pouco maior e foca no lugar,
 * como uma Polaroid. Só depois de carregada, para o desfoque não acontecer
 * sobre um vazio.
 *
 * Cantos retos: é obra da pessoa, e o Instagram não arredonda imagem.
 */
export function PhotoTile({ step, asset, index = 0, size = "result", onUse, disabled }: PhotoTileProps) {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const [loaded, setLoaded] = useState(false)
  const [zoom, setZoom] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const running = step.status === "running"
  const seconds = useElapsed(step.startedAt, running, step.finishedAt)
  const strip = size === "strip"
  const ratio = step.aspectRatio.replace(":", " / ")
  // `useState` congela no primeiro desenho: a foto que era nova continua
  // revelando mesmo que o relógio passe do limite enquanto ela carrega.
  const [fresh] = useState(() => !reduced && (!step.finishedAt || Date.now() - step.finishedAt < FRESH_MS))

  async function download() {
    if (!asset) return
    setDownloading(true)
    try {
      await downloadUrl(asset.url, `${fileSlug(step.caption, "foto")}-${index + 1}.${asset.contentType.includes("jpeg") ? "jpg" : "png"}`)
    } catch {
      toast.error(t("agent.photo.downloadFailed"))
    } finally {
      setDownloading(false)
    }
  }

  return (
    <motion.figure
      initial={reduced ? false : { opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={reduced ? { duration: 0 } : { type: "spring", bounce: 0.06, duration: 0.5, delay: index * 0.07 }}
      className="flex min-w-0 flex-col gap-2"
    >
      <div className="relative w-full overflow-hidden border border-vk-border" style={{ aspectRatio: ratio }}>
        <AnimatePresence initial={false}>
          {!asset || !loaded ? (
            <motion.div
              key="developing"
              exit={reduced ? undefined : { opacity: 0 }}
              transition={{ duration: 0.45, ease: "easeOut" }}
              className={cn("absolute inset-0", step.status === "failed" ? "bg-vk-faint" : "photo-developing")}
              aria-hidden={Boolean(asset)}
            >
              {!strip && (
                <span className="absolute bottom-3 left-3 flex items-center gap-1.5 font-mono text-[11px] text-vk-muted">
                  {step.status === "failed" ? (
                    <>
                      <AlertTriangle className="size-3.5 text-destructive" aria-hidden /> {t("agent.photo.notOut")}
                    </>
                  ) : (
                    <>
                      <span className="size-1.5 animate-pulse rounded-full bg-vk-fg/60" aria-hidden />
                      {t("agent.photo.developing", { seconds })}
                    </>
                  )}
                </span>
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>

        {asset && (
          <button
            type="button"
            onClick={() => setZoom(true)}
            className="group absolute inset-0 block outline-none focus-visible:ring-2 focus-visible:ring-vk-fg/40 focus-visible:ring-inset"
            aria-label={t("agent.photo.zoom", { caption: step.caption })}
          >
            <motion.img
              src={asset.url}
              alt={step.caption}
              onLoad={() => setLoaded(true)}
              initial={false}
              animate={
                loaded
                  ? { opacity: 1, scale: 1, filter: "blur(0px)" }
                  : { opacity: 0, scale: fresh ? 1.06 : 1, filter: fresh ? "blur(18px)" : "blur(0px)" }
              }
              transition={fresh ? { duration: 0.9, ease: SETTLE, delay: index * 0.08 } : { duration: 0.2 }}
              className="size-full object-cover will-change-[filter,transform]"
              draggable={false}
            />
            <span className="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-vk-bg/85 text-vk-fg opacity-0 shadow-sm transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
              <Maximize2 className="size-3.5" aria-hidden />
            </span>
          </button>
        )}
      </div>

      {!strip && asset && (
        <div className="flex flex-wrap items-center gap-1">
          <Button size="sm" variant="outline" onClick={() => void download()} disabled={downloading}>
            {downloading ? <Loader2 className="animate-spin" /> : <Download />}
            {t("agent.photo.download")}
          </Button>
          {onUse && (
            <Button size="sm" variant="ghost" onClick={() => onUse(asset)} disabled={disabled}>
              <WandSparkles /> {t("agent.photo.use")}
            </Button>
          )}
        </div>
      )}

      {asset && (
        <Dialog open={zoom} onOpenChange={setZoom}>
          <DialogContent className="max-w-[min(92vw,56rem)] gap-3 p-3 sm:max-w-[min(92vw,56rem)]">
            <DialogTitle className="sr-only">{step.caption}</DialogTitle>
            <DialogDescription className="sr-only">{t("agent.photo.zoomHint")}</DialogDescription>
            <img src={asset.url} alt={step.caption} className="mx-auto max-h-[78dvh] w-auto object-contain" />
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <p className="min-w-0 truncate font-mono text-[11px] text-vk-muted">{step.caption}</p>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="outline" onClick={() => void download()} disabled={downloading}>
                  {downloading ? <Loader2 className="animate-spin" /> : <Download />}
                  {t("agent.photo.download")}
                </Button>
                {onUse && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setZoom(false)
                      onUse(asset)
                    }}
                    disabled={disabled}
                  >
                    <WandSparkles /> {t("agent.photo.use")}
                  </Button>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </motion.figure>
  )
}
