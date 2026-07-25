// Modelo de documento do carrossel — a unidade é o card (4:5 ou 1:1) composto
// de blocos. Tudo aqui é puro e sem idioma: string visível pertence à tela
// (i18n) ou ao conteúdo do usuário (pt-BR de propósito, em mock-data.ts).

export type CarouselFormat = "4:5" | "1:1"

/** Proporção largura/altura de cada formato (9:16 entra em etapa futura). */
export const FORMAT_RATIOS: Record<CarouselFormat, number> = {
  "4:5": 4 / 5,
  "1:1": 1,
}

export type BlockType =
  | "text"
  | "image"
  | "list"
  | "stat"
  | "quote"
  | "divider"
  | "table"
  | "button"

/** Tamanho relativo do texto — a tela traduz o nome, o card só renderiza. */
export type TextRole = "title" | "subtitle" | "body" | "caption"
export type BlockAlign = "start" | "center" | "end"

/**
 * Cor de tinta relativa ao tema do carrossel. Nunca uma cor absoluta: trocar
 * o tema recolore o carrossel inteiro sem tocar nos blocos.
 */
export type InkColor = "ink" | "accent" | "muted"

type BlockBase = { id: string }

export type TextBlock = BlockBase & {
  type: "text"
  role: TextRole
  text: string
  align: BlockAlign
  color: InkColor
}

/** Imagem no fluxo do conteúdo — a imagem de destaque é do card, não bloco. */
export type ImageBlock = BlockBase & {
  type: "image"
  image: ImageSpec
}

export type ListBlock = BlockBase & {
  type: "list"
  style: "bullet" | "number" | "check"
  items: string[]
  color: InkColor
}

export type StatBlock = BlockBase & {
  type: "stat"
  value: string
  label: string
  align: BlockAlign
  color: InkColor
}

export type QuoteBlock = BlockBase & {
  type: "quote"
  text: string
  attribution?: string
  color: InkColor
}

export type DividerBlock = BlockBase & {
  type: "divider"
  style: "line" | "dots" | "accent"
}

/** Linha 0 é o cabeçalho. */
export type TableBlock = BlockBase & {
  type: "table"
  rows: string[][]
}

export type ButtonBlock = BlockBase & {
  type: "button"
  label: string
  variant: "solid" | "outline"
  align: BlockAlign
}

export type Block =
  | TextBlock
  | ImageBlock
  | ListBlock
  | StatBlock
  | QuoteBlock
  | DividerBlock
  | TableBlock
  | ButtonBlock

/** Onde a imagem de destaque fica no card. */
export type CardLayout =
  | "image-full"
  | "image-top"
  | "image-left"
  | "image-right"
  | "no-image"

export type VerticalAlign = "top" | "center" | "bottom"

/**
 * Imagem desenhada por especificação — arte SVG determinística, sem arquivo.
 * `seed` + mulberry32 geram sempre a mesma geometria; `position` é o controle
 * de reposicionar (qual faixa da arte aparece quando ela é cortada).
 */
export type ImageStyle = "arc" | "waves" | "dots" | "grid" | "beams" | "blob"

export type ImageSpec = {
  style: ImageStyle
  seed: number
  tint: "accent" | "ink" | "bg"
  position: "top" | "center" | "bottom"
}

export type CarouselCard = {
  id: string
  layout: CardLayout
  /** Fundo do card; null = o fundo do tema ("Voltar ao padrão" põe null). */
  bg: string | null
  align: VerticalAlign
  /** Imagem de destaque do card — o layout decide onde ela fica. */
  image: ImageSpec | null
  blocks: Block[]
}

/**
 * Tema do carrossel — as cores da obra do usuário, as únicas saturadas da
 * interface. Strings oklch cruas de propósito (não são tokens da ferramenta).
 */
export type CarouselTheme = {
  bg: string
  /** Variação sutil do fundo, usada atrás das imagens. */
  surface: string
  ink: string
  accent: string
  /** Tinta legível sobre `accent` (botões sólidos, selos). */
  accentInk: string
}

/** Paleta ampla do "Mais cores" — tons quietos, além dos do tema. */
export const EXTENDED_PALETTE: readonly string[] = [
  "oklch(0.97 0.005 285)",
  "oklch(0.92 0.02 85)",
  "oklch(0.9 0.04 25)",
  "oklch(0.88 0.05 145)",
  "oklch(0.9 0.04 240)",
  "oklch(0.88 0.05 300)",
  "oklch(0.45 0.03 285)",
  "oklch(0.35 0.06 260)",
  "oklch(0.4 0.08 155)",
  "oklch(0.42 0.09 25)",
  "oklch(0.3 0.04 300)",
  "oklch(0.22 0.01 285)",
]

/** Gerador determinístico [0, 1) — a mesma semente desenha a mesma arte. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Bloco recém-inserido — conteúdo vazio; a tela mostra o placeholder. */
export function defaultBlock(type: BlockType, id: string): Block {
  switch (type) {
    case "text":
      return { id, type, role: "body", text: "", align: "start", color: "ink" }
    case "image":
      return {
        id,
        type,
        image: { style: "blob", seed: 1, tint: "accent", position: "center" },
      }
    case "list":
      return { id, type, style: "bullet", items: [""], color: "ink" }
    case "stat":
      return { id, type, value: "", label: "", align: "start", color: "accent" }
    case "quote":
      return { id, type, text: "", color: "ink" }
    case "divider":
      return { id, type, style: "line" }
    case "table":
      return {
        id,
        type,
        rows: [
          ["", ""],
          ["", ""],
        ],
      }
    case "button":
      return { id, type, label: "", variant: "solid", align: "start" }
  }
}

/** Título do card para trilha, busca e leitores de tela. */
export function cardTitle(card: { blocks: Block[] }): string {
  const titled = card.blocks.find(
    (b): b is TextBlock => b.type === "text" && b.role === "title"
  )
  if (titled?.text) return titled.text
  for (const block of card.blocks) {
    const text = blockPlainText(block)
    if (text) return text
  }
  return ""
}

/** Todo o texto do card em uma linha — é o que a busca varre. */
export function cardPlainText(card: { blocks: Block[] }): string {
  return card.blocks
    .map(blockPlainText)
    .filter(Boolean)
    .join(" · ")
}

export function blockPlainText(block: Block): string {
  switch (block.type) {
    case "text":
      return block.text
    case "list":
      return block.items.filter(Boolean).join(" · ")
    case "stat":
      return [block.value, block.label].filter(Boolean).join(" ")
    case "quote":
      return [block.text, block.attribution].filter(Boolean).join(" — ")
    case "table":
      return block.rows.flat().filter(Boolean).join(" · ")
    case "button":
      return block.label
    case "image":
    case "divider":
      return ""
  }
}
