import { useCallback } from "react"
import { useSWRConfig } from "swr"

import { useApi } from "@/hooks/use-api"
import { PIPELINE_BOARDS_KEY } from "@/hooks/use-pipeline-boards"
import { apiDelete, apiPatch, apiPost } from "@/lib/api"
import type {
  Board,
  BoardBase,
  BoardInput,
  BoardOption,
  Stage,
  StageInput,
  StageWithCards,
} from "@/lib/pipelines-admin/types"

export function boardKey(boardId: string) {
  return `${PIPELINE_BOARDS_KEY}/${boardId}`
}

/** O quadro inteiro: etapas com os cards, campos e gatilhos. */
export function useBoard(boardId: string | undefined) {
  const { data, error, isLoading, isValidating, mutate } = useApi<Board>(
    boardId ? boardKey(boardId) : null,
    { keepPreviousData: false }
  )

  return {
    board: data,
    error,
    isLoading,
    isValidating,
    reload: useCallback(() => mutate(), [mutate]),
  }
}

/** Todos os quadros, com as etapas sem os cards: é o que alimenta os seletores de um gatilho. */
export function useBoardOptions() {
  const { data, error, isLoading } = useApi<{ boards: BoardOption[] }>(
    `${PIPELINE_BOARDS_KEY}?withStages=true`,
    { revalidateOnFocus: false }
  )
  return { boards: data?.boards, error, isLoading }
}

/**
 * Tudo o que depende do quadro, inclusive o menu lateral: o quadro, as métricas, os campos e os
 * gatilhos moram embaixo do mesmo caminho.
 */
export function useRevalidateBoard(boardId: string) {
  const { mutate } = useSWRConfig()

  return useCallback(
    () =>
      mutate(
        (key) =>
          typeof key === "string" &&
          (key === PIPELINE_BOARDS_KEY ||
            key.startsWith(`${PIPELINE_BOARDS_KEY}?`) ||
            // O checklist cuida de si: reler o de uma etapa que acabou de ser apagada daria 404.
            (key.startsWith(boardKey(boardId)) && !key.includes("/checklist-items")))
      ),
    [boardId, mutate]
  )
}

export function useBoardMutations(boardId: string) {
  const { mutate } = useSWRConfig()
  const revalidate = useRevalidateBoard(boardId)

  const updateBoard = useCallback(
    async (input: BoardInput) => {
      // A resposta já é o quadro inteiro: a tela muda na hora, e o resto (menu, métricas) relê por baixo.
      const saved = await apiPatch<Board>(boardKey(boardId), { board: input })
      await mutate(boardKey(boardId), saved, { revalidate: false })
      void revalidate()
      return saved
    },
    [boardId, mutate, revalidate]
  )

  const archiveBoard = useCallback(
    async (undo: boolean) => {
      const saved = await apiPost<BoardBase>(`${boardKey(boardId)}/archive`, undo ? { undo: true } : {})
      await revalidate()
      return saved
    },
    [boardId, revalidate]
  )

  const deleteBoard = useCallback(async () => {
    await apiDelete(boardKey(boardId))
    // Só o menu: a chave do próprio quadro responderia 404 enquanto a tela sai.
    await mutate(
      (key) =>
        typeof key === "string" &&
        (key === PIPELINE_BOARDS_KEY || key.startsWith(`${PIPELINE_BOARDS_KEY}?`))
    )
  }, [boardId, mutate])

  return { updateBoard, archiveBoard, deleteBoard }
}

export function useStageMutations(boardId: string) {
  const { mutate } = useSWRConfig()
  const revalidate = useRevalidateBoard(boardId)
  const base = `${boardKey(boardId)}/stages`

  const createStage = useCallback(
    async (input: StageInput) => {
      const stage = await apiPost<Stage>(base, { stage: input })
      await revalidate()
      return stage
    },
    [base, revalidate]
  )

  const updateStage = useCallback(
    async (id: string, input: StageInput) => {
      const stage = await apiPatch<Stage>(`${base}/${id}`, { stage: input })
      await revalidate()
      return stage
    },
    [base, revalidate]
  )

  const deleteStage = useCallback(
    async (id: string) => {
      await apiDelete(`${base}/${id}`)
      await revalidate()
    },
    [base, revalidate]
  )

  /** Otimista: a lista muda na hora e volta sozinha se o servidor recusar. */
  const reorderStages = useCallback(
    async (ordered: StageWithCards[]) => {
      await mutate<Board>(
        boardKey(boardId),
        async (current) => {
          await apiPost(`${base}/reorder`, { orderedIds: ordered.map((stage) => stage.id) })
          return current ? { ...current, stages: ordered } : current
        },
        {
          optimisticData: (current) =>
            (current ? { ...current, stages: ordered } : current) as Board,
          rollbackOnError: true,
          revalidate: false,
        }
      )
      void revalidate()
    },
    [base, boardId, mutate, revalidate]
  )

  return { createStage, updateStage, deleteStage, reorderStages }
}
