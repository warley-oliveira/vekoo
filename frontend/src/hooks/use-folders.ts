import { useCallback } from "react"
import { useSWRConfig } from "swr"

import { useApi } from "@/hooks/use-api"
import { isCarouselKey } from "@/hooks/use-carousels"
import { apiDelete, apiPatch, apiPost } from "@/lib/api"
import type { Folder } from "@/lib/types"

// As pastas de uma marca. A chave leva a marca: cada marca tem as suas.

export function foldersKey(brandId: string): string {
  return `/folders?brand_id=${brandId}`
}

export function isFoldersKey(key: unknown): key is string {
  return typeof key === "string" && key.startsWith("/folders")
}

type ListResponse = { folders: Folder[] }

export function useFolders(brandId: string | undefined) {
  const { data, error, isLoading, mutate } = useApi<ListResponse>(brandId ? foldersKey(brandId) : null)

  return {
    folders: data?.folders,
    isLoading,
    error,
    reload: () => mutate(),
  }
}

export function useFolderMutations() {
  const { mutate } = useSWRConfig()

  const reload = useCallback(() => mutate(isFoldersKey), [mutate])

  /**
   * Criar **não** é otimista: o id vem do servidor e a tela navega para a
   * pasta logo em seguida — com um id inventado a navegação daria 404.
   * A pasta nasce dentro da marca (`brandId`), como todo conteúdo.
   */
  const createFolder = useCallback(
    async (brandId: string, name: string, color: string): Promise<Folder> => {
      const folder = await apiPost<Folder>("/folders", { folder: { brandId, name, color } })
      await mutate(foldersKey(brandId))
      return folder
    },
    [mutate]
  )

  const renameFolder = useCallback(
    async (id: string, name: string) => {
      await mutate(
        isFoldersKey,
        (current?: ListResponse) =>
          current && {
            folders: current.folders.map((f) => (f.id === id ? { ...f, name } : f)),
          },
        { revalidate: false }
      )
      try {
        await apiPatch(`/folders/${id}`, { folder: { name } })
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
        isFoldersKey,
        (current?: ListResponse) =>
          current && { folders: current.folders.filter((f) => f.id !== id) },
        { revalidate: false }
      )
      try {
        await apiDelete(`/folders/${id}`)
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
