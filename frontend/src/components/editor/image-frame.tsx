import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { useTranslation } from "react-i18next"

import { CardImage } from "@/components/editor/card-image"
import { Section } from "@/components/editor/panel-controls"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { CENTER_FRAME, type CarouselTheme, type ImageSpec } from "@/lib/doc"

// Enquadramento: arrastar dentro da moldura move o ponto que sobrevive ao
// corte; o cursor vai para o lado contrário do arrasto, como em qualquer
// visualizador — puxar a imagem para a esquerda revela o que está à direita.

const ZOOM_MIN = 1
const ZOOM_MAX = 2.5

export function ImageFrame({
  image,
  theme,
  onChange,
}: {
  image: ImageSpec
  theme: CarouselTheme
  onChange: (image: ImageSpec) => void
}) {
  const { t } = useTranslation()
  const box = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(true)
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging) return
    const rect = box.current?.getBoundingClientRect()
    if (!rect) return
    const clamp = (value: number) => Math.min(1, Math.max(0, value))
    onChange({
      ...image,
      focus: {
        x: clamp(image.focus.x - e.movementX / rect.width),
        y: clamp(image.focus.y - e.movementY / rect.height),
      },
    })
  }

  const centered =
    image.focus.x === 0.5 && image.focus.y === 0.5 && image.zoom === 1

  return (
    <>
      <Section label={t("editor.cardPanel.framing")}>
        <div
          ref={box}
          role="group"
          aria-label={t("editor.cardPanel.framingAria")}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => setDragging(false)}
          onPointerCancel={() => setDragging(false)}
          className="relative aspect-4/5 w-full cursor-grab touch-none overflow-hidden rounded-md border active:cursor-grabbing"
        >
          <CardImage image={image} theme={theme} />
          {/* Terços: onde o Instagram costuma cortar o olhar. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              backgroundImage:
                "linear-gradient(to right, transparent 33.2%, currentColor 33.2%, currentColor 33.5%, transparent 33.5%, transparent 66.2%, currentColor 66.2%, currentColor 66.5%, transparent 66.5%), linear-gradient(to bottom, transparent 33.2%, currentColor 33.2%, currentColor 33.5%, transparent 33.5%, transparent 66.2%, currentColor 66.2%, currentColor 66.5%, transparent 66.5%)",
              color: "oklch(1 0 0 / 0.5)",
            }}
          />
        </div>
      </Section>

      <Section label={t("editor.cardPanel.zoom")}>
        <Slider
          value={[image.zoom]}
          min={ZOOM_MIN}
          max={ZOOM_MAX}
          step={0.05}
          onValueChange={(value) => {
            const next = Array.isArray(value) ? value[0] : value
            onChange({ ...image, zoom: next })
          }}
          aria-label={t("editor.cardPanel.zoom")}
        />
      </Section>

      {!centered && (
        <Button
          variant="ghost"
          size="sm"
          className="-mt-2 -ml-2 h-7 text-xs text-muted-foreground"
          onClick={() => onChange({ ...image, ...CENTER_FRAME })}
        >
          {t("editor.cardPanel.resetFraming")}
        </Button>
      )}
    </>
  )
}
