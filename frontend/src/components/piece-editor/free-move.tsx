import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react"

import { FRAME_MIN, SAFE, type Block, type Frame, type PieceDocument, type Slide } from "@/lib/piece-document"
import { clampFrame, type Operation } from "@/lib/piece-operations"

// Arrasto livre no preview do editor: mover, redimensionar e as guias que
// grudam. Tudo em px do canvas — a escala do preview só entra na conversão
// do ponteiro. O resultado é sempre uma operação `set_frame`, o mesmo
// caminho de qualquer outra mudança (desfazer, salvar, conferir no servidor).

/** Quanto o ponteiro anda antes de o clique virar arrasto (px de tela). */
const DRAG_THRESHOLD = 4
/** A que distância uma borda gruda numa guia (px de tela). */
const SNAP = 8

type Rect = { x: number; y: number; w: number; h: number }
type Guide = { axis: "x" | "y"; at: number }
type Handle = "nw" | "ne" | "sw" | "se" | "w" | "e"

type Gesture = {
  slot: string
  kind: "move" | "resize"
  handle?: Handle
  pointerX: number
  pointerY: number
  start: Rect
  started: boolean
  targets: { xs: number[]; ys: number[] }
  aspect: number
}

type FreeMoveOptions = {
  rootRef: RefObject<HTMLDivElement | null>
  document: PieceDocument
  slide: Slide
  scale: number
  selectedSlot: string | null
  /** Inline ou ponto focal: o arrasto não disputa o ponteiro. */
  locked: boolean
  apply: (operations: Operation[], group?: string) => void
  select: (slot: string) => void
}

