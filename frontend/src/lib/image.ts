import type { ImageSource } from "@/lib/doc"

// Leitura de arquivo de imagem no navegador. Não existe servidor: a foto vira
// um data URL e mora no localStorage junto com o resto do estado — por isso
// ela é reduzida antes, e por isso há um teto declarado.

/** Maior lado da imagem depois de reduzida. Instagram publica em 1080. */
const MAX_EDGE = 1600
const JPEG_QUALITY = 0.82

/** Teto por arquivo já reduzido — acima disso o localStorage não aguenta. */
export const MAX_IMAGE_BYTES = 1_200_000

export type ImageReadError = "type" | "tooLarge" | "decode"

export class ImageError extends Error {
  readonly code: ImageReadError

  constructor(code: ImageReadError) {
    super(code)
    this.name = "ImageError"
    this.code = code
  }
}

function loadBitmap(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new ImageError("decode"))
    }
    image.src = url
  })
}

/**
 * Valida, reduz e devolve a origem pronta para o documento. Lança `ImageError`
 * com um código — a tela é que traduz.
 */
export async function readImageFile(file: File): Promise<ImageSource> {
  if (!file.type.startsWith("image/")) throw new ImageError("type")

  const bitmap = await loadBitmap(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d")
  if (!context) throw new ImageError("decode")
  context.drawImage(bitmap, 0, 0, width, height)

  // PNG só quando pode haver transparência; senão JPEG, bem menor.
  const type = file.type === "image/png" ? "image/png" : "image/jpeg"
  const dataUrl = canvas.toDataURL(type, JPEG_QUALITY)

  if (approximateBytes(dataUrl) > MAX_IMAGE_BYTES) throw new ImageError("tooLarge")

  return { kind: "upload", dataUrl, name: file.name, width, height }
}

/** Um data URL base64 pesa ~3/4 do comprimento da string. */
export function approximateBytes(dataUrl: string): number {
  return Math.round((dataUrl.length * 3) / 4)
}
