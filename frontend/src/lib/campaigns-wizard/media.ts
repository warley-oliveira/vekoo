/** O mesmo corte do servidor (`Outreach::Campaign.resolve_media_kind`): só imagem e vídeo aceitam legenda. */
export function mediaKindOf(contentType: string | null | undefined): "image" | "video" | "document" | null {
  const normalized = contentType?.toLowerCase() ?? ""
  if (normalized.startsWith("image/")) return "image"
  if (normalized.startsWith("video/")) return "video"
  if (["pdf", "document", "sheet", "presentation", "msword", "excel", "powerpoint"].some((kind) => normalized.includes(kind))) {
    return "document"
  }
  return null
}
