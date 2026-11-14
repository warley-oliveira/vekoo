// O vocabulário de mudanças de uma peça — espelho de
// `backend/app/models/piece_document/operations.rb`. O editor aplica aqui,
// na hora (otimista); o servidor recebe o documento inteiro no salvamento
// automático e o valida de novo. Mesmas regras dos dois lados.
//
// Módulo puro: entra documento + operações, sai documento novo.

import {
  FRAME_MIN,
  SAFE,
  type Align,
  type Block,
  type ColorToken,
  type DocumentFormat,
  type FocalPoint,
  type Frame,
  type LayoutContract,
  type LayoutSlot,
  type PieceDocument,
  type ScrimLevel,
  type SizeStep,
  type Slide,
} from "@/lib/piece-document"

export type Operation =
  | { op: "set_text"; slideId: string; slot: string; content: string }
  | { op: "set_size_step"; slideId: string; slot: string; sizeStep: number }
  | { op: "set_align"; slideId: string; slot: string; align: Align }
  | { op: "set_visible"; slideId: string; slot: string; visible: boolean }
  | { op: "set_image"; slideId: string; slot: string; assetId: string | null; focalPoint?: FocalPoint }
  | { op: "set_focal_point"; slideId: string; slot: string; focalPoint: FocalPoint }
  /** Arrastar para fora do lugar do layout; `null` devolve. */
  | { op: "set_frame"; slideId: string; slot: string; frame: Frame | null }
  | { op: "set_background"; slideId: string; type: "color"; colorToken: ColorToken }
  /** O degradê atrás do texto; `null` volta ao do layout. */
  | { op: "set_scrim"; slideId: string; level: ScrimLevel | null }
  | { op: "set_layout"; slideId: string; layoutId: string }
  | { op: "set_logo"; slideId: string; visible?: boolean; variant?: "light" | "dark" }
  | { op: "set_caption"; text?: string; hashtags?: string[] }
  | { op: "move_slide"; slideId: string; toIndex: number }
  /** A lâmina já montada (o painel duplica ou cria a partir da ativa). */
  | { op: "add_slide"; afterSlideId: string | null; slide: Slide }
  | { op: "remove_slide"; slideId: string }

/** Contratos por id — o que a troca de layout e os defaults consultam. */
export type Contracts = Map<string, LayoutContract>

export function applyOperations(document: PieceDocument, operations: Operation[], contracts: Contracts): PieceDocument {
  return operations.reduce((doc, operation) => apply(doc, operation, contracts), document)
}

function apply(doc: PieceDocument, operation: Operation, contracts: Contracts): PieceDocument {
  switch (operation.op) {
    case "set_caption":
      return {
        ...doc,
        caption: {
          text: operation.text ?? doc.caption.text,
          hashtags: operation.hashtags ? normalizeHashtags(operation.hashtags) : doc.caption.hashtags,
        },
      }
    case "set_layout":
      return withSlide(doc, operation.slideId, (slide) => remapLayout(slide, operation.layoutId, contracts))
    case "set_background":
      return withSlide(doc, operation.slideId, (slide) => ({
        ...slide,
        background: { type: "color", colorToken: operation.colorToken },
      }))
    case "set_scrim":
      return withSlide(doc, operation.slideId, (slide) => {
        const { scrim: _previous, ...rest } = slide
        return operation.level ? { ...rest, scrim: operation.level } : rest
      })
    case "move_slide": {
      const from = doc.slides.findIndex((slide) => slide.id === operation.slideId)
      if (from < 0) return doc
      const slides = [...doc.slides]
      const [moved] = slides.splice(from, 1)
      slides.splice(Math.min(Math.max(operation.toIndex, 0), slides.length), 0, moved)
      return { ...doc, slides }
    }
    case "add_slide": {
      const after = operation.afterSlideId ? doc.slides.findIndex((slide) => slide.id === operation.afterSlideId) : doc.slides.length - 1
      const slides = [...doc.slides]
      slides.splice(after + 1, 0, operation.slide)
      return { ...doc, slides }
    }
    case "remove_slide":
      return { ...doc, slides: doc.slides.filter((slide) => slide.id !== operation.slideId) }
    case "set_frame":
      return withSlide(doc, operation.slideId, (slide) => ({
        ...slide,
        blocks: slide.blocks.map((block) => {
          if (block.slot !== operation.slot) return block
          if (!operation.frame) {
            const rest = { ...block }
            delete rest.frame
            return rest
          }
          return { ...block, frame: clampFrame(operation.frame, block.type, doc.format) }
        }),
      }))
    default:
      return withSlide(doc, operation.slideId, (slide) => applyToBlock(slide, operation, contracts))
  }
}

