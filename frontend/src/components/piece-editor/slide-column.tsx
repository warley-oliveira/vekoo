import { useRef } from "react"
import { useTranslation } from "react-i18next"
import { Reorder } from "motion/react"
import { Copy, Lock, MoreHorizontal, Plus, Trash2 } from "lucide-react"

import { LayoutThumb } from "@/components/piece-editor/layout-thumb"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { CAROUSEL_MAX, CAROUSEL_MIN, type PieceDocument, type Slide } from "@/lib/piece-document"
import type { RenderLayout } from "@/lib/piece-render"
import { cn } from "@/lib/utils"

type SlideColumnProps = {
  document: PieceDocument
  activeSlideId: string
  layouts: Map<string, RenderLayout>
  /** O PNG mais recente de cada lâmina (por id), quando houver. */
  thumbnails: Map<string, string>
  onSelect: (slideId: string) => void
  onReorder: (slideId: string, toIndex: number) => void
  onAdd: () => void
  onDuplicate: (slideId: string) => void
  onRemove: (slideId: string) => void
  /** Começou e terminou um arrasto de ordem — vira um passo só de desfazer. */
  onReorderStart: () => void
  onReorderEnd: () => void
}

const THUMB = 76

/**
 * A coluna de lâminas do carrossel. Miniatura é o PNG do último render (ou a
 * esquemática do layout enquanto ele não chega) — nada de desenhar o
 * carrossel inteiro em tempo real na lateral.
 *
 * Capa e chamada final têm lugar fixo (o layout delas declara `position`):
 * editam-se, mas não se arrastam, e nada passa na frente delas.
 */
export function SlideColumn(props: SlideColumnProps) {
  const { t } = useTranslation()
  const { document, layouts } = props
  const ids = document.slides.map((slide) => slide.id)
  const locked = (slide: Slide) => Boolean(layouts.get(slide.layoutId)?.position)
  const dragged = useRef(false)

  function reorder(next: string[]) {
    // Ninguém passa à frente da capa nem para trás da chamada final.
    const valid = document.slides.every((slide, index) => !locked(slide) || next[index] === slide.id)
    if (!valid) return
    const moved = next.find((id, index) => id !== ids[index])
    if (!moved) return
    props.onReorder(moved, next.indexOf(moved))
  }

  return (
    <nav aria-label={t("pieceEditor.slides.label")} className="flex h-full min-h-0 flex-col">
      <Reorder.Group
        as="ol"
        axis="y"
        values={ids}
        onReorder={reorder}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4"
      >
        {document.slides.map((slide, index) => {
          const layout = layouts.get(slide.layoutId)
          const fixed = locked(slide)
          const active = slide.id === props.activeSlideId
          const thumbnail = props.thumbnails.get(slide.id)
          return (
            <Reorder.Item
              key={slide.id}
              value={slide.id}
              as="li"
              drag={fixed ? false : "y"}
              onDragStart={() => {
                dragged.current = true
                props.onReorderStart()
              }}
              onDragEnd={() => props.onReorderEnd()}
              className="group relative list-none"
            >
              <div className="flex items-start gap-1.5">
                <span className="w-5 pt-1 text-right font-mono text-[11px] text-vk-muted tabular-nums">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (dragged.current) {
                      dragged.current = false
                      return
                    }
                    props.onSelect(slide.id)
                  }}
                  aria-current={active ? "true" : undefined}
                  aria-label={t("pieceEditor.slides.open", { index: index + 1 })}
                  className={cn(
                    "relative block overflow-hidden border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-vk-fg/30",
                    active ? "border-vk-fg" : "border-vk-border hover:border-vk-border-strong",
                    !fixed && "cursor-grab active:cursor-grabbing"
                  )}
                  style={{ width: THUMB }}
                >
                  {thumbnail ? (
                    <img src={thumbnail} alt="" draggable={false} className="block w-full" style={{ aspectRatio: "4 / 5" }} />
                  ) : layout ? (
                    <LayoutThumb layout={layout} format={document.format} width={THUMB - 2} />
                  ) : null}
                  {fixed && (
                    <span className="absolute top-1 left-1 grid size-4 place-items-center rounded-full bg-vk-bg/90" title={t("pieceEditor.slides.lockedHint")}>
                      <Lock className="size-2.5" aria-hidden />
                    </span>
                  )}
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[popup-open]:opacity-100"
                        aria-label={t("pieceEditor.slides.menu", { index: index + 1 })}
                      />
                    }
                  >
                    <MoreHorizontal aria-hidden />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={() => props.onDuplicate(slide.id)} disabled={document.slides.length >= CAROUSEL_MAX}>
                      <Copy aria-hidden /> {t("pieceEditor.slides.duplicate")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => props.onRemove(slide.id)}
                      disabled={document.slides.length <= CAROUSEL_MIN}
                    >
                      <Trash2 aria-hidden /> {t("pieceEditor.slides.remove")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </Reorder.Item>
          )
        })}
      </Reorder.Group>
      <div className="border-t border-vk-border p-3">
        <Button
          variant="outline"
          className="h-10 w-full border-vk-border-strong bg-transparent"
          onClick={props.onAdd}
          disabled={document.slides.length >= CAROUSEL_MAX}
        >
          <Plus aria-hidden /> {t("pieceEditor.slides.add")}
        </Button>
      </div>
    </nav>
  )
}
