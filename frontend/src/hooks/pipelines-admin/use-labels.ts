import { useCallback } from "react"

import { useApi } from "@/hooks/use-api"
import { apiDelete, apiPatch, apiPost } from "@/lib/api"
import type { Label } from "@/lib/pipelines-admin/types"

export const PIPELINE_LABELS_KEY = "/pipelines/labels"

type LabelsResponse = { labels: Label[] }
type LabelInput = Pick<Label, "name" | "color">

/** As etiquetas são da organização: a mesma serve em todos os quadros. */
export function useLabels({ enabled = true }: { enabled?: boolean } = {}) {
  const { data, error, isLoading, isValidating, mutate } = useApi<LabelsResponse>(
    enabled ? PIPELINE_LABELS_KEY : null
  )

  const createLabel = useCallback(
    async (input: LabelInput) => {
      const label = await apiPost<Label>(PIPELINE_LABELS_KEY, { label: input })
      await mutate()
      return label
    },
    [mutate]
  )

  const updateLabel = useCallback(
    async (id: string, input: LabelInput) => {
      const label = await apiPatch<Label>(`${PIPELINE_LABELS_KEY}/${id}`, { label: input })
      await mutate()
      return label
    },
    [mutate]
  )

  const deleteLabel = useCallback(
    async (id: string) => {
      await apiDelete(`${PIPELINE_LABELS_KEY}/${id}`)
      await mutate()
    },
    [mutate]
  )

  return {
    labels: data?.labels,
    error,
    isLoading,
    isValidating,
    reload: () => mutate(),
    createLabel,
    updateLabel,
    deleteLabel,
  }
}
