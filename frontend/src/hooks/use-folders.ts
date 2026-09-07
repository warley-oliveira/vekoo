import { useCallback } from "react"
import { useSWRConfig } from "swr"

import { useApi } from "@/hooks/use-api"
import { isCarouselKey } from "@/hooks/use-carousels"
import { apiDelete, apiPatch, apiPost } from "@/lib/api"
import type { Folder } from "@/lib/types"

const KEY = "/folders"

type ListResponse = { folders: Folder[] }

export function useFolders() {
  const { data, error, isLoading, mutate } = useApi<ListResponse>(KEY)

  return {
    folders: data?.folders,
    isLoading,
    error,
    reload: () => mutate(),
  }
}

export function useFolderMutations() {
  const { mutate } = useSWRConfig()

  const reload = useCallback(() => mutate(KEY), [mutate])

  /**
   * Criar **não** é otimista: o id vem do servidor e a tela navega para
   * `/folders/:id` logo em seguida — com um id inventado a navegação daria 404.
   */
  const createFolder = useCallback(
    async (name: string, color: string): Promise<Folder> => {
      const folder = await apiPost<Folder>(KEY, { folder: { name, color } })
      await reload()
      return folder
    },
    [reload]
  )

  const renameFolder = useCallback(
    async (id: string, name: string) => {
      await mutate(
        KEY,
        (current?: ListResponse) =>
          current && {
            folders: current.folders.map((f) => (f.id === id ? { ...f, name } : f)),
          },
        { revalidate: false }
      )
      try {
        await apiPatch(`${KEY}/${id}`, { folder: { name } })
      } catch (error) {
        await reload()
        throw error
      }
    },
    [mutate, reload]
  )

  /**
   * Apagar a pasta não apaga o que está dentro: o Rails põe `folderId: null`
   * nos carrosséis dela, então as listas de carrossel também saem de validade.
   */
  const deleteFolder = useCallback(
    async (id: string) => {
      await mutate(
        KEY,
        (current?: ListResponse) =>
          current && { folders: current.folders.filter((f) => f.id !== id) },
        { revalidate: false }
      )
      try {
        await apiDelete(`${KEY}/${id}`)
        await mutate(isCarouselKey)
      } catch (error) {
        await reload()
        throw error
      }
    },
    [mutate, reload]
  )

  return { createFolder, renameFolder, deleteFolder, reloadFolders: reload }
}
