import { getFileKind } from "@/lib/file-utils"
import type { AttachmentFile, AttachmentKind } from "./types"

type FileLike = Pick<AttachmentFile, "contentType" | "filename"> | null | undefined

/** Como a biblioteca filtra: tudo que não é imagem, vídeo nem áudio é documento. */
export function attachmentKindOf(file: FileLike): AttachmentKind {
  const kind = getFileKind(file?.contentType, file?.filename)
  return kind === "image" || kind === "video" || kind === "audio" ? kind : "document"
}

export type PreviewKind = "image" | "video" | "audio" | "pdf" | "none"

/** O que o navegador consegue mostrar sem baixar. */
export function previewKindOf(file: FileLike): PreviewKind {
  const kind = getFileKind(file?.contentType, file?.filename)
  return kind === "image" || kind === "video" || kind === "audio" || kind === "pdf" ? kind : "none"
}

/** "guia-de-medidas.pdf" vira "guia-de-medidas": o nome que a biblioteca mostra ao enviar. */
export function nameFromFileName(fileName: string): string {
  return fileName.replace(/\.[^/.]+$/, "") || fileName
}
