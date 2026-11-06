import { useMemo, useRef } from "react"
import useSWR from "swr"

import { apiGet } from "@/lib/api"
import { reconcileBoard } from "@/lib/pipelines/board-state"
import { advancedQuery, type AdvancedFilter } from "@/lib/pipelines/filters"
import { boardPath } from "@/lib/pipelines/paths"
import type { BoardDetail } from "@/lib/pipelines/types"

export function boardDetailKey(boardId: string, advanced: AdvancedFilter | null) {
  const query = advancedQuery(advanced)
  return query ? `${boardPath(boardId)}?${query}` : boardPath(boardId)
}

/**
 * O quadro inteiro, com etapas e cards. O que volta da API passa por `reconcileBoard`: reler o
 * quadro depois de um evento não troca a identidade do que não mudou, então o `React.memo` de
 * etapas e cards segue valendo.
 *
 * Foco na aba não relê: o canal mantém o quadro em dia, e reler um quadro grande a cada alt-tab
 * custa mais do que vale. Reconectar relê, em `useBoardRealtime`.
 */
export function useBoardDetail(boardId: string | null, advanced: AdvancedFilter | null) {
  const last = useRef<BoardDetail | undefined>(undefined)
  const key = boardId ? boardDetailKey(boardId, advanced) : null

  const fetcher = useMemo(
    () => async (path: string) => reconcileBoard(last.current, await apiGet<BoardDetail>(path)),
    []
  )

  const { data, error, isLoading, isValidating, mutate } = useSWR<BoardDetail>(key, fetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
  })

  // `keepPreviousData` mantém o que estava na tela ao trocar de filtro. Ao trocar de pipeline, não:
  // o quadro anterior não pode aparecer com o endereço do novo.
  const board = data && data.id === boardId ? data : undefined
  if (board) last.current = board

  return { board, key, error, isLoading: isLoading && !board, isValidating, mutate }
}
