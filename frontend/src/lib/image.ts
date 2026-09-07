import { apiFetch } from "@/lib/api"
import { getCatalog } from "@/lib/catalog"
import type { ImageSource } from "@/lib/doc"

// A imagem que a pessoa envia.
//
// A redução continua acontecendo aqui, antes de subir: economiza banda de quem
// está no celular e tempo de quem está esperando. O que mudou é o destino — o
// arquivo vai para o servidor (Active Storage) em vez de virar data URL dentro
// do documento.

/** Maior lado da imagem depois de reduzida. Instagram publica em 1080. */
const MAX_EDGE = 1600
const JPEG_QUALITY = 0.82

export type ImageReadError = "type" | "tooLarge" | "decode" | "upload"

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

/** Reduz no canvas e devolve o arquivo que vai subir. */
async function shrink(file: File): Promise<Blob> {
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

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new ImageError("decode"))),
      type,
      JPEG_QUALITY
    )
  })
}

type UploadResponse = {
  id: string
  name: string
  url: string
  width: number | null
  height: number | null
  byteSize: number
}

/**
 * Manda a imagem para o servidor e devolve a origem pronta para o documento.
 *
 * `XMLHttpRequest`, e não `fetch`: só ele reporta progresso de envio, e uma foto
 * de celular numa rede ruim leva tempo o bastante para a pessoa merecer ver a
 * barra andar.
 */
export function uploadImageFile(
  file: File,
  options: { onProgress?: (percent: number) => void; signal?: AbortSignal } = {}
): Promise<ImageSource> {
  const { contentTypes, maxBytes } = getCatalog().uploadLimits

  return (async () => {
    if (!contentTypes.includes(file.type)) throw new ImageError("type")

    const blob = await shrink(file)
    // O teto é do servidor; conferir antes evita uma subida inteira para nada.
    if (blob.size > maxBytes) throw new ImageError("tooLarge")

    const form = new FormData()
    form.append("file", blob, file.name)

    const upload = await new Promise<UploadResponse>((resolve, reject) => {
      const request = new XMLHttpRequest()
      const base = import.meta.env.VITE_API_URL ?? "http://localhost:3040"
      request.open("POST", `${base}/uploads`)

      const token = localStorage.getItem("vekoo.token.v1")
      if (token) request.setRequestHeader("Authorization", `Bearer ${token}`)

      request.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          options.onProgress?.(Math.round((event.loaded / event.total) * 100))
        }
      }
      request.onload = () => {
        if (request.status >= 200 && request.status < 300) {
          resolve(JSON.parse(request.responseText) as UploadResponse)
        } else if (request.status === 422) {
          // O servidor recusou o arquivo; a tela já sabe traduzir "grande
          // demais" e "não é imagem".
          reject(new ImageError("tooLarge"))
        } else {
          reject(new ImageError("upload"))
        }
      }
      request.onerror = () => reject(new ImageError("upload"))
      request.onabort = () => reject(new DOMException("cancelado", "AbortError"))
      options.signal?.addEventListener("abort", () => request.abort(), { once: true })

      request.send(form)
    })

    return {
      kind: "upload",
      id: upload.id,
      url: upload.url,
      name: upload.name,
      width: upload.width ?? 0,
      height: upload.height ?? 0,
    } satisfies ImageSource
  })()
}

/** A imagem enviada, pronta para `background-image` / `<img src>`. */
export function uploadUrl(source: Extract<ImageSource, { kind: "upload" }>): string {
  // Documento antigo ainda pode trazer o data URL de quando não havia servidor.
  if ("url" in source) {
    const base = import.meta.env.VITE_API_URL ?? "http://localhost:3040"
    return source.url.startsWith("http") ? source.url : `${base}${source.url}`
  }
  return source.dataUrl
}

/** Só para o aviso de tamanho na tela; o teto de verdade é o do servidor. */
export function maxImageBytes(): number {
  return getCatalog().uploadLimits.maxBytes
}

// Mantido para não quebrar quem ainda importa: o `apiFetch` é a via normal.
void apiFetch
