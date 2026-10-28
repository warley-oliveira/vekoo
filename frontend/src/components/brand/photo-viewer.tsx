import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ChevronLeft, ChevronRight, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { formatBytes, type BrandAsset } from "@/lib/brand-core"
import { formatShortDate } from "@/lib/format"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"

type PhotoViewerProps = {
  photos: BrandAsset[]
  /** A foto aberta; `null` fecha. */
  index: number | null
  onIndexChange: (index: number | null) => void
  /** Ações sobre a foto aberta (remover, por exemplo), na barra de cima. */
  actions?: (photo: BrandAsset) => ReactNode
}

// Arrastar menos que isso é toque, não passada.
const SWIPE_PX = 48

/**
 * As fotos da marca uma por uma, em tamanho de ver: setas na tela, ← e → no
 * teclado, arrastar no celular, e a fileira de miniaturas para pular direto.
 *
 * Fundo escuro de propósito — é a obra dela em cima, e foto se julga melhor
 * sem a interface competindo. A foto removida daqui sai da lista: o visor
 * fica na vizinha ou fecha se não sobrou nenhuma.
 */
export function PhotoViewer({ photos, index, onIndexChange, actions }: PhotoViewerProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const reduced = useReducedMotion()
  // De que lado a próxima foto entra: 1 = veio da direita (avançou).
  const [direction, setDirection] = useState(0)
  const swipeStart = useRef<number | null>(null)
  const strip = useRef<HTMLOListElement>(null)

  const open = index !== null && photos.length > 0
  const current = open ? Math.min(index, photos.length - 1) : 0
  const photo = open ? photos[current] : undefined

  // A lista encolheu (foto removida) por baixo do visor.
  useEffect(() => {
    if (index === null) return
    if (photos.length === 0) onIndexChange(null)
    else if (index > photos.length - 1) onIndexChange(photos.length - 1)
  }, [index, photos.length, onIndexChange])

  // A miniatura da foto aberta sempre à vista na fileira.
  useEffect(() => {
    if (!open) return
    strip.current
      ?.querySelector<HTMLElement>(`[data-index="${current}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: reduced ? "auto" : "smooth" })
  }, [open, current, reduced])

  function go(next: number) {
    if (!open || photos.length < 2) return
    const wrapped = (next + photos.length) % photos.length
    setDirection(next > current ? 1 : -1)
    onIndexChange(wrapped)
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "ArrowRight") {
      event.preventDefault()
      go(current + 1)
    } else if (event.key === "ArrowLeft") {
      event.preventDefault()
      go(current - 1)
    }
  }

  function onPointerDown(event: PointerEvent) {
    if (event.pointerType !== "mouse") swipeStart.current = event.clientX
  }

  function onPointerUp(event: PointerEvent) {
    if (swipeStart.current === null) return
    const delta = event.clientX - swipeStart.current
    swipeStart.current = null
    if (Math.abs(delta) >= SWIPE_PX) go(current + (delta < 0 ? 1 : -1))
  }

  const offset = reduced ? 0 : 32

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onIndexChange(null)}>
      <DialogContent
        showCloseButton={false}
        onKeyDown={onKeyDown}
        className="flex h-[min(92dvh,56rem)] w-full flex-col gap-0 overflow-hidden bg-foreground p-0 text-background ring-0 sm:max-w-[min(92vw,72rem)]"
      >
        {photo && (
          <>
            <header className="flex items-center gap-3 px-3 py-2 sm:px-4">
              <DialogTitle className="sr-only">{t("brand.assets.viewer.title")}</DialogTitle>
              <p className="shrink-0 font-mono text-xs text-background/70" aria-live="polite">
                {t("brand.assets.viewer.counter", { current: current + 1, total: photos.length })}
              </p>
              <p className="min-w-0 flex-1 truncate text-sm" title={photo.name}>
                {photo.name}
              </p>
              <div className="flex shrink-0 items-center gap-1">
                {actions?.(photo)}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-background hover:bg-background/10 hover:text-background"
                  onClick={() => onIndexChange(null)}
                  aria-label={t("brand.assets.viewer.close")}
                >
                  <X />
                </Button>
              </div>
            </header>

            <div
              className="relative flex min-h-0 flex-1 touch-pan-y items-center justify-center overflow-hidden select-none"
              onPointerDown={onPointerDown}
              onPointerUp={onPointerUp}
              onPointerCancel={() => (swipeStart.current = null)}
            >
              <AnimatePresence initial={false} custom={direction} mode="popLayout">
                <motion.img
                  key={photo.id}
                  src={photo.url}
                  alt={photo.name}
                  draggable={false}
                  custom={direction}
                  variants={{
                    enter: (dir: number) => ({ opacity: 0, x: dir * offset }),
                    center: { opacity: 1, x: 0 },
                    exit: (dir: number) => ({ opacity: 0, x: dir * -offset }),
                  }}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: reduced ? 0.12 : 0.22, ease: "easeOut" }}
                  className="max-h-full max-w-full object-contain px-3 sm:px-16"
                />
              </AnimatePresence>

              {photos.length > 1 && (
                <>
                  <StageArrow side="left" label={t("brand.assets.viewer.previous")} onClick={() => go(current - 1)} />
                  <StageArrow side="right" label={t("brand.assets.viewer.next")} onClick={() => go(current + 1)} />
                </>
              )}
            </div>

            <footer className="space-y-2 px-3 pt-2 pb-3 sm:px-4">
              <p className="font-mono text-[11px] text-background/60">
                {[
                  photo.width && photo.height
                    ? t("brand.assets.viewer.size", { width: photo.width, height: photo.height })
                    : null,
                  formatBytes(photo.byteSize, language),
                  formatShortDate(photo.createdAt, language),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {photos.length > 1 && (
                <ol ref={strip} className="flex gap-2 overflow-x-auto pb-1" aria-label={t("brand.assets.viewer.strip")}>
                  {photos.map((item, i) => (
                    <li key={item.id} data-index={i} className="shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setDirection(i > current ? 1 : -1)
                          onIndexChange(i)
                        }}
                        aria-label={t("brand.assets.viewer.goTo", { index: i + 1 })}
                        aria-current={i === current}
                        className={cn(
                          // Cantos retos: é a obra.
                          "block size-14 overflow-hidden outline-none transition-[opacity,box-shadow] focus-visible:ring-3 focus-visible:ring-ring",
                          i === current ? "ring-2 ring-primary" : "opacity-50 hover:opacity-90"
                        )}
                      >
                        <img src={item.url} alt="" className="size-full object-cover" draggable={false} />
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </footer>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function StageArrow({ side, label, onClick }: { side: "left" | "right"; label: string; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight
  return (
    <Button
      type="button"
      variant="secondary"
      size="icon-lg"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "absolute top-1/2 hidden -translate-y-1/2 rounded-full opacity-80 hover:opacity-100 sm:inline-flex",
        side === "left" ? "left-3" : "right-3"
      )}
    >
      <Icon />
    </Button>
  )
}
