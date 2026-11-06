import { useCallback } from "react"

import { useApi } from "@/hooks/use-api"
import { apiDelete, apiPatch, apiPost } from "@/lib/api"
import type { StageChecklistItem } from "@/lib/pipelines-admin/types"
import { boardKey } from "./use-board"

type ItemsResponse = { items: StageChecklistItem[] }

type ItemInput = Partial<Pick<StageChecklistItem, "title" | "required">>

/** O que precisa estar marcado para o card sair da etapa. */
export function useStageChecklist(boardId: string, stageId: string | null | undefined) {
  const base = stageId ? `${boardKey(boardId)}/stages/${stageId}/checklist-items` : null
  const { data, error, isLoading, mutate } = useApi<ItemsResponse>(base, {
    revalidateOnFocus: false,
  })

  const createItem = useCallback(
    async (input: ItemInput) => {
      const item = await apiPost<StageChecklistItem>(base!, { item: { required: true, ...input } })
      await mutate(
        (current) => ({ items: [...(current?.items ?? []), item] }),
        { revalidate: false }
      )
      return item
    },
    [base, mutate]
  )

  const updateItem = useCallback(
    async (id: string, input: ItemInput) => {
      await mutate(
        async (current) => {
          const saved = await apiPatch<StageChecklistItem>(`${base}/${id}`, { item: input })
          return { items: (current?.items ?? []).map((item) => (item.id === id ? saved : item)) }
        },
        {
          optimisticData: (current) => ({
            items: (current?.items ?? []).map((item) =>
              item.id === id ? { ...item, ...input } : item
            ),
          }),
          rollbackOnError: true,
          revalidate: false,
        }
      )
    },
    [base, mutate]
  )

  const deleteItem = useCallback(
    async (id: string) => {
      await apiDelete(`${base}/${id}`)
      await mutate(
        (current) => ({ items: (current?.items ?? []).filter((item) => item.id !== id) }),
        { revalidate: false }
      )
    },
    [base, mutate]
  )

  const reorderItems = useCallback(
    async (ordered: StageChecklistItem[]) => {
      await mutate(
        async () => {
          await apiPost(`${base}/reorder`, { orderedIds: ordered.map((item) => item.id) })
          return { items: ordered }
        },
        { optimisticData: { items: ordered }, rollbackOnError: true, revalidate: false }
      )
    },
    [base, mutate]
  )

  return {
    items: data?.items,
    error,
    isLoading,
    reload: () => mutate(),
    createItem,
    updateItem,
    deleteItem,
    reorderItems,
  }
}
