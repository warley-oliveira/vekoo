import { ApiError } from "@/lib/api"
import { getToken } from "@/lib/token"

// Leitura de Server-Sent Events.
//
// `EventSource` não serve: ele não manda `Authorization`, e a sessão viaja em
// Bearer. Com `fetch` + `ReadableStream` o cabeçalho vai junto e, de bônus, o
// `AbortSignal` cancela de verdade — fechar a conexão é o que faz o servidor
// encerrar a geração.

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3040"

export type SseEvent = { event: string; data: unknown }

/** Erro antes do primeiro byte: o servidor ainda respondeu em JSON. */
async function throwApiError(res: Response): Promise<never> {
  let body: { error?: { code?: string; message?: string } } | undefined
  try {
    body = await res.json()
  } catch {
    /* corpo não-JSON */
  }
  throw new ApiError({
    status: res.status,
    code: (body?.error?.code as ApiError["code"]) ?? "unknown",
    serverMessage: body?.error?.message,
  })
}

/**
 * Abre um POST que responde em SSE e entrega os eventos conforme chegam.
 *
 * Só falha antes do stream abrir vira `ApiError`; depois disso o servidor
 * manda `event: error`, porque o 200 já foi.
 */
export async function* streamEvents(
  path: string,
  body: unknown,
  signal?: AbortSignal
): AsyncGenerator<SseEvent> {
  const token = getToken()
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) await throwApiError(res)
  if (!res.body) throw new ApiError({ status: 0, code: "network" })

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ""

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += value

      // Um evento por bloco em branco. O resto fica no buffer: um evento pode
      // chegar partido entre dois pedaços da rede.
      let split = buffer.indexOf("\n\n")
      while (split !== -1) {
        const raw = buffer.slice(0, split)
        buffer = buffer.slice(split + 2)
        const parsed = parseBlock(raw)
        if (parsed) yield parsed
        split = buffer.indexOf("\n\n")
      }
    }
  } finally {
    // Cancelar o leitor fecha a conexão, e é isso que o servidor enxerga como
    // "o cliente foi embora".
    await reader.cancel().catch(() => {})
  }
}

function parseBlock(raw: string): SseEvent | null {
  // Comentário de heartbeat (`: ping`) não é evento.
  if (!raw.trim() || raw.startsWith(":")) return null

  let event = "message"
  const dataLines: string[] = []
  for (const line of raw.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim()
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim())
  }
  if (dataLines.length === 0) return null

  try {
    return { event, data: JSON.parse(dataLines.join("\n")) }
  } catch {
    return null
  }
}
