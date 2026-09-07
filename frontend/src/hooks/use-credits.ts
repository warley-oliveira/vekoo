import { useCallback } from "react"
import { useSWRConfig } from "swr"

import { useApi } from "@/hooks/use-api"
import { apiPost } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import type { Credits } from "@/lib/types"

const KEY = "/credits"

/**
 * O saldo da organização, com uma fonte só.
 *
 * Antes ele era lido em três lugares que podiam divergir (sessão, barra lateral
 * e editor). Agora os três leem esta chave; a sessão só serve de **semente**,
 * via `fallbackData` — o `GET /me` já trouxe o saldo, então a barra lateral
 * nunca pisca na abertura.
 */
export function useCredits() {
  const { session } = useAuth()
  const { data, error, isLoading, mutate } = useApi<Credits>(KEY, {
    fallbackData: session?.credits,
  })

  return {
    credits: data,
    isLoading: isLoading && !data,
    error,
    reload: () => mutate(),
  }
}

export function useCreditMutations() {
  const { mutate } = useSWRConfig()

  /**
   * Consumir é decisão do **servidor**: o cliente pede, o servidor confere o
   * saldo e responde com o novo. Sem saldo vem 422 `noCredits`, que quem chamou
   * traduz — é isso que impede o saldo de ser "corrigido" no navegador.
   */
  const consume = useCallback(
    async (amount: number): Promise<Credits> => {
      const credits = await apiPost<Credits>("/credits/consume", { amount })
      await mutate(KEY, credits, { revalidate: false })
      return credits
    },
    [mutate]
  )

  /** Depois de uma geração, o saldo verdadeiro é o do servidor. */
  const refresh = useCallback(() => mutate(KEY), [mutate])

  return { consume, refresh }
}
