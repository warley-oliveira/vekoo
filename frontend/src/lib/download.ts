/**
 * Baixa um arquivo de outra origem (o storage) com o nome que a gente quer —
 * `<a download>` sozinho ignora o nome quando a URL não é da mesma origem.
 */
export async function downloadUrl(url: string, filename: string): Promise<void> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`download ${response.status}`)
  const blob = await response.blob()
  const href = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = href
  link.download = filename
  link.click()
  URL.revokeObjectURL(href)
}

/** Um nome de arquivo a partir de um texto livre: minúsculo, sem acento solto nem espaço. */
export function fileSlug(text: string, fallback = "vekoo"): string {
  const slug = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60)
  return slug || fallback
}