export function useFreeMove({ rootRef, document, slide, scale, selectedSlot, locked, apply, select }: FreeMoveOptions) {
  const gesture = useRef<Gesture | null>(null)
  const swallowClick = useRef(false)
  const [guides, setGuides] = useState<Guide[]>([])
  const [selectedRect, setSelectedRect] = useState<Rect | null>(null)
  const { width: W, height: H } = document.canvas
  const safe = SAFE[document.format]

  const blockOf = useCallback((slot: string) => slide.blocks.find((b) => b.slot === slot), [slide.blocks])

  // A caixa de um elemento em px do canvas, medida no DOM do preview.
  const measure = useCallback(
    (slot: string): Rect | null => {
      const root = rootRef.current?.querySelector<HTMLElement>("[data-slide-root]")
      const element = root?.querySelector<HTMLElement>(`[data-slot="${slot}"]`)
      if (!root || !element || scale <= 0) return null
      const r = element.getBoundingClientRect()
      const o = root.getBoundingClientRect()
      return { x: (r.left - o.left) / scale, y: (r.top - o.top) / scale, w: r.width / scale, h: r.height / scale }
    },
    [rootRef, scale]
  )

  // As guias: margens seguras, centro, e bordas/centros dos outros elementos.
  const snapTargets = useCallback(
    (except: string) => {
      const xs = [safe.left, W / 2, W - safe.right]
      const ys = [safe.top, H / 2, H - safe.bottom]
      const root = rootRef.current?.querySelector<HTMLElement>("[data-slide-root]")
      root?.querySelectorAll<HTMLElement>("[data-slot]").forEach((element) => {
        const slot = element.dataset.slot
        if (!slot || slot === except) return
        const rect = measure(slot)
        if (!rect) return
        xs.push(rect.x, rect.x + rect.w / 2, rect.x + rect.w)
        ys.push(rect.y, rect.y + rect.h / 2, rect.y + rect.h)
      })
      return { xs, ys }
    },
    [H, W, measure, rootRef, safe.bottom, safe.left, safe.right, safe.top]
  )

  const frameFor = useCallback(
    (block: Block, rect: Rect): Frame =>
      clampFrame(block.type === "text" ? { x: rect.x, y: rect.y, w: rect.w } : { x: rect.x, y: rect.y, w: rect.w, h: rect.h }, block.type, document.format),
    [document.format]
  )

  const commit = useCallback(
    (slot: string, rect: Rect) => {
      const block = blockOf(slot)
      if (!block) return
      apply([{ op: "set_frame", slideId: slide.id, slot, frame: frameFor(block, rect) }], `frame:${slide.id}:${slot}`)
    },
    [apply, blockOf, frameFor, slide.id]
  )

  // ------------------------------------------------------------- ponteiro

  const begin = useCallback(
    (slot: string, event: ReactPointerEvent<HTMLElement>, kind: Gesture["kind"], handle?: Handle) => {
      if (locked) return
      const start = measure(slot)
      if (!start) return
      const block = blockOf(slot)
      const logoAspect = start.w / Math.max(start.h, 1)
      gesture.current = {
        slot,
        kind,
        handle,
        pointerX: event.clientX,
        pointerY: event.clientY,
        start,
        started: kind === "resize",
        targets: snapTargets(slot),
        aspect: block?.type === "logo" ? logoAspect : 0,
      }
      if (kind === "resize") {
        event.preventDefault()
        event.stopPropagation()
      }
    },
    [blockOf, locked, measure, snapTargets]
  )

  useEffect(() => {
    function onMove(event: PointerEvent) {
      const g = gesture.current
      if (!g) return
      const dxScreen = event.clientX - g.pointerX
      const dyScreen = event.clientY - g.pointerY
      if (!g.started) {
        if (Math.hypot(dxScreen, dyScreen) < DRAG_THRESHOLD) return
        g.started = true
        select(g.slot)
      }
      const dx = dxScreen / scale
      const dy = dyScreen / scale
      const tolerance = SNAP / scale
      const next: Rect = { ...g.start }
      const lines: Guide[] = []

      if (g.kind === "move") {
        next.x = g.start.x + dx
        next.y = g.start.y + dy
        const sx = snap([next.x, next.x + next.w / 2, next.x + next.w], g.targets.xs, tolerance)
        if (sx) {
          next.x += sx.delta
          lines.push({ axis: "x", at: sx.at })
        }
        const sy = snap([next.y, next.y + next.h / 2, next.y + next.h], g.targets.ys, tolerance)
        if (sy) {
          next.y += sy.delta
          lines.push({ axis: "y", at: sy.at })
        }
      } else {
        const h = g.handle ?? "se"
        if (h.includes("e")) next.w = Math.max(FRAME_MIN, g.start.w + dx)
        if (h.includes("w")) {
          next.w = Math.max(FRAME_MIN, g.start.w - dx)
          next.x = g.start.x + g.start.w - next.w
        }
        if (h === "nw" || h === "ne" || h === "sw" || h === "se") {
          if (h.includes("s")) next.h = Math.max(FRAME_MIN, g.start.h + dy)
          if (h.includes("n")) {
            next.h = Math.max(FRAME_MIN, g.start.h - dy)
            next.y = g.start.y + g.start.h - next.h
          }
          // A logo não deforma: a altura manda e a largura acompanha.
          if (g.aspect > 0) {
            next.w = next.h * g.aspect
            if (h.includes("w")) next.x = g.start.x + g.start.w - next.w
          }
        }
        const edge = h.includes("w") ? next.x : next.x + next.w
        const sx = g.aspect > 0 ? null : snap([edge], g.targets.xs, tolerance)
        if (sx) {
          if (h.includes("w")) {
            next.x += sx.delta
            next.w -= sx.delta
          } else {
            next.w += sx.delta
          }
          lines.push({ axis: "x", at: sx.at })
        }
      }

      setGuides(lines)
      commit(g.slot, next)
    }

    function onUp() {
      const g = gesture.current
      gesture.current = null
      setGuides([])
      if (g?.started) swallowClick.current = true
    }

    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onUp)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onUp)
    }
  }, [commit, scale, select])

  // As setas movem o selecionado (Shift: de 10 em 10) — ajuste fino.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!selectedSlot || locked) return
      const target = event.target as HTMLElement | null
      if (target?.closest("input, textarea, [contenteditable]")) return
      const step = event.shiftKey ? 10 : 1
      const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key]
      if (!delta) return
      const rect = measure(selectedSlot)
      if (!rect) return
      event.preventDefault()
      commit(selectedSlot, { ...rect, x: rect.x + delta[0], y: rect.y + delta[1] })
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [commit, locked, measure, selectedSlot])

  // A caixa do selecionado, para desenhar as alças — medida depois de cada
  // render (o texto pode ter mudado de tamanho).
  useLayoutEffect(() => {
    const rect = selectedSlot ? measure(selectedSlot) : null
    setSelectedRect((current) => (sameRect(current, rect) ? current : rect))
  })

  const selected = selectedSlot ? blockOf(selectedSlot) : undefined

  return {
    onDragStart: (slot: string, event: ReactPointerEvent<HTMLElement>) => begin(slot, event, "move"),
    consumeClick: () => {
      const swallowed = swallowClick.current
      swallowClick.current = false
      return swallowed
    },
    overlay: (
      <MoveOverlay
        width={W}
        height={H}
        scale={scale}
        guides={guides}
        rect={locked ? null : selectedRect}
        handles={selected ? handlesFor(selected) : []}
        onHandle={(handle, event) => selectedSlot && begin(selectedSlot, event, "resize", handle)}
      />
    ),
  }
}

