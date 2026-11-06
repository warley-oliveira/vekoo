// Cor de etiqueta é escolhida pela pessoa, então o contraste é calculado aqui e
// não confiado à sorte: o texto escurece até passar de 4,5:1 sobre o fundo.

type Rgb = { r: number; g: number; b: number }

const WHITE: Rgb = { r: 255, g: 255, b: 255 }
const BLACK: Rgb = { r: 0, g: 0, b: 0 }
const MIN_CONTRAST = 4.5
/** Opacidade do fundo da etiqueta suave sobre o branco. */
const TINT = 0.12
/** Cor sem interpretação cai no cinza neutro, para a etiqueta nunca sumir. */
const FALLBACK = "#71717a"

/** Amostras do seletor de cor: sóbrias, legíveis e distinguíveis entre si. */
export const COLOR_SWATCHES = [
  "#7c3aed",
  "#2563eb",
  "#0891b2",
  "#059669",
  "#65a30d",
  "#ca8a04",
  "#ea580c",
  "#dc2626",
  "#db2777",
  "#71717a",
] as const

export function isHexColor(value: string): boolean {
  return /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim())
}

export function parseHexColor(hex: string): Rgb | null {
  if (!isHexColor(hex)) return null

  let value = hex.trim().replace("#", "")
  if (value.length === 3) {
    value = value.replace(/./g, (c) => c + c)
  }
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  }
}

function toHex({ r, g, b }: Rgb): string {
  const channel = (c: number) => Math.round(c).toString(16).padStart(2, "0")
  return `#${channel(r)}${channel(g)}${channel(b)}`
}

function mix(a: Rgb, b: Rgb, amountOfB: number): Rgb {
  return {
    r: a.r + (b.r - a.r) * amountOfB,
    g: a.g + (b.g - a.g) * amountOfB,
    b: a.b + (b.b - a.b) * amountOfB,
  }
}

/** Luminância relativa (0 a 1), pela fórmula do WCAG. */
function luminance({ r, g, b }: Rgb): number {
  const linear = (c: number) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

function contrast(a: Rgb, b: Rgb): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

/** Razão de contraste entre duas cores em hex; 1 se alguma não for válida. */
export function contrastRatio(a: string, b: string): number {
  const first = parseHexColor(a)
  const second = parseHexColor(b)
  return first && second ? contrast(first, second) : 1
}

/** Texto legível sobre a cor sólida: branco ou quase preto, o que contrastar mais. */
export function getReadableTextColor(background: string): string {
  const parsed = parseHexColor(background) ?? parseHexColor(FALLBACK)!
  return contrast(parsed, WHITE) >= contrast(parsed, BLACK) ? "#ffffff" : "#18181b"
}

/**
 * Cor do texto derivada da cor da etiqueta, escurecida só o necessário para ser
 * legível sobre `background`. Mantém o matiz: uma etiqueta amarela segue amarela.
 */
export function getTagTextColor(color: string, background = "#ffffff"): string {
  const base = parseHexColor(color) ?? parseHexColor(FALLBACK)!
  const surface = parseHexColor(background) ?? WHITE

  let current = base
  for (let step = 1; step <= 20 && contrast(current, surface) < MIN_CONTRAST; step++) {
    current = mix(base, BLACK, step * 0.05)
  }
  return toHex(current)
}

export type TagStyle = {
  color: string
  backgroundColor: string
  borderColor: string
}

/** Estilo pronto da etiqueta: suave por padrão, com texto de contraste garantido. */
export function getTagStyle(color: string, variant: "soft" | "solid" = "soft"): TagStyle {
  const base = parseHexColor(color) ?? parseHexColor(FALLBACK)!

  if (variant === "solid") {
    const hex = toHex(base)
    return {
      color: getReadableTextColor(hex),
      backgroundColor: hex,
      borderColor: "transparent",
    }
  }

  const backgroundColor = toHex(mix(WHITE, base, TINT))
  return {
    color: getTagTextColor(toHex(base), backgroundColor),
    backgroundColor,
    borderColor: toHex(mix(WHITE, base, TINT * 2.5)),
  }
}
