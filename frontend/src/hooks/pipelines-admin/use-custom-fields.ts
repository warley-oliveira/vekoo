import { useCallback } from "react"
import { useSWRConfig } from "swr"

import { useApi } from "@/hooks/use-api"
import { apiDelete, apiPatch, apiPost } from "@/lib/api"
import type { CustomField, CustomFieldInput } from "@/lib/pipelines-admin/types"
import { boardKey, useRevalidateBoard } from "./use-board"

type FieldsResponse = { customFields: CustomField[] }

function byPosition(fields: CustomField[]) {
  return [...fields].sort((a, b) => a.position - b.position)
}

export function customFieldsKey(boardId: string) {
  return `${boardKey(boardId)}/custom-fields`
}

export function useCustomFields(boardId: string | null | undefined) {
  const { data, error, isLoading, isValidating, mutate } = useApi<FieldsResponse>(
    boardId ? customFieldsKey(boardId) : null
  )

  return {
    fields: data ? byPosition(data.customFields) : undefined,
    error,
    isLoading,
    isValidating,
    reload: () => mutate(),
  }
}

export function useCustomFieldMutations(boardId: string) {
  const { mutate } = useSWRConfig()
  const revalidate = useRevalidateBoard(boardId)
  const base = customFieldsKey(boardId)

  const createField = useCallback(
    async (input: CustomFieldInput) => {
      const field = await apiPost<CustomField>(base, { customField: input })
      await revalidate()
      return field
    },
    [base, revalidate]
  )

  const updateField = useCallback(
    async (id: string, input: CustomFieldInput) => {
      const field = await apiPatch<CustomField>(`${base}/${id}`, { customField: input })
      await revalidate()
      return field
    },
    [base, revalidate]
  )

  const deleteField = useCallback(
    async (id: string) => {
      await apiDelete(`${base}/${id}`)
      await revalidate()
    },
    [base, revalidate]
  )

  /** Otimista: quem arrasta não pode ver a linha voltar enquanto a resposta não chega. */
  const reorderFields = useCallback(
    async (ordered: CustomField[]) => {
      const withPositions = ordered.map((field, index) => ({ ...field, position: index + 1 }))
      await mutate<FieldsResponse>(
        base,
        async () => {
          await apiPost(`${base}/reorder`, { orderedIds: ordered.map((field) => field.id) })
          return { customFields: withPositions }
        },
        {
          optimisticData: { customFields: withPositions },
          rollbackOnError: true,
          revalidate: false,
        }
      )
      void revalidate()
    },
    [base, mutate, revalidate]
  )

  return { createField, updateField, deleteField, reorderFields }
}
