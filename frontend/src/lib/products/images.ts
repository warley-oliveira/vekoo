import { apiAssetUrl } from "@/lib/api"
import type { ProductImage } from "./types"

/** A original, que pode ter 10 MB: só para abrir, nunca para a grade. */
export function imageOriginalSrc(image: Pick<ProductImage, "url">): string {
  return apiAssetUrl(image.url)
}

export function imageThumbSrc(image: Pick<ProductImage, "thumbUrl">): string {
  return apiAssetUrl(image.thumbUrl)
}

/** Limites do servidor: `Products::Image`. */
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024
export const IMAGE_ACCEPT = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/gif": [".gif"],
}
