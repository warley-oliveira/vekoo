import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "@/lib/router"

import { PieceSlide } from "@/components/piece-render/piece-slide"
import { BASE_URL } from "@/lib/api"
import { useRenderFonts, type RenderPayload } from "@/lib/piece-render"

declare global {
  interface Window {
    /** O sinal que o Chromium do export espera (`PieceRenderers::Chromium`). */
    __vekooRender?: { status: "loading" | "ready" | "error"; error?: string }
  }
}

/**
 * `/render?version=&token=` — a peça desenhada para o Chromium do export
 * fotografar. Sem sessão (vale o token de 10 min que o servidor gerou), sem
 * chrome do app, sem texto de interface: cada lâmina no tamanho exato do
 * canvas, uma abaixo da outra, marcada por `data-slide-index`.
 *
 * Pronto = payload + fontes + todas as imagens carregadas. Antes disso, nada
 * de "ready": um PNG com a fonte de reserva seria uma peça que não existe.
 */
export function RenderPage() {
  const [params] = useSearchParams()
  const [payload, setPayload] = useState<RenderPayload | null>(null)
  const fontsReady = useRenderFonts(payload?.theme)

  useEffect(() => {
    window.__vekooRender = { status: "loading" }
    const version = params.get("version")
    const token = params.get("token")
    fetch(`${BASE_URL}/render/piece-versions/${version}?token=${encodeURIComponent(token ?? "")}`)
      .then((response) => {
        if (!response.ok) throw new Error(`payload ${response.status}`)
        return response.json() as Promise<RenderPayload>
      })
      .then(setPayload)
      .catch((error: Error) => {
        window.__vekooRender = { status: "error", error: error.message }
      })
  }, [params])

  const layouts = useMemo(() => new Map(payload?.layouts.map((layout) => [layout.id, layout])), [payload])

  useEffect(() => {
    if (!payload || !fontsReady) return
    const images = Array.from(document.images)
    void Promise.all(images.map((image) => (image.complete ? Promise.resolve() : image.decode().catch(() => undefined))))
      .then(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      .then(() => {
        window.__vekooRender = { status: "ready" }
      })
  }, [payload, fontsReady])

  if (!payload || !fontsReady) return null

  return (
    <div style={{ margin: 0, background: "#000" }}>
      {payload.document.slides.map((slide, index) => {
        const layout = layouts.get(slide.layoutId)
        if (!layout) return null
        return (
          <div key={slide.id} data-slide-index={index} style={{ width: payload.document.canvas.width }}>
            <PieceSlide
              document={payload.document}
              slide={slide}
              index={index}
              theme={payload.theme}
              assets={payload.assets}
              layout={layout}
            />
          </div>
        )
      })}
    </div>
  )
}
