import { useEffect, useMemo, useRef } from "react"
import useSWR, { mutate as globalMutate } from "swr"

import { useApi } from "@/hooks/use-api"
import { useAlerts, type AlertBadges } from "@/hooks/use-alerts"
import { apiDelete, apiPatch, apiPost } from "@/lib/api"
import { fetchAllPages } from "@/lib/people/fetch-all-pages"
import type { SignatureResult, Webhook, WebhookAlert, WebhookStatus } from "@/lib/webhooks/types"

export const WEBHOOKS_KEY = "/webhooks?perPage=100"
export const WEBHOOK_ALERTS_KEY = "/alerts/details?category=webhooks"
const BADGES_KEY = "/alerts"

const NO_WEBHOOKS: Webhook[] = []
const NO_ALERTS: WebhookAlert[] = []

export function webhookKey(id: string) {
  return `/webhooks/${id}`
}

/** Salvar um webhook resolve o aviso dele, na API: o número do menu e a lista precisam saber. */
function refreshAlerts() {
  void globalMutate(BADGES_KEY)
  void globalMutate(WEBHOOK_ALERTS_KEY)
}

/** Guarda o que a API devolveu na lista e no detalhe, sem perguntar de novo. */
function storeWebhook(webhook: Webhook) {
  void globalMutate(webhookKey(webhook.id), { webhook }, { revalidate: false })
  void globalMutate<Webhook[]>(
    WEBHOOKS_KEY,
    (current) => {
      if (!current) return current
      return current.some((item) => item.id === webhook.id)
        ? current.map((item) => (item.id === webhook.id ? webhook : item))
        : [...current, webhook]
    },
    { revalidate: false }
  )
}

export function useWebhooks() {
  const { data, error, isLoading, isValidating, mutate } = useSWR<Webhook[]>(WEBHOOKS_KEY, () =>
    fetchAllPages<Webhook>(WEBHOOKS_KEY, "webhooks")
  )
  return { webhooks: data ?? NO_WEBHOOKS, hasData: Boolean(data), error, isLoading, isValidating, reload: () => mutate() }
}

/**
 * Um webhook. Em teste, pergunta de novo a cada poucos segundos: é assim que os campos aparecem na tela logo depois do
 * `curl`, porque a API não avisa por canal o que chega na entrada.
 */
export function useWebhook(id: string | undefined) {
  const { data, error, isLoading, mutate } = useApi<{ webhook: Webhook }>(id ? webhookKey(id) : null, {
    refreshInterval: (latest) => (latest?.webhook.status === "test" ? 4_000 : 30_000),
  })
  return { webhook: data?.webhook ?? null, error, isLoading, reload: () => mutate() }
}

export function useWebhookMutations() {
  return useMemo(() => {
    const patch = async (id: string, webhook: Record<string, unknown>) => {
      const updated = await apiPatch<{ webhook: Webhook }>(webhookKey(id), { webhook })
      storeWebhook(updated.webhook)
      refreshAlerts()
      return updated.webhook
    }

    const signature = async (request: Promise<SignatureResult>) => {
      const result = await request
      storeWebhook(result.webhook)
      return result
    }

    return {
      createWebhook: async (name: string) => {
        const { webhook } = await apiPost<{ webhook: Webhook }>("/webhooks", { webhook: { name } })
        storeWebhook(webhook)
        return webhook
      },
      updateWebhook: patch,
      renameWebhook: (id: string, name: string) => patch(id, { name }),
      setStatus: (id: string, status: WebhookStatus) => patch(id, { status }),
      deleteWebhook: async (id: string) => {
        await apiDelete(webhookKey(id))
        void globalMutate<Webhook[]>(WEBHOOKS_KEY, (current) => current?.filter((item) => item.id !== id), { revalidate: false })
        refreshAlerts()
        void globalMutate((key) => typeof key === "string" && key.startsWith("/webhook-logs"))
      },
      enableSignature: (id: string) => signature(apiPost<SignatureResult>(`${webhookKey(id)}/enable-signature`)),
      rotateSigningSecret: (id: string) => signature(apiPost<SignatureResult>(`${webhookKey(id)}/rotate-signing-secret`)),
      disableSignature: async (id: string) => {
        const { webhook } = await apiDelete<{ webhook: Webhook }>(`${webhookKey(id)}/disable-signature`)
        storeWebhook(webhook)
        return webhook
      },
    }
  }, [])
}

/**
 * Os avisos que o número do menu conta. O menu se atualiza por canal: quando o número muda, a lista acompanha. Quem
 * está aqui já tem `core_settings`, que é o que dispensar exige.
 */
export function useWebhookAlerts() {
  const { badges } = useAlerts()
  const { data, error, isLoading, mutate } = useApi<{ alerts: WebhookAlert[] }>(WEBHOOK_ALERTS_KEY)

  const count = badges.webhooks ?? 0
  const previous = useRef(count)
  useEffect(() => {
    if (previous.current === count) return
    previous.current = count
    void mutate()
  }, [count, mutate])

  const alerts = data?.alerts ?? NO_ALERTS
  const byWebhook = useMemo(() => {
    const map = new Map<string, WebhookAlert[]>()
    for (const alert of alerts) map.set(alert.originId, [...(map.get(alert.originId) ?? []), alert])
    return map
  }, [alerts])

  return { alerts, byWebhook, error, isLoading, reload: () => mutate() }
}

/** Dispensar não conserta nada, só cala o aviso: a resposta traz os números novos, e o menu muda na hora. */
export async function dismissWebhookAlert(alert: WebhookAlert) {
  const { badges } = await apiPost<{ resolved: number; badges: AlertBadges }>("/alerts/resolve", {
    originType: alert.originType,
    originId: alert.originId,
    code: alert.code,
  })
  void globalMutate(BADGES_KEY, { badges }, { revalidate: false })
  void globalMutate<{ alerts: WebhookAlert[] }>(
    WEBHOOK_ALERTS_KEY,
    (current) => current && { ...current, alerts: current.alerts.filter((item) => item.id !== alert.id) },
    { revalidate: false }
  )
}
