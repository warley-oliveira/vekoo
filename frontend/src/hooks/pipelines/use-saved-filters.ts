import { useMemo } from "react"
import { useSWRConfig } from "swr"

import { useApi } from "@/hooks/use-api"
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api"
import { cardsPath, savedFiltersPath } from "@/lib/pipelines/paths"
import type {
  FilterDefinition,
  PresetFilter,
  SavedFilter,
  SavedFiltersResponse,
  SavedFilterVisibility,
} from "@/lib/pipelines/types"

const NO_PRESETS: PresetFilter[] = []
const NO_FILTERS: SavedFilter[] = []

export type SavedFilterInput = {
  name: string
  visibility: SavedFilterVisibility
  definition: FilterDefinition
}

export type FavoriteTarget = { savedFilterId: string } | { presetKey: string }

export function useSavedFilters(boardId: string) {
  const path = savedFiltersPath(boardId)
  const { data, error, isLoading, mutate } = useApi<SavedFiltersResponse>(path, {
    revalidateOnFocus: false,
  })

  const presets = data?.presets ?? NO_PRESETS
  const filters = data?.filters ?? NO_FILTERS
  const favorites = useMemo<(SavedFilter | PresetFilter)[]>(
    () => [...filters.filter((item) => item.favorite), ...presets.filter((item) => item.favorite)],
    [filters, presets]
  )

  return { presets, filters, favorites, error, isLoading: isLoading && !data, reload: mutate }
}

export function useSavedFilterMutations(boardId: string) {
  const { mutate } = useSWRConfig()
  const path = savedFiltersPath(boardId)

  return useMemo(() => {
    const patch = (update: (data: SavedFiltersResponse) => SavedFiltersResponse) =>
      mutate<SavedFiltersResponse>(path, (current) => (current ? update(current) : current), {
        revalidate: false,
      })

    return {
      createFilter: async (input: SavedFilterInput) => {
        const filter = await apiPost<SavedFilter>(path, { savedFilter: input })
        await patch((data) => ({ ...data, filters: [...data.filters, filter] }))
        return filter
      },

      updateFilter: async (id: string, input: SavedFilterInput) => {
        const filter = await apiPatch<SavedFilter>(`${path}/${id}`, { savedFilter: input })
        await patch((data) => ({
          ...data,
          filters: data.filters.map((item) => (item.id === id ? filter : item)),
        }))
        return filter
      },

      deleteFilter: async (id: string) => {
        await apiDelete(`${path}/${id}`)
        await patch((data) => ({
          ...data,
          filters: data.filters.filter((item) => item.id !== id),
        }))
      },

      /** A estrela responde na hora: se a API recusar, a lista é relida. */
      toggleFavorite: async (target: FavoriteTarget) => {
        const flip = (data: SavedFiltersResponse): SavedFiltersResponse =>
          "savedFilterId" in target
            ? {
                ...data,
                filters: data.filters.map((item) =>
                  item.id === target.savedFilterId ? { ...item, favorite: !item.favorite } : item
                ),
              }
            : {
                ...data,
                presets: data.presets.map((item) =>
                  item.key === target.presetKey ? { ...item, favorite: !item.favorite } : item
                ),
              }

        await patch(flip)
        try {
          await apiPost(`${path}/toggle-favorite`, target)
        } catch (error) {
          await mutate(path)
          throw error
        }
      },

      /** Quantos cards a definição traz, para a prévia do construtor. */
      previewCount: (definition: FilterDefinition, signal?: AbortSignal) =>
        apiGet<{ count: number }>(
          `${cardsPath(boardId)}?countOnly=1&filter=${encodeURIComponent(JSON.stringify(definition))}`,
          { signal }
        ),
    }
  }, [boardId, mutate, path])
}
