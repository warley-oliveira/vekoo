import type { BrandAsset } from "@/lib/brand-core"
import type { DocumentFormat } from "@/lib/piece-document"

// A geração de imagens — o lado do cliente de `/brands/:id/image-generations`.
// As imagens que saem são fotos da marca (`BrandAsset` de tipo `photo`): o
// editor as enxerga em "trocar imagem" sem nada a mais.

export type ImageGenerationStatus = "queued" | "running" | "done" | "failed"
export type ImageGenerationError = "blocked" | "unavailable" | "failed"

export type ImageGeneration = {
  id: string
  brandId: string
  prompt: string
  aspectRatio: "4:5" | "1:1" | "9:16"
  count: number
  origin: "studio" | "editor"
  referenceAssetId: string | null
  status: ImageGenerationStatus
  error: ImageGenerationError | null
  creditsCharged: number
  assets: BrandAsset[]
  createdAt: number
  updatedAt: number
}

export type ImageGenerationList = {
  generations: ImageGeneration[]
  /** Há chave do gerador configurada no servidor. */
  available: boolean
  costPerImage: number
}

export type ImageRequest = {
  prompt: string
  format: DocumentFormat
  count: number
  referenceAssetId?: string | null
  origin?: "studio" | "editor"
}

export const IMAGE_COUNTS = [1, 2, 3, 4] as const
export const IMAGE_PROMPT_MAX = 1_000

export function isPending(generation: ImageGeneration): boolean {
  return generation.status === "queued" || generation.status === "running"
}

/** A proporção do pedido como `aspect-ratio` de CSS. */
export function aspectCss(ratio: ImageGeneration["aspectRatio"]): string {
  return ratio.replace(":", " / ")
}
