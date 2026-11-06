import { API_URL, ApiError, apiAssetUrl } from "@/lib/api"
import { fileNameFromDisposition, triggerBlobDownload } from "@/lib/file-utils"
import { currentLanguage } from "@/lib/i18n"
import { getToken } from "@/lib/token"
import { selectionIdCount, selectionQuery, type ContactSelectionTarget } from "./filters"

// Os dois jeitos de baixar. A API os separa: `GET /contacts/export` responde o CSV na hora, com
// até 5000 linhas, segurando uma thread do servidor; acima disso, vai pelo canal, em segundo
// plano. Por isso a tela explica a diferença.

/** `ContactsController::MAX_SYNC_EXPORT`. */
export const MAX_NOW_EXPORT = 5000
/** Ids vão por extenso na query: mais do que isto não cabe com folga numa URL. */
const MAX_IDS_IN_URL = 150
const FALLBACK_FILE_NAME = "contatos.csv"

export function canExportNow(target: ContactSelectionTarget, count: number): boolean {
  return count > 0 && count <= MAX_NOW_EXPORT && selectionIdCount(target) <= MAX_IDS_IN_URL
}

/** Pede o CSV com a sessão, e entrega ao navegador como arquivo. */
export async function exportNow(target: ContactSelectionTarget, signal?: AbortSignal) {
  let response: Response
  try {
    response = await fetch(`${API_URL}/contacts/export?${selectionQuery(target)}`, {
      signal,
      headers: {
        Authorization: `Bearer ${getToken() ?? ""}`,
        "Accept-Language": currentLanguage(),
      },
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new ApiError({ status: 0, code: "network" })
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { code?: string; message?: string }
    } | null
    throw new ApiError({
      status: response.status,
      code: body?.error?.code ?? "unknown",
      serverMessage: body?.error?.message,
    })
  }

  triggerBlobDownload(
    await response.blob(),
    fileNameFromDisposition(response.headers.get("Content-Disposition")) ?? FALLBACK_FILE_NAME
  )
}

export type ExportLinkCheck = "ok" | "expired" | "gone" | "invalid" | "network"

/**
 * Pergunta ao servidor se o link ainda vale, sem baixar o arquivo: com o token bom ele responde
 * um redirecionamento, que aqui não é seguido. Abrir direto mostraria o JSON do erro na aba de
 * quem clicou num link vencido.
 */
export async function checkExportLink(path: string): Promise<ExportLinkCheck> {
  try {
    const response = await fetch(apiAssetUrl(path), { redirect: "manual" })
    if (response.type === "opaqueredirect" || response.ok) return "ok"
    if (response.status === 410) return "expired"
    if (response.status === 404) return "gone"
    return "invalid"
  } catch {
    return "network"
  }
}

/** O redirecionamento termina num anexo: o navegador baixa, sem sair da tela. */
export function openExportLink(path: string) {
  const link = document.createElement("a")
  link.href = apiAssetUrl(path)
  link.rel = "noopener"
  link.style.display = "none"
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
