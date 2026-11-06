import { formatNumber } from "@/lib/format-number"

// Módulo sem idioma próprio: devolve códigos (`FileKind`) e a tela traduz. O ícone
// de cada tipo está em `FileTypeIcon`, de `@/components/shared`.

// Long de 64 bits serializado pelo protobuf (Baileys/WhatsApp): o valor vem
// quebrado em duas metades de 32 bits em vez de um número.
type LongLike = { low?: number; high?: number; unsigned?: boolean }

// O tamanho não chega num formato único: dependendo do provedor, vem como número,
// string numérica ou o Long do protobuf.
export type FileSizeInput = number | string | LongLike | null | undefined

export type FileKind =
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "code"
  | "text"
  | "spreadsheet"
  | "archive"
  | "other"

const LONG_HIGH_FACTOR = 4294967296 // 2^32

/** Normaliza para bytes; o que não der para interpretar vira 0. */
export function toBytes(value: FileSizeInput): number {
  if (value === null || value === undefined) return 0
  if (typeof value === "number") return Number.isFinite(value) ? value : 0

  if (typeof value === "string") {
    const parsed = Number(value.trim())
    return Number.isFinite(parsed) ? parsed : 0
  }

  if (typeof value === "object" && ("low" in value || "high" in value)) {
    const low = Number(value.low ?? 0)
    const high = Number(value.high ?? 0)
    if (!Number.isFinite(low) || !Number.isFinite(high)) return 0
    // `low` é int32 com sinal, mas representa os 32 bits baixos sem sinal;
    // `high` já carrega o sinal do valor completo (complemento de dois).
    return high * LONG_HIGH_FACTOR + (low >>> 0)
  }

  return 0
}

const SIZE_UNITS = ["byte", "kilobyte", "megabyte", "gigabyte", "terabyte"] as const

/** "1,5 MB", no idioma pedido. */
export function formatFileSize(bytes: FileSizeInput, language: string): string {
  const total = toBytes(bytes)
  const exponent =
    total > 0
      ? Math.min(Math.floor(Math.log(total) / Math.log(1024)), SIZE_UNITS.length - 1)
      : 0

  return formatNumber(total > 0 ? total / 1024 ** exponent : 0, language, {
    style: "unit",
    unit: SIZE_UNITS[exponent],
    unitDisplay: "short",
    maximumFractionDigits: exponent === 0 ? 0 : 1,
  })
}

