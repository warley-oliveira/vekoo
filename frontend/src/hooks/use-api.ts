import useSWR, { type SWRConfiguration } from "swr"

import { ApiError, apiGet } from "@/lib/api"

/**
 * Leitura de dados da API. A chave do SWR é o próprio caminho — string, não
 * array, porque é isso que permite invalidar uma família inteira por prefixo
 * (`key.startsWith("/carousels")`) quando uma mutação mexe em mais de uma
 * lista.
 *
 * Passe `null` para pular a requisição (ainda não há id, ainda não há sessão).
 */
export function useApi<T>(path: string | null, config?: SWRConfiguration<T>) {
  return useSWR<T>(path, (key: string) => apiGet<T>(key), config)
}

/**
 * Leitura de um endpoint que pode não existir neste servidor: 404 vira `fallback`,
 * sem erro na tela e sem nova tentativa. É o caso da casca durante a migração, em
 * que o menu chega antes das APIs de alertas e de quadros.
 */
export function useOptionalApi<T>(
  path: string | null,
  fallback: T,
  config?: SWRConfiguration<T>
) {
  return useSWR<T>(
    path,
    async (key: string) => {
      try {
        return await apiGet<T>(key)
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return fallback
        throw error
      }
    },
    config
  )
}
