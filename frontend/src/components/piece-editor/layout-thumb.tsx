import { resolveBox, resolveInset } from "@/lib/piece-geometry"
import type { DocumentFormat } from "@/lib/piece-document"
import type { RenderLayout } from "@/lib/piece-render"

/**
 * A miniatura esquemática de um layout: a geometria desenhada em blocos
 * neutros — foto em hachura, texto em barras —, sem conteúdo real. Sai da
 * mesma `geometry` que os renderizadores usam, então nunca mente sobre onde
 * as coisas ficam.
 */
export function LayoutThumb({ layout, format, width }: { layout: RenderLayout; format: DocumentFormat; width: number }) {
  const canvas = format === "story" ? { w: 1080, h: 1920 } : format === "feed_square" ? { w: 1080, h: 1080 } : { w: 1080, h: 1350 }
  const scale = width / canvas.w
  const layers = layout.geometry[format] ?? layout.geometry.default

  return (
    <div
      aria-hidden
      className="relative overflow-hidden bg-vk-faint"
      style={{ width, height: canvas.h * scale }}
    >
      {layers.map((layer, index) => {
        const box = resolveBox(layer.box, canvas.w, canvas.h)
        const left = (box.x ?? (box.right !== null && box.w !== null ? canvas.w - box.right - box.w : 0)) * scale
        switch (layer.kind) {
          case "image":
            return (
              <div
                key={index}
                className="absolute"
                style={{
                  left,
                  top: (box.y ?? 0) * scale,
                  width: (box.w ?? canvas.w) * scale,
                  height: (box.h ?? canvas.h) * scale,
                  backgroundImage: "repeating-linear-gradient(135deg, var(--vk-border) 0 2px, transparent 2px 6px)",
                }}
              />
            )
          case "stack": {
            const [top, right, bottom, leftInset] = resolveInset(layer.inset)
            const items = layer.items ?? []
            const height = items.reduce((sum, item) => sum + item.size * (item.slot === "body" ? 2.6 : 1.1), 0)
            const areaTop = box.y !== null ? box.y + top : null
            const areaBottom = box.y !== null && box.h !== null ? box.y + box.h - bottom : canvas.h - (box.bottom ?? 0) - bottom
            const y =
              layer.anchor === "bottom"
                ? areaBottom - height
                : layer.anchor === "center" && areaTop !== null
                  ? areaTop + (areaBottom - areaTop - height) / 2
                  : (areaTop ?? 0)
            const w = (box.w ?? canvas.w - (box.x ?? 0) - (box.right ?? 0)) - leftInset - right
            let cursor = y
            return items.map((item) => {
              const h = item.size * (item.slot === "body" ? 2.6 : 1.1)
              const bar = (
                <div
                  key={`${index}-${item.slot}`}
                  className="absolute rounded-[1px] bg-vk-fg"
                  style={{
                    left: left + leftInset * scale,
                    top: cursor * scale,
                    width: w * scale * (item.slot === "title" ? 0.9 : item.slot === "body" ? 0.75 : 0.4),
                    height: Math.max(h * scale * (item.slot === "body" ? 0.5 : 0.7), 1.5),
                    opacity: item.slot === "title" ? 0.7 : 0.3,
                  }}
                />
              )
              cursor += h + (layer.gap ?? 0)
              return bar
            })
          }
          case "logo":
            return (
              <div
                key={index}
                className="absolute rounded-full bg-vk-fg opacity-40"
                style={{
                  left: typeof layer.box !== "string" && layer.box.left !== undefined ? Number(layer.box.left) * scale : undefined,
                  right: typeof layer.box !== "string" && layer.box.right !== undefined ? Number(layer.box.right) * scale : undefined,
                  top: typeof layer.box !== "string" && layer.box.top !== undefined ? Number(layer.box.top) * scale : undefined,
                  bottom: typeof layer.box !== "string" && layer.box.bottom !== undefined ? Number(layer.box.bottom) * scale : undefined,
                  width: (layer.height ?? 40) * 3 * scale,
                  height: Math.max((layer.height ?? 40) * scale * 0.6, 2),
                }}
              />
            )
          default:
            return null
        }
      })}
    </div>
  )
}
