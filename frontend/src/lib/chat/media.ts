import { API_URL, apiAssetUrl } from "@/lib/api"
import { downloadFile, fileNameFromDisposition, type BlobFetcher } from "@/lib/file-utils"
import { currentLanguage } from "@/lib/i18n"
import { getToken } from "@/lib/token"

/** `mediaUrl` vem como caminho da API ou como endereço de fora. Vazio vira `null`. */
export function mediaSource(path: string | null | undefined): string | null {
  return path ? apiAssetUrl(path) : null
}

/**
 * O arquivo pelo proxy autenticado (`GET /media/download`), que entrega o nome original e
 * alcança CDN sem CORS. Passa em `downloadFile({ fetchBlob })`.
 */
const fetchThroughProxy: BlobFetcher = async (url) => {
  const headers = new Headers({ "Accept-Language": currentLanguage() })
  const token = getToken()
  if (token) headers.set("Authorization", `Bearer ${token}`)

  const response = await fetch(`${API_URL}/media/download?url=${encodeURIComponent(url)}`, {
    headers,
  })
  if (!response.ok) throw new Error(`download ${response.status}`)

  return {
    blob: await response.blob(),
    fileName: fileNameFromDisposition(response.headers.get("Content-Disposition")),
  }
}

/** Baixa a mídia da mensagem. Sem conseguir, abre numa aba nova em vez de falhar calado. */
export function downloadMedia(path: string, fileName?: string | null): Promise<void> {
  return downloadFile(path, { fileName, fetchBlob: fetchThroughProxy })
}
