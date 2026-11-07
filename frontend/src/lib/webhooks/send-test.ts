import { apiAssetUrl } from "@/lib/api"

// A entrada do webhook é pública e não usa sessão: o teste é um POST igual ao de qualquer sistema de fora, sem o token.
// É o que faz dele um teste de verdade, inclusive para a recusa por falta de assinatura.

export type TestDelivery = {
  ok: boolean
  /** 0 quando nem chegou ao servidor. */
  status: number
  code?: string
  message?: string
}

/** A API devolve o caminho quando `BACKEND_URL` não está definido, e copiar isso não serviria para nada. */
export function webhookAddress(url: string): string {
  return apiAssetUrl(url)
}

export async function sendTestRequest(url: string, body: string): Promise<TestDelivery> {
  try {
    const response = await fetch(webhookAddress(url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    })
    if (response.ok) return { ok: true, status: response.status }
    const envelope = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null
    return { ok: false, status: response.status, code: envelope?.error?.code, message: envelope?.error?.message }
  } catch {
    return { ok: false, status: 0 }
  }
}
