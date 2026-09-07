import type { SWRConfiguration } from "swr"

import { ApiError } from "@/lib/api"

/**
 * Configuração global do SWR.
 *
 * Duas escolhas que valem explicação:
 *
 * - `keepPreviousData`: trocar de pasta ou de filtro mantém a lista anterior na
 *   tela enquanto a nova chega, em vez de piscar um vazio.
 * - `onError` só registra. Erro de **leitura** vira `<ErrorState>` dentro da
 *   view (com botão de tentar de novo); erro de **mutação** vira toast de quem
 *   mutou. Um toast global faria as duas coisas ao mesmo tempo.
 */
export const swrConfig: SWRConfiguration = {
  revalidateOnFocus: true,
  dedupingInterval: 2000,
  keepPreviousData: true,
  errorRetryCount: 2,
  // Repetir um 404 ou um 422 é ruído: a resposta não vai mudar sozinha.
  shouldRetryOnError: (error: unknown) => {
    if (!(error instanceof ApiError)) return true
    return error.code === "network" || error.status >= 500
  },
  onError: (error: unknown, key: string) => {
    if (import.meta.env.DEV) console.warn(`[swr] ${key}`, error)
  },
}
