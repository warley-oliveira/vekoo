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
  | "steps"
  | "stat"
  | "quote"
  | "testimonial"
  | "badge"
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

/**
 * Trecho de texto com marcas. O texto do carrossel não é mais uma string: é
 * uma sequência de trechos, cada um com as suas marcas — é o que permite
 * negrito no meio da frase sem inventar um campo por marca.
 * `color` continua relativo ao tema, nunca uma cor absoluta.
 */
export type TextSpan = {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  color?: InkColor
  href?: string
}

/** Espaço antes do bloco — o card já tem um ritmo; isto o afina. */
export type BlockSpacing = "tight" | "normal" | "loose"
/** Largura do bloco na coluna de conteúdo. */
export type BlockWidth = "full" | "narrow"

type BlockBase = {
  id: string
  spacing?: BlockSpacing
  width?: BlockWidth
}

export type TextBlock = BlockBase & {
  type: "text"
  role: TextRole
  spans: TextSpan[]
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
  items: TextSpan[][]
  color: InkColor
}

/** Passos numerados — a lista comum enumera; esta ensina uma ordem. */
export type StepsBlock = BlockBase & {
  type: "steps"
  items: TextSpan[][]
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
  spans: TextSpan[]
  attribution?: string
  color: InkColor
}

/** Depoimento: a fala, quem falou e o que essa pessoa faz. */
export type TestimonialBlock = BlockBase & {
  type: "testimonial"
  spans: TextSpan[]
  name: string
  role?: string
  color: InkColor
}