/** Foto vai até a borda; texto e logo ficam na área segura — como no servidor. */
export function clampFrame(frame: Frame, type: Block["type"], format: DocumentFormat): Frame {
  const canvas = format === "story" ? { w: 1080, h: 1920 } : format === "feed_square" ? { w: 1080, h: 1080 } : { w: 1080, h: 1350 }
  const safe = type === "image" ? { top: 0, right: 0, bottom: 0, left: 0 } : SAFE[format]
  const round = (value: number) => Math.round(value * 10) / 10
  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max))
  const w = clamp(frame.w, FRAME_MIN, canvas.w - safe.left - safe.right)
  const h = type === "text" || frame.h === undefined ? undefined : clamp(frame.h, FRAME_MIN, canvas.h - safe.top - safe.bottom)
  const out: Frame = {
    x: round(clamp(frame.x, safe.left, canvas.w - safe.right - w)),
    y: round(clamp(frame.y, safe.top, canvas.h - safe.bottom - (h ?? FRAME_MIN))),
    w: round(w),
  }
  if (h !== undefined) out.h = round(h)
  return out
}

function applyToBlock(slide: Slide, operation: Operation, contracts: Contracts): Slide {
  const contract = contracts.get(slide.layoutId)
  if (!contract) return slide
  const slotId = operation.op === "set_logo" ? "logo" : "slot" in operation ? operation.slot : ""
  const slot = contract.slots.find((s) => s.id === slotId)
  if (!slot) return slide

  let found = slide.blocks.find((b) => b.slot === slotId)
  let blocks = slide.blocks
  if (!found) {
    // Slot opcional sem bloco ganha um — é o "mostrar selo".
    found = newBlock(slot, contract)
    blocks = sortBySlot([...blocks, found], contract)
  }
  const target = found
  const updated = ((): Block => {
    switch (operation.op) {
      case "set_text":
        return target.type === "text" ? { ...target, content: operation.content } : target
      case "set_size_step":
        return target.type === "text" ? { ...target, sizeStep: clampStep(operation.sizeStep) } : target
      case "set_align":
        return target.type === "text" ? { ...target, align: operation.align } : target
      case "set_visible":
        return { ...target, visible: operation.visible }
      case "set_image":
        return target.type === "image"
          ? { ...target, assetId: operation.assetId, focalPoint: operation.focalPoint ?? target.focalPoint, visible: true }
          : target
      case "set_focal_point":
        return target.type === "image" ? { ...target, focalPoint: clampFocal(operation.focalPoint) } : target
      case "set_logo":
        return target.type === "logo"
          ? { ...target, visible: operation.visible ?? target.visible, variant: operation.variant ?? target.variant }
          : target
      default:
        return target
    }
  })()
  return { ...slide, blocks: blocks.map((b) => (b.id === target.id ? updated : b)) }
}

/**
 * Troca de layout sem perder nada: blocos de slots que o layout novo tem
 * ficam; os outros vão para `orphans`; órfão cujo slot voltou a existir
 * volta; slot obrigatório sem bloco entra vazio (espaço reservado, nunca
 * texto inventado).
 */
