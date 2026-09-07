import { useCallback } from "react"
import { useSWRConfig } from "swr"

import { useApi } from "@/hooks/use-api"
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

  // Não há mais `consume` aqui: o débito acontece **dentro** dos endpoints de
  // geração, que reservam na entrada e estornam se nada útil sair. Era isso que
  // impedia o saldo de ser "corrigido" no navegador, e agora nem passa por ele.

  /** Depois de uma geração, o saldo verdadeiro é o do servidor. */
  const refresh = useCallback(() => mutate(KEY), [mutate])

  return { refresh }
}
