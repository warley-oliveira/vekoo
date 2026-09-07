import useSWR, { type SWRConfiguration } from "swr"

import { apiGet } from "@/lib/api"

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
