// A aritmética da geometria de layout — espelho de
// `backend/app/models/layouts/geometry.rb` e de `PieceRenderers.cover_rect`.
// As mesmas regras dos dois lados é o que faz o preview (React) e o export
// do libvips caírem no mesmo lugar. Mudou uma, muda a outra.

export type BoxSpec =
  | "full"
  | Partial<Record<"left" | "right" | "top" | "bottom" | "width" | "height", number | string>>

/** Caixa em px do canvas. Dimensão nula = o conteúdo decide; posição nula = manda a borda oposta. */
export type Box = { x: number | null; y: number | null; w: number | null; h: number | null; right: number | null; bottom: number | null }

/** Um degrau de tamanho: ×1,15 por passo do `sizeStep`. */
export const STEP_RATIO = 1.15

export function sizeFor(base: number, step: number): number {
  return Math.round(base * STEP_RATIO ** step)
}

function length(value: number | string | undefined, axis: number): number | null {
  if (value === undefined || value === null) return null
  if (typeof value === "number") return value
  const match = /^(-?\d+(?:\.\d+)?)%$/.exec(value)
  return match ? (axis * Number(match[1])) / 100 : null
}

export function resolveBox(spec: BoxSpec, width: number, height: number): Box {
  if (spec === "full") return { x: 0, y: 0, w: width, h: height, right: 0, bottom: 0 }
  const left = length(spec.left, width)
  const right = length(spec.right, width)
  const top = length(spec.top, height)
  const bottom = length(spec.bottom, height)
  let w = length(spec.width, width)
  let h = length(spec.height, height)
  if (w === null && left !== null && right !== null) w = width - left - right
  if (h === null && top !== null && bottom !== null) h = height - top - bottom
  const x = left ?? (right !== null && w !== null ? width - right - w : null)
  const y = top ?? (bottom !== null && h !== null ? height - bottom - h : null)
  return { x, y, w, h, right, bottom }
}

/** `[t, r, b, l]` ou um número. */
export function resolveInset(value: number | number[] | undefined): [number, number, number, number] {
  if (value === undefined) return [0, 0, 0, 0]
  if (typeof value === "number") return [value, value, value, value]
  return value.length === 4 ? [value[0], value[1], value[2], value[3]] : [value[0], value[0], value[0], value[0]]
}

/**
 * A foto em "cover" com o ponto focal o mais perto possível do centro da
 * caixa: escala e deslocamento (em px da imagem escalada).
 */
export function coverRect(
  sourceW: number,
  sourceH: number,
  boxW: number,
  boxH: number,
  focal: { x: number; y: number } | undefined
): { scale: number; x: number; y: number } {
  const fx = focal?.x ?? 0.5
  const fy = focal?.y ?? 0.5
  const scale = Math.max(boxW / sourceW, boxH / sourceH)
  const scaledW = sourceW * scale
  const scaledH = sourceH * scale
  const clamp = (value: number, max: number) => Math.min(Math.max(value, 0), Math.max(max, 0))
  return {
    scale,
    x: Math.round(clamp(fx * scaledW - boxW / 2, scaledW - boxW)),
    y: Math.round(clamp(fy * scaledH - boxH / 2, scaledH - boxH)),
  }
}

/**
 * O degradê do escurecimento: alfa = t^1,4 × opacidade, da borda para dentro.
 * Em paradas, porque o CSS não tem curva de potência — as mesmas do libvips.
 */
export function scrimGradient(from: "top" | "bottom", opacity: number): string {
  const stops = Array.from({ length: 9 }, (_, index) => {
    const t = index / 8
    const alpha = (t ** 1.4 * opacity).toFixed(3)
    return `rgba(0,0,0,${alpha}) ${(t * 100).toFixed(1)}%`
  })
  return `linear-gradient(${from === "bottom" ? "to bottom" : "to top"}, ${stops.join(", ")})`
}