/** "3:07", para áudio e vídeo. Passa a "1:02:07" a partir de uma hora. */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = String(seconds % 60).padStart(2, "0")

  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}`
    : `${minutes}:${rest}`
}

export function getFileKind(mediaType?: string | null, fileName?: string | null): FileKind {
  const type = mediaType?.toLowerCase() ?? ""
  const name = fileName?.toLowerCase() ?? ""

  if (type.startsWith("video/") || /\.(mp4|avi|mov|wmv|flv|webm|mkv|3gp)$/.test(name)) return "video"
  if (type.startsWith("image/") || /\.(jpe?g|png|gif|bmp|svg|webp|tiff)$/.test(name)) return "image"
  if (type.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|aac|flac|opus)$/.test(name)) return "audio"
  if (type.includes("pdf") || name.endsWith(".pdf")) return "pdf"
  if (type.includes("spreadsheet") || type.includes("excel") || /\.(csv|xlsx?)$/.test(name)) return "spreadsheet"
  if (type.includes("zip") || type.includes("rar") || /\.(zip|rar|7z|tar|gz)$/.test(name)) return "archive"
  if (type.includes("json") || type.includes("xml") || /\.(json|xml|html|css|js|ts)$/.test(name)) return "code"
  if (type.startsWith("text/") || type.includes("word") || /\.(txt|md|docx?)$/.test(name)) return "text"
  return "other"
}

export type MediaKind = "image" | "video" | null

// O back-end envia tanto o tipo simples ("image") quanto o MIME completo
// ("image/jpeg"), então a comparação é por substring.
export function getMediaKind(
  mediaType?: string | number | null,
  typeElement?: string | null
): MediaKind {
  const raw = typeElement === "media" ? mediaType : (typeElement ?? mediaType)
  const value = typeof raw === "string" ? raw.toLowerCase() : ""

  if (value.includes("image")) return "image"
  if (value.includes("video")) return "video"
  return null
}

/** "PDF", a partir de "contrato.pdf". Vazio se o nome não tiver extensão. */
export function getFileExtension(fileName?: string | null): string {
  if (!fileName) return ""
  const parts = fileName.split(".")
  return parts.length > 1 ? (parts.pop()?.toUpperCase() ?? "") : ""
}

const EXTENSIONS: Record<string, string> = {
  "video/mp4": ".mp4",
  "video/avi": ".avi",
  "video/mov": ".mov",
  "video/quicktime": ".mov",
  "video/wmv": ".wmv",
  "video/flv": ".flv",
  "video/webm": ".webm",
  "video/mkv": ".mkv",
  "video/3gp": ".3gp",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/bmp": ".bmp",
  "image/svg+xml": ".svg",
  "image/webp": ".webp",
  "image/tiff": ".tiff",
  "audio/mp3": ".mp3",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "audio/ogg": ".ogg",
  "audio/m4a": ".m4a",
  "audio/aac": ".aac",
  "audio/flac": ".flac",
  "application/pdf": ".pdf",
  "application/json": ".json",
  "application/xml": ".xml",
  "application/zip": ".zip",
  "application/rar": ".rar",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.ms-powerpoint": ".ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
  "text/plain": ".txt",
  "text/csv": ".csv",
  "text/html": ".html",
  "text/css": ".css",
  "text/javascript": ".js",
}

export function getExtensionFromMediaType(mediaType?: string | null): string {
  return (mediaType && EXTENSIONS[mediaType.toLowerCase()]) || ""
}

/** Nome para o download: o real, se houver; senão, tipo + data e hora. */
export function getDownloadFileName(
  fileName?: string | null,
  mediaType?: string | null
): string {
  if (fileName) return fileName

  const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-")
  return `${getFileKind(mediaType)}_${timestamp}${getExtensionFromMediaType(mediaType)}`
}

/** Dispara o download de um blob que já está em memória. */
export function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = fileName
  link.style.display = "none"

  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}

/**
 * Lê o nome do arquivo do cabeçalho `Content-Disposition`; é o nome original do
 * envio, melhor que qualquer um sintetizado.
 */
export function fileNameFromDisposition(disposition?: string | null): string | null {
  if (!disposition) return null

  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1])
    } catch {
      return encoded[1]
    }
  }

  const plain = disposition.match(/filename="?([^";]+)"?/i)
  return plain ? plain[1].trim() : null
}

export type BlobFetcher = (url: string) => Promise<{ blob: Blob; fileName: string | null }>

const fetchDirect: BlobFetcher = async (url) => {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`download ${response.status}`)
  return {
    blob: await response.blob(),
    fileName: fileNameFromDisposition(response.headers.get("Content-Disposition")),
  }
}

/**
 * Baixa o arquivo com o nome certo. `fileName` só deve ser passado quando for um
 * nome real. Mídia em CDN sem CORS precisa do proxy autenticado da API: passe-o em
 * `fetchBlob`. Se nada funcionar, abre em nova aba em vez de falhar calado.
 */
export async function downloadFile(
  url: string,
  {
    fileName,
    fetchBlob = fetchDirect,
  }: { fileName?: string | null; fetchBlob?: BlobFetcher } = {}
): Promise<void> {
  try {
    const result = await fetchBlob(url)
    triggerBlobDownload(
      result.blob,
      fileName || result.fileName || getDownloadFileName(undefined, result.blob.type)
    )
  } catch {
    window.open(url, "_blank", "noopener,noreferrer")
  }
}