/** Selo curto — a numeração "1/8" e as etiquetas de seção do carrossel. */
export type BadgeBlock = BlockBase & {
  type: "badge"
  label: string
  variant: "solid" | "soft"
  align: BlockAlign
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
  | StepsBlock
  | StatBlock
  | QuoteBlock
  | TestimonialBlock
  | BadgeBlock
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

export type ImageStyle = "arc" | "waves" | "dots" | "grid" | "beams" | "blob"
export type ImageTint = "accent" | "ink" | "bg"

/**
 * De onde a imagem vem. Três origens de natureza diferente:
 * - `art`: desenhada por especificação, sem arquivo — a mesma `seed` desenha
 *   sempre a mesma geometria, nas cores do tema.
 * - `library`: uma peça da biblioteca da ferramenta (ver lib/catalog.tsx).
 * - `upload`: um arquivo da pessoa, já reduzido e guardado como data URL.
 */
export type ImageSource =
  | { kind: "art"; style: ImageStyle; seed: number; tint: ImageTint }
  | { kind: "library"; id: string }
  | {
      kind: "upload"
      dataUrl: string
      name: string
      width: number
      height: number
    }

/**
 * A imagem no card: a origem mais o enquadramento. `focus` é o ponto que
 * sobrevive ao corte (0–1 em cada eixo) e `zoom` a aproximação (1 = inteira).
 */
export type ImageSpec = {
  source: ImageSource
  focus: { x: number; y: number }
  zoom: number
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

/** Claridade de uma cor `oklch(L C H)` — 0 a 1; 0.6 se a string for outra. */
export function lightnessOf(color: string): number {
  const match = /oklch\(\s*([\d.]+)/.exec(color)
  return match ? Number(match[1]) : 0.6
}

/** Tinta legível sobre uma cor — é assim que `accentInk` se mantém honesto. */
export function readableInk(over: string): string {
  return lightnessOf(over) > 0.62 ? "oklch(0.18 0.01 285)" : "oklch(0.98 0 0)"
}

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

// ---------------------------------------------------------------------------
// Trechos de texto — puro, sem DOM. A ponte com HTML (o que o editor no lugar
// realmente manipula) fica em lib/rich-text.ts.

/** Texto simples vira um único trecho sem marcas. */
export function spansFromText(text: string): TextSpan[] {
  return text ? [{ text }] : []
}

export function spansToPlainText(spans: TextSpan[]): string {
  return spans.map((s) => s.text).join("")
}

export function spansAreEmpty(spans: TextSpan[]): boolean {
  return spansToPlainText(spans).trim() === ""
}

/** As marcas de um trecho, sem o texto — a chave de comparação da fusão. */
function marksKey(span: TextSpan): string {
  return JSON.stringify([
    span.bold ?? false,
    span.italic ?? false,
    span.underline ?? false,
    span.color ?? null,
    span.href ?? null,
  ])
}

/** Junta vizinhos de marcas iguais e descarta os vazios. */
export function normalizeSpans(spans: TextSpan[]): TextSpan[] {
  const out: TextSpan[] = []
  for (const span of spans) {
    if (!span.text) continue
    const previous = out.at(-1)
    if (previous && marksKey(previous) === marksKey(span)) {
      out[out.length - 1] = { ...previous, text: previous.text + span.text }
    } else {
      out.push({ ...span })
    }
  }
  return out
}

/**
 * `**negrito**` e `*itálico*` no conteúdo fictício — a semente escreve como
 * quem escreve, e o editor recebe trechos de verdade.
 */
export function spansFromMarkdown(text: string): TextSpan[] {
  const spans: TextSpan[] = []
  const pattern = /\*\*(.+?)\*\*|\*(.+?)\*/g
  let last = 0
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    if (match.index > last) spans.push({ text: text.slice(last, match.index) })
    if (match[1] !== undefined) spans.push({ text: match[1], bold: true })
    else spans.push({ text: match[2], italic: true })
    last = match.index + match[0].length
  }
  if (last < text.length) spans.push({ text: text.slice(last) })
  return normalizeSpans(spans)
}

/** Bloco recém-inserido — conteúdo vazio; a tela mostra o placeholder. */
export function defaultBlock(type: BlockType, id: string): Block {
  switch (type) {
    case "text":
      return { id, type, role: "body", spans: [], align: "start", color: "ink" }
    case "image":
      return { id, type, image: defaultImage(1) }
    case "list":
      return { id, type, style: "bullet", items: [[]], color: "ink" }
    case "steps":
      return { id, type, items: [[], []], color: "ink" }
    case "stat":
      return { id, type, value: "", label: "", align: "start", color: "accent" }
    case "quote":
      return { id, type, spans: [], color: "ink" }
    case "testimonial":
      return { id, type, spans: [], name: "", color: "ink" }
    case "badge":
      return { id, type, label: "", variant: "soft", align: "start" }
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

/** Cópia de um bloco com identidade nova — `mkId` vem do chamador (store). */
export function duplicateBlock(block: Block, mkId: () => string): Block {
  return structuredClone({ ...block, id: mkId() })
}

/** Cópia de um card: identidade nova nele e em cada bloco. */
export function duplicateCard(
  card: CarouselCard,
  mkId: () => string
): CarouselCard {
  return {
    ...structuredClone(card),
    id: mkId(),
    blocks: card.blocks.map((b) => duplicateBlock(b, mkId)),
  }
}

/** Card recém-criado, sem conteúdo — o convite de bloco aparece dentro dele. */
export function emptyCard(id: string): CarouselCard {
  return { id, layout: "no-image", bg: null, align: "top", image: null, blocks: [] }
}

/** Enquadramento neutro: a imagem inteira, centrada. */
export const CENTER_FRAME = { focus: { x: 0.5, y: 0.5 }, zoom: 1 } as const

/** Arte padrão para quando um layout com imagem é escolhido num card sem ela. */
export function defaultImage(seed: number): ImageSpec {
  return {
    source: { kind: "art", style: "blob", seed, tint: "accent" },
    ...CENTER_FRAME,
  }
}

/** Atalho para as sementes: arte com enquadramento neutro. */
export function artImage(
  style: ImageStyle,
  seed: number,
  tint: ImageTint = "accent"
): ImageSpec {
  return { source: { kind: "art", style, seed, tint }, ...CENTER_FRAME }
}

/** Título do card para trilha, busca e leitores de tela. */
export function cardTitle(card: { blocks: Block[] }): string {
  const titled = card.blocks.find(
    (b): b is TextBlock => b.type === "text" && b.role === "title"
  )
  const titleText = titled ? spansToPlainText(titled.spans) : ""
  if (titleText) return titleText
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
      return spansToPlainText(block.spans)
    case "list":
    case "steps":
      return block.items.map(spansToPlainText).filter(Boolean).join(" · ")
    case "stat":
      return [block.value, block.label].filter(Boolean).join(" ")
    case "quote":
      return [spansToPlainText(block.spans), block.attribution]
        .filter(Boolean)
        .join(" — ")
    case "testimonial":
      return [spansToPlainText(block.spans), block.name, block.role]
        .filter(Boolean)
        .join(" — ")
    case "table":
      return block.rows.flat().filter(Boolean).join(" · ")
    case "badge":
    case "button":
      return block.label
    case "image":
    case "divider":
      return ""
  }
}

/** Classes de espaço e largura — o wrapper do bloco é o mesmo nos dois modos. */
export function blockLayoutClass(block: Block): string {
  const spacing =
    block.spacing === "tight"
      ? "-mt-[1.8cqw]"
      : block.spacing === "loose"
        ? "mt-[3.4cqw]"
        : ""
  const width = block.width === "narrow" ? "w-[74%] max-w-full" : ""
  return [spacing, width].filter(Boolean).join(" ")
}
