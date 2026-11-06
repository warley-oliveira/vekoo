import { useMemo } from "react"
import { useSWRConfig } from "swr"

import { useApi } from "@/hooks/use-api"
import { apiDelete, apiPatch, apiPost } from "@/lib/api"
import { LABELS_PATH } from "@/lib/pipelines/paths"
import type { Label } from "@/lib/pipelines/types"

type LabelsResponse = { labels: Label[] }

const NO_LABELS: Label[] = []

/** As etiquetas da organização: valem para todos os pipelines. */
export function useLabels() {
  const { data, isLoading, error } = useApi<LabelsResponse>(LABELS_PATH, {
    revalidateOnFocus: false,
  })
  return { labels: data?.labels ?? NO_LABELS, isLoading, error }
}

export function useLabelMutations() {
  const { mutate } = useSWRConfig()

  return useMemo(() => {
    const patchList = (update: (labels: Label[]) => Label[]) =>
      mutate<LabelsResponse>(
        LABELS_PATH,
        (current) => (current ? { ...current, labels: update(current.labels) } : current),
        { revalidate: false }
      )

    return {
      createLabel: async (input: { name: string; color: string }) => {
        const label = await apiPost<Label>(LABELS_PATH, { label: input })
        await patchList((labels) =>
          [...labels, label].sort((a, b) => a.name.localeCompare(b.name))
        )
        return label
      },

      updateLabel: async (id: string, input: { name: string; color: string }) => {
        const label = await apiPatch<Label>(`${LABELS_PATH}/${id}`, { label: input })
        await patchList((labels) => labels.map((item) => (item.id === id ? label : item)))
        return label
      },

      deleteLabel: async (id: string) => {
        await apiDelete(`${LABELS_PATH}/${id}`)
        await patchList((labels) => labels.filter((item) => item.id !== id))
      },
    }
  }, [mutate])
}
