import { useCallback } from "react"
import { useSWRConfig } from "swr"

import { BRANDS_KEY } from "@/hooks/use-brands"
import { brandKey } from "@/hooks/use-brand-core"
import { apiPost, apiPatch } from "@/lib/api"
import { getClientId } from "@/lib/cable"
import type { BrandAsset, BrandCore, BrandDocument, BrandSection } from "@/lib/brand-core"
import type { OnboardingStep, SuggestKind, SuggestOption, SuggestResult } from "@/lib/onboarding"

// O onboarding guiado de uma marca. Três verbos e nada mais: responder,
// pedir proposta e fechar publicando a v1.

type AnswerInput = {
  step: OnboardingStep
  action?: "viewed" | "answered" | "skipped"
  /** A seção inteira, como o wizard de edição também manda. */
  document?: Partial<Pick<BrandDocument, BrandSection>>
  segment?: string | null
  wantsWordmark?: boolean
}

function clientHeaders() {
  return { headers: { "X-Client-Id": getClientId() } }
}

export function useOnboarding(brandId: string) {
  const { mutate } = useSWRConfig()
  const base = `/brands/${brandId}/onboarding`
  const key = brandKey(brandId)

  const store = useCallback(
    async (brandCore: BrandCore) => {
      await mutate(key, brandCore, { revalidate: false })
      await mutate(BRANDS_KEY)
    },
    [key, mutate]
  )

  /**
   * Responde (ou pula, ou só registra que viu). O servidor devolve o
   * documento inteiro, que substitui o cache — sem revalidar por cima do que
   * a pessoa está digitando.
   */
  const answer = useCallback(
    async (input: AnswerInput): Promise<BrandCore> => {
      const saved = await apiPatch<BrandCore>(
        base,
        { onboarding: { action: "answered", ...input } },
        clientHeaders()
      )
      await store(saved)
      return saved
    },
    [base, store]
  )

  /** O "não sei / cria pra mim". Nunca falha por falta de modelo. */
  const suggest = useCallback(
    async <T extends SuggestOption>(kind: SuggestKind): Promise<SuggestResult<T>> =>
      apiPost<SuggestResult<T>>(base + "/suggest", { kind }),
    [base]
  )

  /** "Não tenho logo": a Vekoo desenha o logotipo tipográfico. */
  const wordmark = useCallback(async (): Promise<BrandAsset[]> => {
    const { assets } = await apiPost<{ assets: BrandAsset[] }>(base + "/wordmark", undefined, clientHeaders())
    await mutate(key)
    return assets
  }, [base, key, mutate])

  /** Fecha: publica a versão 1 e libera a criação de peças. */
  const finish = useCallback(async (): Promise<BrandCore> => {
    const published = await apiPost<BrandCore>(base + "/finish", undefined, clientHeaders())
    await store(published)
    return published
  }, [base, store])

  return { answer, suggest, wordmark, finish }
}