export function remapLayout(slide: Slide, layoutId: string, contracts: Contracts): Slide {
  const contract = contracts.get(layoutId)
  if (!contract) return slide
  // Layout novo, lugares novos: quem tinha sido arrastado volta ao slot.
  const pool = [...slide.blocks, ...slide.orphans].map((block) => {
    if (!block.frame) return block
    const rest = { ...block }
    delete rest.frame
    return rest
  })
  const placed: Block[] = []
  const orphans: Block[] = []
  for (const block of pool) {
    const slot = contract.slots.find((s) => s.id === block.slot && s.type === block.type)
    if (slot && !placed.some((b) => b.slot === block.slot)) placed.push(fitBlock(block, slot, contract))
    else orphans.push(block)
  }
  for (const slot of contract.slots) {
    if (slot.required && !placed.some((b) => b.slot === slot.id)) placed.push(newBlock(slot, contract))
  }
  const background =
    slide.background.type === "color" && contract.backgroundOptions.includes("color")
      ? slide.background
      : { type: "color" as const, colorToken: contract.backgroundDefault.colorToken ?? "primary" }
  return { ...slide, layoutId, background, blocks: sortBySlot(placed, contract), orphans }
}

/** O bloco que muda de layout ajusta o alinhamento ao que o layout novo permite. */
function fitBlock(block: Block, _slot: LayoutSlot, contract: LayoutContract): Block {
  if (block.type !== "text") return block
  const options: Align[] = contract.alignOptions.length > 0 ? contract.alignOptions : ["left"]
  return options.includes(block.align) ? block : { ...block, align: options[0] }
}

function newBlock(slot: LayoutSlot, contract: LayoutContract): Block {
  const id = crypto.randomUUID()
  switch (slot.type) {
    case "text":
      return {
        id,
        slot: slot.id,
        type: "text",
        content: "",
        styleRole: slot.roleDefault ?? "body",
        sizeStep: 0,
        align: contract.alignOptions[0] ?? "left",
        visible: true,
      }
    case "image":
      return { id, slot: slot.id, type: "image", assetId: null, focalPoint: { x: 0.5, y: 0.5 }, fit: "cover", visible: true }
    case "logo":
      return { id, slot: slot.id, type: "logo", variant: "dark", visible: slot.defaultVisible !== false }
  }
}

function sortBySlot(blocks: Block[], contract: LayoutContract): Block[] {
  const order = contract.slots.map((s) => s.id)
  return [...blocks].sort((a, b) => order.indexOf(a.slot) - order.indexOf(b.slot))
}

function withSlide(doc: PieceDocument, slideId: string, change: (slide: Slide) => Slide): PieceDocument {
  return { ...doc, slides: doc.slides.map((slide) => (slide.id === slideId ? change(slide) : slide)) }
}

function clampStep(step: number): SizeStep {
  return Math.min(Math.max(Math.round(step), -2), 2) as SizeStep
}

function clampFocal(point: FocalPoint): FocalPoint {
  const clamp = (value: number) => Math.round(Math.min(Math.max(value, 0), 1) * 10_000) / 10_000
  return { x: clamp(point.x), y: clamp(point.y) }
}

/** O mesmo do servidor: com #, sem espaço, sem repetir. */
export function normalizeHashtags(tags: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of tags) {
    const word = raw.trim().replace(/^#+/, "").replace(/\s+/g, "")
    if (!word) continue
    const tag = `#${word}`
    if (seen.has(tag)) continue
    seen.add(tag)
    out.push(tag)
  }
  return out
}

/**
 * Uma cópia da lâmina com ids novos (lâmina, blocos, órfãos), opcionalmente
 * em outro layout — o "+ lâmina" e o "duplicar" do carrossel.
 */
export function duplicateSlide(slide: Slide, contracts: Contracts, layoutId?: string): Slide {
  const fresh = <T extends { id: string }>(item: T): T => ({ ...item, id: crypto.randomUUID() })
  const copy: Slide = { ...slide, id: crypto.randomUUID(), blocks: slide.blocks.map(fresh), orphans: slide.orphans.map(fresh) }
  return layoutId && layoutId !== slide.layoutId ? remapLayout(copy, layoutId, contracts) : copy
}