function snap(edges: number[], targets: number[], tolerance: number): { delta: number; at: number } | null {
  let best: { delta: number; at: number } | null = null
  for (const edge of edges) {
    for (const target of targets) {
      const delta = target - edge
      if (Math.abs(delta) <= tolerance && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, at: target }
    }
  }
  return best
}

function sameRect(a: Rect | null, b: Rect | null): boolean {
  if (!a || !b) return a === b
  return Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.w - b.w) < 0.5 && Math.abs(a.h - b.h) < 0.5
}

/** Texto só alarga e estreita (a altura é do texto); foto e logo, pelos cantos. */
function handlesFor(block: Block): Handle[] {
  return block.type === "text" ? ["w", "e"] : ["nw", "ne", "sw", "se"]
}

type MoveOverlayProps = {
  width: number
  height: number
  scale: number
  guides: Guide[]
  rect: Rect | null
  handles: Handle[]
  onHandle: (handle: Handle, event: ReactPointerEvent<HTMLElement>) => void
}

/** Guias e alças por cima do preview, no espaço do canvas (escalado junto). */
function MoveOverlay({ width, height, scale, guides, rect, handles, onHandle }: MoveOverlayProps) {
  const line = 1 / scale
  const knob = 12 / scale
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, width, height, pointerEvents: "none", zIndex: 5 }}>
      {guides.map((guide, index) =>
        guide.axis === "x" ? (
          <div key={index} style={{ position: "absolute", left: guide.at - line / 2, top: 0, width: line, height, background: "var(--vk-guide)" }} />
        ) : (
          <div key={index} style={{ position: "absolute", top: guide.at - line / 2, left: 0, height: line, width, background: "var(--vk-guide)" }} />
        )
      )}
      {rect &&
        handles.map((handle) => {
          const x = handle.includes("w") ? rect.x : handle.includes("e") ? rect.x + rect.w : rect.x + rect.w / 2
          const y = handle === "w" || handle === "e" ? rect.y + rect.h / 2 : handle.includes("n") ? rect.y : rect.y + rect.h
          const cursor = handle === "w" || handle === "e" ? "ew-resize" : handle === "nw" || handle === "se" ? "nwse-resize" : "nesw-resize"
          return (
            <div
              key={handle}
              onPointerDown={(event) => onHandle(handle, event)}
              style={{
                position: "absolute",
                left: x - knob / 2,
                top: y - knob / 2,
                width: knob,
                height: knob,
                background: "var(--vk-bg)",
                border: `${1.5 / scale}px solid var(--vk-fg)`,
                borderRadius: handle === "w" || handle === "e" ? knob : 2 / scale,
                pointerEvents: "auto",
                cursor,
                touchAction: "none",
              }}
            />
          )
        })}
    </div>
  )
}
