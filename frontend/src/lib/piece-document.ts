// O documento de uma peça — espelho de `backend/app/models/piece_document.rb`.
// Mudou um, muda o outro.
//
// A peça **é** este documento; a imagem é derivada dele por um renderizador.
// Três travas de marca moram na forma: cor é token (nunca hex), tipografia é
// papel + degrau (nunca fonte ou px), posição é slot do layout (nunca x/y).
//
// Módulo sem idioma: só formas e códigos.

export const DOCUMENT_FORMATS = ["feed_square", "feed_portrait", "story", "carousel"] as const
export type DocumentFormat = (typeof DOCUMENT_FORMATS)[number]

export const COLOR_TOKENS = ["primary", "secondary", "accent", "surface"] as const
export type ColorToken = (typeof COLOR_TOKENS)[number]

export const STYLE_ROLES = ["display", "headline", "body", "label", "caption"] as const
export type StyleRole = (typeof STYLE_ROLES)[number]

/** O único controle de tamanho: degraus da escala tipográfica da marca. */
export const SIZE_STEPS = [-2, -1, 0, 1, 2] as const
export type SizeStep = (typeof SIZE_STEPS)[number]

export type Align = "left" | "center"
export type FocalPoint = { x: number; y: number }

/**
 * O lugar livre de um bloco arrastado, em px do canvas. Texto não tem altura
 * (o texto decide, até o máximo de linhas do slot). Sem `frame`, o bloco fica
 * no lugar do layout.
 */
export type Frame = { x: number; y: number; w: number; h?: number }

/** A área segura de quem foi arrastado — espelho de `PieceDocument::SAFE`. */
export const SAFE: Record<DocumentFormat, { top: number; right: number; bottom: number; left: number }> = {
  feed_square: { top: 40, right: 40, bottom: 40, left: 40 },
  feed_portrait: { top: 40, right: 40, bottom: 40, left: 40 },
  carousel: { top: 40, right: 40, bottom: 40, left: 40 },
  // No story, as faixas que a interface do Instagram cobre.
  story: { top: 220, right: 40, bottom: 280, left: 40 },
}
export const FRAME_MIN = 40

/** O carrossel do Instagram: de 2 a 10 lâminas — espelho de `CAROUSEL_SLIDES`. */
export const CAROUSEL_MIN = 2
export const CAROUSEL_MAX = 10

export type TextBlock = {
  id: string
  slot: string
  type: "text"
  content: string
  styleRole: StyleRole
  sizeStep: SizeStep
  align: Align
  visible: boolean
  frame?: Frame
}

export type ImageBlock = {
  id: string
  slot: string
  type: "image"
  /** Nulo = espaço reservado (slot obrigatório ainda sem foto). */
  assetId: string | null
  focalPoint: FocalPoint
  fit: "cover" | "contain"
  visible: boolean
  frame?: Frame
}

export type LogoBlock = {
  id: string
  slot: string
  type: "logo"
  /** A versão da logo para o fundo: `dark` é a de fundo escuro. */
  variant: "light" | "dark"
  visible: boolean
  frame?: Frame
}

export type Block = TextBlock | ImageBlock | LogoBlock

export type SlideBackground =
  | { type: "color"; colorToken: ColorToken; overlay?: { token: "scrim-dark"; opacity: number } }
  | { type: "image"; assetId: string | null; focalPoint: FocalPoint; overlay?: { token: "scrim-dark"; opacity: number } }

export type Slide = {
  id: string
  layoutId: string
  background: SlideBackground
  blocks: Block[]
  /** Blocos sem slot no layout atual — voltam se o layout mudar de novo. */
  orphans: Block[]
}

export type PieceDocument = {
  schemaVersion: 1
  pieceId: string | null
  brandId: string | null
  brandCoreVersionId: string | null
  format: DocumentFormat
  canvas: { width: number; height: number }
  slides: Slide[]
  caption: { text: string; hashtags: string[] }
  meta: { requestText?: string; generatedAt?: string; generatedBy?: "agent" | "user" | "migration" }
}

/* ---------- contratos de layout (`GET /layouts`) ---------- */

export type LayoutSlot = {
  id: string
  type: "text" | "image" | "logo"
  required: boolean
  roleDefault?: StyleRole
  maxChars?: number
  maxLines?: number
  defaultVisible?: boolean
}

export type LayoutContract = {
  id: string
  name: string
  description: string
  formats: DocumentFormat[]
  /** Só carrossel: capa e chamada final têm lugar fixo. */
  position?: "first" | "last"
  backgroundOptions: Array<"image" | "color">
  backgroundDefault: { type: "image" | "color"; colorToken?: ColorToken }
  alignOptions: Align[]
  slots: LayoutSlot[]
}

/** O texto principal de uma lâmina — o que identifica a peça numa olhada. */
export function slideHeadline(slide: Slide | undefined): string {
  const block = slide?.blocks.find((b): b is TextBlock => b.type === "text" && b.slot === "title")
  return block?.content ?? ""
}
