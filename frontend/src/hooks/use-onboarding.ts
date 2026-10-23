import { useCallback, useEffect, useRef } from "react"
import { useSWRConfig } from "swr"

import { BRANDS_KEY } from "@/hooks/use-brands"
import { useApi } from "@/hooks/use-api"
import { brandKey } from "@/hooks/use-brand-core"
import type { AgentEvent } from "@/hooks/use-agent-live"
import { apiPost } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { getClientId, subscribe } from "@/lib/cable"
import type { BrandAsset, BrandCore } from "@/lib/brand-core"
import { onboardingHref, type MessageInput, type OnboardingThread } from "@/lib/onboarding"

// O onboarding por conversa de uma marca. A conversa vem pelo SWR; quem avisa
// que o agente respondeu é o `AgentChannel` — o mesmo da criação de peças.

function clientHeaders() {
  return { headers: { "X-Client-Id": getClientId() } }
}

export function onboardingKey(brandId: string): string {
  return onboardingHref(brandId)
}

/** Rede de segurança do canal: enquanto o agente pensa, a tela confere sozinha. */
const THINKING_POLL_MS = 4_000

export function useOnboardingThread(brandId: string) {
  const { data, error, isLoading, mutate } = useApi<OnboardingThread>(onboardingKey(brandId), {
    refreshInterval: (latest) => (latest?.turns.at(-1)?.status === "thinking" ? THINKING_POLL_MS : 0),
  })
  return { thread: data, isLoading: isLoading && !data, error, reload: () => mutate() }
}

/**
 * A resposta do agente ao vivo: o job termina, o turno muda e a conversa
 * volta do servidor. A marca também — cada resposta grava no rascunho, e o
 * resumo lê o documento.
 */
export function useOnboardingLive(brandId: string, conversationId: string | null) {
  const { session } = useAuth()
  const { mutate } = useSWRConfig()
  const current = useRef(conversationId)
  current.current = conversationId

  useEffect(() => {
    if (!session) return

    const unsubscribe = subscribe<AgentEvent>("AgentChannel", {
      received: (message) => {
        if (message.conversationId !== current.current) return
        void mutate(onboardingKey(brandId))
        void mutate(brandKey(brandId))
      },
      // Voltou a conexão: o que chegou enquanto ela caiu vem agora.
      connected: () => void mutate(onboardingKey(brandId)),
    })

    return () => unsubscribe?.()
  }, [brandId, session, mutate])
}

export function useOnboarding(brandId: string) {
  const { mutate } = useSWRConfig()
  const key = onboardingKey(brandId)

  const store = useCallback(
    (thread: OnboardingThread) => mutate(key, thread, { revalidate: false }),
    [key, mutate]
  )

  /** "Começar a conversa". Idempotente: duas abas caem na mesma. */
  const start = useCallback(async () => {
    await store(await apiPost<OnboardingThread>(`${key}/start`))
  }, [key, store])

  /** Uma fala da pessoa. Volta com o turno `thinking`; a resposta chega pelo canal. */
  const send = useCallback(
    async (input: MessageInput) => {
      await store(await apiPost<OnboardingThread>(`${key}/messages`, { message: input }, clientHeaders()))
    },
    [key, store]
  )

  /** "O motor não respondeu": a mesma fala, de volta à fila. */
  const retry = useCallback(
    async (turnId: string) => {
      await store(await apiPost<OnboardingThread>(`${key}/retry`, { turnId }))
    },
    [key, store]
  )

  /** "← voltar": reabre a pergunta anterior. O que já foi gravado fica. */
  const back = useCallback(async (): Promise<OnboardingThread> => {
    const thread = await apiPost<OnboardingThread>(`${key}/back`, undefined, clientHeaders())
    await store(thread)
    return thread
  }, [key, store])

  /** O logotipo tipográfico de quem pediu "cria pra mim" na logo. */
  const wordmark = useCallback(async (): Promise<BrandAsset[]> => {
    const { assets } = await apiPost<{ assets: BrandAsset[] }>(`${key}/wordmark`, undefined, clientHeaders())
    await mutate(brandKey(brandId))
    return assets
  }, [brandId, key, mutate])

  /** "Publicar brandcore": a versão 1 e a criação de peças liberada. */
  const finish = useCallback(async (): Promise<BrandCore> => {
    const published = await apiPost<BrandCore>(`${key}/finish`, undefined, clientHeaders())
    await mutate(brandKey(brandId), published, { revalidate: false })
    await mutate(BRANDS_KEY)
    return published
  }, [brandId, key, mutate])

  return { start, send, retry, back, wordmark, finish }
}
