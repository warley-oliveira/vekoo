import { useApi } from "@/hooks/use-api"
import type { BoardMetrics } from "@/lib/pipelines-admin/types"
import { boardKey } from "./use-board"

/** A fotografia de agora, mais `period` com o que aconteceu entre as duas datas. */
export function useBoardMetrics(boardId: string, from: string, to: string) {
  const { data, error, isLoading, isValidating, mutate } = useApi<BoardMetrics>(
    `${boardKey(boardId)}/metrics?from=${from}&to=${to}`,
    // Trocar o período segura o que está na tela, esmaecido: nada pula, nada pisca.
    { keepPreviousData: true }
  )

  return {
    metrics: data,
    error,
    isLoading,
    isValidating,
    reload: () => mutate(),
  }
}
