import { API_URL, apiAssetUrl } from "@/lib/api"
import { downloadFile, fileNameFromDisposition, type BlobFetcher } from "@/lib/file-utils"
import { currentLanguage } from "@/lib/i18n"
import { getToken } from "@/lib/token"

/** `mediaUrl` vem como caminho da API ou como endereço de fora. Vazio vira `null`. */
export function mediaSource(path: string | null | undefined): string | null {
  return path ? apiAssetUrl(path) : null
}

/** O proxy autenticado (`GET /media/download`): entrega o nome original e alcança CDN sem CORS. */
function fetchFromProxy(url: string, signal?: AbortSignal): Promise<Response> {
  const headers = new Headers({ "Accept-Language": currentLanguage() })
  const token = getToken()
  if (token) headers.set("Authorization", `Bearer ${token}`)

  return fetch(`${API_URL}/media/download?url=${encodeURIComponent(url)}`, { headers, signal })
}

const fetchThroughProxy: BlobFetcher = async (url) => {
  const response = await fetchFromProxy(url)
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

/**
 * Os bytes da mídia, para desenhar a onda e decodificar Opus. Da API vêm direto, pela URL assinada.
 * De fora, só pelo proxy: o `connect-src` da CSP não deixa o `fetch` sair para um CDN qualquer, e
 * esse CDN nem sempre responde com CORS. O `<audio>` não tem esse problema, porque vale `media-src`.
 */
export async function fetchMediaBytes(url: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const response = url.startsWith(API_URL) ? await fetch(url, { signal }) : await fetchFromProxy(url, signal)
  if (!response.ok) throw new Error(`download ${response.status}`)
  return response.arrayBuffer()
}
