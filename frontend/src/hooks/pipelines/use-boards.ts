import { useCallback, useMemo } from "react"
import { useSWRConfig } from "swr"

import { useApi } from "@/hooks/use-api"
import { PIPELINE_BOARDS_KEY } from "@/hooks/use-pipeline-boards"
import { apiPatch, apiPost } from "@/lib/api"
import { BOARDS_PATH, TEMPLATES_PATH, boardPath } from "@/lib/pipelines/paths"
import type { Board, BoardDetail, BoardTemplate, BoardType } from "@/lib/pipelines/types"

type BoardsResponse = { boards: Board[]; meta?: { total: number } }

const NO_BOARDS: Board[] = []
const NO_TEMPLATES: BoardTemplate[] = []

export type CreateBoardInput = {
  name: string
  description?: string | null
  color?: string | null
  boardType?: BoardType
  templateKey?: string | null
}

/** Os pipelines da organização. A chave dos ativos é a mesma do menu lateral. */
export function useBoards(archived = false) {
  const { data, error, isLoading, mutate } = useApi<BoardsResponse>(
    archived ? `${BOARDS_PATH}?archived=true` : BOARDS_PATH,
    { revalidateOnFocus: false }
  )

  return {
    boards: data?.boards ?? NO_BOARDS,
    error,
    isLoading: isLoading && !data,
    reload: () => mutate(),
  }
}

export function useBoardTemplates(enabled = true) {
  const { data, error, isLoading } = useApi<{ templates: BoardTemplate[] }>(
    enabled ? TEMPLATES_PATH : null,
    { revalidateOnFocus: false }
  )
  return { templates: data?.templates ?? NO_TEMPLATES, error, isLoading }
}

/** Criar, renomear e arquivar mudam o menu lateral: as duas listas são relidas juntas. */
export function useBoardMutations() {
  const { mutate } = useSWRConfig()

  const reloadLists = useCallback(
    () =>
      mutate(
        (key) =>
          typeof key === "string" &&
          (key === PIPELINE_BOARDS_KEY || key.startsWith(`${PIPELINE_BOARDS_KEY}?`))
      ),
    [mutate]
  )

  return useMemo(
    () => ({
      reloadLists,

      createBoard: async (input: CreateBoardInput) => {
        const board = await apiPost<BoardDetail>(BOARDS_PATH, { board: input })
        await reloadLists()
        return board
      },

      renameBoard: async (boardId: string, name: string, description?: string | null) => {
        const board = await apiPatch<BoardDetail>(boardPath(boardId), {
          board: { name, ...(description === undefined ? {} : { description }) },
        })
        await Promise.all([
          reloadLists(),
          mutate(
            (key) => typeof key === "string" && (key === boardPath(boardId) || key.startsWith(`${boardPath(boardId)}?`)),
            (current: BoardDetail | undefined) =>
              current ? { ...current, name: board.name, description: board.description } : current,
            { revalidate: false }
          ),
        ])
        return board
      },

      archiveBoard: async (boardId: string, undo = false) => {
        const board = await apiPost<Board>(`${boardPath(boardId)}/archive`, undo ? { undo: true } : {})
        await reloadLists()
        return board
      },
    }),
    [mutate, reloadLists]
  )
}
